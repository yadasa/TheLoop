import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  initializeApp as initializeClient,
  deleteApp as deleteClient,
} from "firebase/app";
import {
  connectAuthEmulator,
  getAuth as getClientAuth,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  connectStorageEmulator,
  getStorage as getClientStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import sharp from "sharp";
import { mediaIdFor } from "../src/media";

const enabled = process.env.THELOOP_MEDIA_INTEGRATION === "1";
const projectId = "demo-theloop-integration";
const firestoreHost =
  process.env.THELOOP_INTEGRATION_FIRESTORE_HOST || "127.0.0.1:53991";
const authHost = process.env.THELOOP_INTEGRATION_AUTH_HOST || "127.0.0.1:9098";
const functionsHost =
  process.env.THELOOP_INTEGRATION_FUNCTIONS_HOST || "127.0.0.1:5019";
const storageHost =
  process.env.THELOOP_INTEGRATION_STORAGE_HOST || "127.0.0.1:9198";
type Actor = { uid: string; token: string; email: string };
class Failure extends Error {
  constructor(
    readonly status: string,
    message: string,
  ) {
    super(message);
  }
}

test(
  "real private image callables and Storage rules preserve source authority without public tokens",
  { skip: !enabled, timeout: 300000 },
  async (t) => {
    assert.equal(
      process.env.THELOOP_INTEGRATION_PROJECT_ID || projectId,
      projectId,
    );
    for (const host of [firestoreHost, authHost, functionsHost, storageHost])
      assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/);
    process.env.GCLOUD_PROJECT = projectId;
    process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost;
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = storageHost;
    const runId = randomUUID().replace(/-/g, "").slice(0, 16),
      password = `Media-${runId}!`;
    const bucketName = `${projectId}.firebasestorage.app`;
    const app = initializeApp(
        { projectId, storageBucket: bucketName },
        `media-${runId}`,
      ),
      db = getFirestore(app),
      auth = getAuth(app),
      bucket = getStorage(app).bucket();
    const client = initializeClient(
      { projectId, apiKey: "demo-key", storageBucket: bucketName },
      `media-client-${runId}`,
    );
    const clientAuth = getClientAuth(client),
      storage = getClientStorage(client);
    connectAuthEmulator(clientAuth, `http://${authHost}`, {
      disableWarnings: true,
    });
    const [storageHostname, storagePort] = storageHost.split(":");
    connectStorageEmulator(storage, storageHostname, Number(storagePort));
    const actors: Actor[] = [],
      created = new Map<string, Set<string>>();
    let sequence = 0;
    const next = () => `media-${runId}-${++sequence}`;
    const remember = (collection: string, id: string) => {
      if (!created.has(collection)) created.set(collection, new Set());
      created.get(collection)!.add(id);
      return id;
    };
    async function callable(
      actor: Actor,
      name: string,
      data: unknown,
    ): Promise<Record<string, any>> {
      const response = await fetch(
        `http://${functionsHost}/${projectId}/us-central1/${name}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${actor.token}`,
          },
          body: JSON.stringify({ data }),
          signal: AbortSignal.timeout(90000),
        },
      );
      const body = (await response.json()) as Record<string, any>;
      if (body.error) throw new Failure(body.error.status, body.error.message);
      assert.ok(response.ok);
      return body.result ?? body.data;
    }
    const command = (actor: Actor, value: Record<string, unknown>) =>
      callable(actor, "executeCommand", { requestId: next(), command: value });
    const denied = (work: Promise<unknown>, status = "PERMISSION_DENIED") =>
      assert.rejects(
        work,
        (error) => error instanceof Failure && error.status === status,
      );
    async function actor(label: string): Promise<Actor> {
      const email = `media-${runId}-${label}@example.test`;
      const response = await fetch(
        `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, returnSecureToken: true }),
          signal: AbortSignal.timeout(20000),
        },
      );
      const body = (await response.json()) as Record<string, string>;
      assert.ok(response.ok && body.idToken && body.localId);
      const result = { uid: body.localId, token: body.idToken, email };
      actors.push(result);
      await callable(result, "bootstrap", { name: `Media ${label}` });
      return result;
    }
    try {
      const rules = await readFile(
        resolve(__dirname, "../../firestore.rules"),
        "utf8",
      );
      const installed = await fetch(
        `http://${firestoreHost}/emulator/v1/projects/${projectId}:securityRules`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rules: { files: [{ content: rules }] } }),
        },
      );
      assert.ok(installed.ok);
      const alice = await actor("alice"),
        bob = await actor("bob"),
        moderator = await actor("moderator");
      await db.doc(`users/${moderator.uid}`).update({ role: "moderator" });
      const channel = remember("channels", next());
      await db.doc(`channels/${channel}`).set({
        id: channel,
        conferenceId: "fixture",
        name: "private-media-fixture",
        visibility: "private",
        memberIds: [alice.uid, bob.uid],
        topics: ["General"],
      });
      const target = { kind: "channel", id: channel };
      const original = await sharp({
        create: { width: 8, height: 4, channels: 3, background: "#333333" },
      })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer();
      const requestId = next(),
        input = {
          target,
          contentType: "image/jpeg",
          base64: original.toString("base64"),
          requestId,
        };
      let image: Record<string, any>, message: string, report: string;

      await t.test(
        "upload re-encodes privately, uses stable ownership/hash idempotency and never stores the original",
        async () => {
          image = (await callable(alice, "uploadMedia", input)).image;
          assert.equal(image.mimeType, "image/webp");
          assert.equal(image.width, 4);
          assert.equal(image.height, 8);
          assert.equal(image.id, mediaIdFor(alice.uid, requestId));
          assert.equal(
            (await callable(alice, "uploadMedia", input)).duplicate,
            true,
          );
          await denied(
            callable(alice, "uploadMedia", {
              ...input,
              target: { kind: "channel", id: "changed" },
            }),
          );
          const media = (
            await db.doc(`privateMedia/${image.id}`).get()
          ).data()!;
          const [metadata] = await bucket
            .file(media.sanitizedPath)
            .getMetadata();
          assert.equal(metadata.contentType, "image/webp");
          assert.equal(
            metadata.metadata?.firebaseStorageDownloadTokens,
            undefined,
          );
          assert.equal(
            (await bucket.getFiles({ prefix: `incoming/${alice.uid}/` }))[0]
              .length,
            0,
          );
          assert.equal(media.base64, undefined);
          assert.equal(media.bytes, undefined);
          await denied(
            callable(alice, "getMedia", { mediaId: image.id }),
            "NOT_FOUND",
          );
        },
      );

      await t.test(
        "authenticated clients cannot upload arbitrary objects, fetch metadata, or mint download URLs",
        async () => {
          await signInWithEmailAndPassword(clientAuth, alice.email, password);
          const media = (
            await db.doc(`privateMedia/${image.id}`).get()
          ).data()!;
          for (const path of [
            `incoming/${alice.uid}/${next()}`,
            `sanitized/${alice.uid}/${next()}.webp`,
          ])
            await assert.rejects(
              uploadBytes(ref(storage, path), new Uint8Array([1, 2, 3]), {
                contentType: "image/png",
              }),
              (error: any) => error.code === "storage/unauthorized",
            );
          await assert.rejects(
            getDownloadURL(ref(storage, media.sanitizedPath)),
            (error: any) => error.code === "storage/unauthorized",
          );
          const response = await fetch(
            `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/privateMedia/${image.id}`,
            { headers: { Authorization: `Bearer ${alice.token}` } },
          );
          assert.equal(response.status, 403);
        },
      );

      await t.test(
        "image linking checks owner and one-use before reads follow exact message membership",
        async () => {
          await denied(
            command(bob, {
              type: "message.send",
              channelId: channel,
              topic: "General",
              body: "Not my image",
              imageId: image.id,
            }),
            "FAILED_PRECONDITION",
          );
          message = remember(
            "messages",
            (
              await command(alice, {
                type: "message.send",
                channelId: channel,
                topic: "General",
                body: "A caption for our private photo.",
                imageId: image.id,
              })
            ).id,
          );
          assert.equal(
            (await db.doc(`users/${alice.uid}`).get()).get("mediaIntents")[
              image.id
            ],
            undefined,
          );
          await denied(
            command(alice, {
              type: "message.send",
              channelId: channel,
              topic: "General",
              body: "Cannot reuse image",
              imageId: image.id,
            }),
            "FAILED_PRECONDITION",
          );
          const returned = await callable(bob, "getMedia", {
            mediaId: image.id,
          });
          const bytes = Buffer.from(returned.base64, "base64"),
            metadata = await sharp(bytes).metadata();
          assert.equal(metadata.format, "webp");
          assert.equal(metadata.exif, undefined);
          assert.equal(metadata.icc, undefined);
          await denied(callable(moderator, "getMedia", { mediaId: image.id }));
          await db
            .doc(`channels/${channel}`)
            .update({ memberIds: [alice.uid] });
          await denied(callable(bob, "getMedia", { mediaId: image.id }));
          await db
            .doc(`channels/${channel}`)
            .update({ memberIds: [alice.uid, bob.uid] });
        },
      );

      await t.test(
        "moderators see only the reported image and deletion immediately revokes even report access",
        async () => {
          report = remember(
            "reports",
            (
              await command(bob, {
                type: "report.create",
                targetType: "message",
                targetId: message,
                reason: "Review the selected message and its image.",
              })
            ).id,
          );
          assert.deepEqual(
            (await db.doc(`reports/${report}`).get()).get("snapshot.image"),
            image,
          );
          assert.equal(
            (
              await callable(moderator, "getMedia", {
                mediaId: image.id,
                reportId: report,
              })
            ).image.id,
            image.id,
          );
          await denied(
            callable(bob, "getMedia", { mediaId: image.id, reportId: report }),
          );
          const second = (
            await callable(alice, "uploadMedia", {
              ...input,
              requestId: next(),
            })
          ).image;
          remember(
            "messages",
            (
              await command(alice, {
                type: "message.send",
                channelId: channel,
                topic: "General",
                body: "Unrelated private image",
                imageId: second.id,
              })
            ).id,
          );
          await denied(
            callable(moderator, "getMedia", {
              mediaId: second.id,
              reportId: report,
            }),
          );
          await command(alice, { type: "message.delete", messageId: message });
          await denied(
            callable(alice, "getMedia", { mediaId: image.id }),
            "NOT_FOUND",
          );
          await denied(
            callable(moderator, "getMedia", {
              mediaId: image.id,
              reportId: report,
            }),
            "NOT_FOUND",
          );
        },
      );

      await t.test(
        "invalid image bytes never become a ready object and failed claims release their upload slot",
        async () => {
          const badRequest = next(),
            bad = {
              ...input,
              requestId: badRequest,
              contentType: "image/png",
              base64: Buffer.from("<svg>untrusted bytes</svg>").toString(
                "base64",
              ),
            };
          await denied(callable(alice, "uploadMedia", bad), "INVALID_ARGUMENT");
          const badId = mediaIdFor(alice.uid, badRequest),
            media = await db.doc(`privateMedia/${badId}`).get();
          assert.equal(media.get("state"), "failed");
          assert.equal(
            (await db.doc(`users/${alice.uid}`).get()).get("mediaIntents")[
              badId
            ],
            undefined,
          );
          assert.equal(
            (
              await bucket.getFiles({
                prefix: `sanitized/${alice.uid}/${badId}/`,
              })
            )[0].length,
            0,
          );
          await denied(
            callable(alice, "uploadMedia", {
              ...input,
              requestId: next(),
              contentType: "image/svg+xml",
            }),
            "INVALID_ARGUMENT",
          );
        },
      );
      await t.test(
        "reply consent applies equally to private image uploads and author deletion revokes image retrieval",
        async () => {
          await command(bob, {
            type: "preferences.update",
            preferences: { dmPolicy: "everyone" },
          });
          await command(alice, {
            type: "preferences.update",
            preferences: { dmPolicy: "nobody" },
          });
          remember(
            "directMessages",
            (
              await command(alice, {
                type: "dm.send",
                userId: bob.uid,
                body: "I choose to contact you.",
              })
            ).id,
          );
          const replyImage = (
            await callable(bob, "uploadMedia", {
              ...input,
              requestId: next(),
              target: { kind: "directMessage", id: alice.uid },
            })
          ).image;
          const reply = remember(
            "directMessages",
            (
              await command(bob, {
                type: "dm.send",
                userId: alice.uid,
                body: "A private photo in reply.",
                imageId: replyImage.id,
              })
            ).id,
          );
          assert.equal(
            (await callable(alice, "getMedia", { mediaId: replyImage.id }))
              .image.id,
            replyImage.id,
          );
          await command(alice, { type: "profile.block", userId: bob.uid });
          await denied(
            command(bob, {
              type: "dm.edit",
              messageId: reply,
              body: "Cannot send new text through edits after blocking.",
            }),
          );
          await command(bob, { type: "dm.delete", messageId: reply });
          await denied(
            callable(alice, "getMedia", { mediaId: replyImage.id }),
            "NOT_FOUND",
          );
        },
      );
    } finally {
      // Cleanup only disposable UID namespaces and IDs created by this exact run.
      for (const actor of actors) {
        const conversations = await db
          .collection("directConversations")
          .where("participantIds", "array-contains", actor.uid)
          .get();
        for (const conversation of conversations.docs)
          await conversation.ref.delete();
        await bucket.deleteFiles({
          prefix: `sanitized/${actor.uid}/`,
          force: true,
        });
        for (const [collection, field] of [
          ["privateMedia", "ownerId"],
          ["notifications", "userId"],
          ["reports", "reporterId"],
          ["moderationAudit", "actorId"],
        ]) {
          const rows = await db
            .collection(collection)
            .where(field, "==", actor.uid)
            .get();
          for (const row of rows.docs) await row.ref.delete();
        }
        await db.recursiveDelete(db.doc(`users/${actor.uid}`));
        await db.doc(`profiles/${actor.uid}`).delete();
        await db.doc(`trustSignals/${actor.uid}`).delete();
        await auth.deleteUser(actor.uid).catch((error) => {
          if (error.code !== "auth/user-not-found") throw error;
        });
      }
      for (const [collection, ids] of created)
        for (const id of ids)
          await db.recursiveDelete(db.doc(`${collection}/${id}`));
      await deleteClient(client);
      await deleteApp(app);
    }
  },
);
