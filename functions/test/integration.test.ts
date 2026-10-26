import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

/**
 * Run only against a dedicated emulator project, never production.
 * Defaults: demo-theloop-integration; functions 5019, auth 9098, Firestore 8188.
 * Start matching emulators, then set THELOOP_INTEGRATION=1 and run:
 * pnpm --filter @theloop/functions exec tsx --test test/integration.test.ts
 * All accounts and documents created here are ephemeral and cleaned up by UID/ID.
 */
const enabled = process.env.THELOOP_INTEGRATION === "1";
const projectId =
  process.env.THELOOP_INTEGRATION_PROJECT_ID || "demo-theloop-integration";
const functionsHost =
  process.env.THELOOP_INTEGRATION_FUNCTIONS_HOST || "127.0.0.1:5019";
const authHost = process.env.THELOOP_INTEGRATION_AUTH_HOST || "127.0.0.1:9098";
const firestoreHost =
  process.env.THELOOP_INTEGRATION_FIRESTORE_HOST || "127.0.0.1:8188";
type TestActor = { uid: string; token: string };
class CallableFailure extends Error {
  constructor(
    public status: string,
    message: string,
  ) {
    super(message);
  }
}

test(
  "two real emulator accounts enforce callable state transitions and Firestore privacy",
  { skip: !enabled, timeout: 180_000 },
  async (t) => {
    assert.equal(
      projectId,
      "demo-theloop-integration",
      "Integration tests are restricted to the demo-theloop-integration namespace.",
    );
    for (const host of [functionsHost, authHost, firestoreHost])
      assert.match(
        host,
        /^(127\.0\.0\.1|localhost):\d+$/,
        "Only loopback emulators are allowed.",
      );
    // These process-local overrides prevent Admin SDK traffic from reaching any cloud project.
    process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost;
    const runId = randomUUID().replace(/-/g, "").slice(0, 16);
    const app = initializeApp({ projectId }, `theloop-integration-${runId}`);
    const db = getFirestore(app),
      auth = getAuth(app);
    const actors: TestActor[] = [];
    const created = new Map<string, Set<string>>();
    let sequence = 0;
    const nextId = () => `qa-${runId}-${++sequence}`;
    const remember = (collection: string, id: string) => {
      if (!created.has(collection)) created.set(collection, new Set());
      created.get(collection)!.add(id);
      return id;
    };
    const fetchJSON = async (url: string, options: RequestInit) => {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(20_000),
      });
      const body = (await response.json()) as Record<string, any>;
      return { response, body };
    };
    async function createActor(label: string): Promise<TestActor> {
      const { response, body } = await fetchJSON(
        `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: `theloop-${runId}-${label}@example.test`,
            password: `Testing-${runId}!`,
            returnSecureToken: true,
          }),
        },
      );
      assert.ok(
        response.ok && body.localId && body.idToken,
        `Emulator signup failed: ${JSON.stringify(body.error ?? { status: response.status })}`,
      );
      const actor = { uid: String(body.localId), token: String(body.idToken) };
      actors.push(actor);
      await callable(actor, "bootstrap", { name: `Integration ${label}` });
      return actor;
    }
    async function callable(
      actor: TestActor,
      name: string,
      data: unknown,
    ): Promise<Record<string, any>> {
      const { response, body } = await fetchJSON(
        `http://${functionsHost}/${projectId}/us-central1/${name}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${actor.token}`,
          },
          body: JSON.stringify({ data }),
        },
      );
      if (body.error)
        throw new CallableFailure(
          String(body.error.status),
          String(body.error.message),
        );
      assert.ok(
        response.ok,
        `Callable ${name} failed: ${JSON.stringify(body)}`,
      );
      return body.result ?? body.data ?? body;
    }
    const command = (
      actor: TestActor,
      command: Record<string, unknown>,
      requestId = nextId(),
    ) => callable(actor, "executeCommand", { command, requestId });
    const denied = async (
      operation: Promise<unknown>,
      statuses = ["PERMISSION_DENIED"],
    ) =>
      assert.rejects(
        operation,
        (error) =>
          error instanceof CallableFailure && statuses.includes(error.status),
      );
    const readDocument = (actor: TestActor, path: string) =>
      fetchJSON(
        `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${path}`,
        { headers: { Authorization: `Bearer ${actor.token}` } },
      );
    let alice: TestActor, bob: TestActor;
    try {
      // Load only this repository's rules into the explicitly isolated test namespace.
      // No database-wide clear is used, including on shared emulator hosts.
      const rules = await readFile(resolve(__dirname, "../../firestore.rules"), "utf8");
      const rulesResponse = await fetch(`http://${firestoreHost}/emulator/v1/projects/${projectId}:securityRules`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: { files: [{ content: rules }] } }), signal: AbortSignal.timeout(20_000),
      });
      assert.ok(rulesResponse.ok, `Could not install isolated test rules: ${rulesResponse.status}`);
      alice = await createActor("alice");
      bob = await createActor("bob");
      await db.doc(`users/${alice.uid}`).update({ role: "admin" });
      const tomorrow = new Date(Date.now() + 86_400_000)
        .toISOString()
        .slice(0, 10);
      const dayAfter = new Date(Date.now() + 172_800_000)
        .toISOString()
        .slice(0, 10);
      const conference = remember(
        "conferences",
        (
          await command(alice, {
            type: "conference.create",
            conference: {
              name: `Integration ${runId}`,
              shortName: "QA",
              city: "Test city",
              startDate: tomorrow,
              endDate: dayAfter,
              description: "Ephemeral integration fixture.",
              tagline: "Testing only",
            },
          })
        ).id,
      );
      const channel = remember(
        "channels",
        (
          await command(alice, {
            type: "channel.create",
            channel: {
              conferenceId: conference,
              name: `qa-${runId}`,
              description: "Private integration fixture.",
              visibility: "private",
              topics: ["General"],
              memberIds: [],
            },
          })
        ).id,
      );
      const firstMessage = remember(
        "messages",
        (
          await command(alice, {
            type: "message.send",
            channelId: channel,
            topic: "General",
            body: "An ephemeral private conversation.",
          })
        ).id,
      );

      await t.test(
        "private channel membership is enforced by both callable and direct reads",
        async () => {
          await denied(
            command(bob, {
              type: "message.send",
              channelId: channel,
              topic: "General",
              body: "Not a member yet.",
            }),
          );
          await denied(
            command(bob, {
              type: "message.react",
              messageId: firstMessage,
              emoji: "🖤",
            }),
          );
          assert.equal(
            (await readDocument(bob, `messages/${firstMessage}`)).response
              .status,
            403,
          );
          await command(alice, {
            type: "channel.member",
            channelId: channel,
            userId: bob.uid,
            add: true,
          });
          assert.equal(
            (await readDocument(bob, `messages/${firstMessage}`)).response
              .status,
            200,
          );
        },
      );

      await t.test(
        "sending and replying never erase an explicit topic mute; retries are idempotent",
        async () => {
          await command(bob, {
            type: "subscription.set",
            targetId: `${channel}:General`,
            value: "muted",
          });
          const requestId = nextId(),
            payload = {
              type: "message.send",
              channelId: channel,
              topic: "General",
              body: "A reply with a stable request ID.",
              replyTo: firstMessage,
            };
          remember("messages", (await command(bob, payload, requestId)).id);
          assert.equal(
            (await command(bob, payload, requestId)).duplicate,
            true,
          );
          assert.equal(
            (await db.doc(`users/${bob.uid}`).get()).get(
              "preferences.subscriptions",
            )[`${channel}:General`],
            "muted",
          );
          const messages = await db
            .collection("messages")
            .where("authorId", "==", bob.uid)
            .get();
          assert.equal(
            messages.docs.filter((doc) => doc.get("body") === payload.body)
              .length,
            1,
          );
          await denied(
            command(bob, {
              type: "message.send",
              channelId: channel,
              topic: "Unregistered topic",
              body: "Cannot bypass topic creation.",
            }),
            ["INVALID_ARGUMENT", "FAILED_PRECONDITION"],
          );
        },
      );

      await t.test(
        "profile authority and private profile grants survive the full connection lifecycle",
        async () => {
          assert.equal((await readDocument(bob, `users/${bob.uid}`)).response.status, 200);
          assert.equal((await readDocument(bob, `users/${alice.uid}`)).response.status, 403);
          const forgedRole = await fetchJSON(`http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/users/${bob.uid}?updateMask.fieldPaths=role`, {
            method: "PATCH", headers: { Authorization: `Bearer ${bob.token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ fields: { role: { stringValue: "admin" } } }),
          });
          assert.equal(forgedRole.response.status, 403, "an owner cannot directly grant their account a role");
          const previous = (await db.doc(`profiles/${bob.uid}`).get()).get(
            "trust",
          );
          await denied(
            command(bob, {
              type: "profile.update",
              profile: { trust: { score: 100 }, verified: true, role: "admin" },
            }),
            ["INVALID_ARGUMENT", "PERMISSION_DENIED"],
          );
          assert.deepEqual(
            (await db.doc(`profiles/${bob.uid}`).get()).get("trust"),
            previous,
          );
          await command(bob, {
            type: "profile.update",
            profile: { visibility: "connections" },
          });
          assert.equal(
            (await readDocument(alice, `profiles/${bob.uid}`)).response.status,
            403,
          );
          const connection = remember(
            "connections",
            (
              await command(alice, {
                type: "connection.request",
                userId: bob.uid,
              })
            ).id,
          );
          await denied(
            command(alice, {
              type: "connection.respond",
              connectionId: connection,
              accept: true,
            }),
          );
          await command(bob, {
            type: "connection.respond",
            connectionId: connection,
            accept: true,
          });
          assert.equal(
            (await readDocument(alice, `profiles/${bob.uid}`)).response.status,
            200,
          );
        },
      );

      await t.test(
        "authoritative follows count a stable retry once and use directional edges",
        async () => {
          const requestId = nextId();
          await command(
            alice,
            { type: "profile.follow", userId: bob.uid },
            requestId,
          );
          assert.equal(
            (
              await command(
                alice,
                { type: "profile.follow", userId: bob.uid },
                requestId,
              )
            ).duplicate,
            true,
          );
          await command(bob, { type: "profile.follow", userId: alice.uid });
          const aliceEdge = `${alice.uid}~${bob.uid}`,
            bobEdge = `${bob.uid}~${alice.uid}`;
          remember("follows", aliceEdge);
          remember("follows", bobEdge);
          assert.ok((await db.doc(`follows/${aliceEdge}`).get()).exists);
          assert.ok((await db.doc(`follows/${bobEdge}`).get()).exists);
          const aliceProfile = await db.doc(`profiles/${alice.uid}`).get(),
            bobProfile = await db.doc(`profiles/${bob.uid}`).get();
          assert.equal(aliceProfile.get("followingCount"), 1);
          assert.equal(aliceProfile.get("followerCount"), 1);
          assert.equal(bobProfile.get("followingCount"), 1);
          assert.equal(bobProfile.get("followerCount"), 1);
        },
      );

      await t.test(
        "DM privacy follows recipient policy and receipts prevent duplicate sends",
        async () => {
          const requestId = nextId(),
            payload = {
              type: "dm.send",
              userId: bob.uid,
              body: "A private integration hello.",
            };
          remember(
            "directMessages",
            (await command(alice, payload, requestId)).id,
          );
          assert.equal(
            (await command(alice, payload, requestId)).duplicate,
            true,
          );
          await command(bob, {
            type: "preferences.update",
            preferences: { dmPolicy: "nobody" },
          });
          await denied(
            command(alice, { ...payload, body: "Recipient opted out." }),
          );
          await command(bob, {
            type: "preferences.update",
            preferences: { dmPolicy: "connections" },
          });
        },
      );

      await t.test(
        "RSVP capacity and FIFO promotion are authoritative across accounts",
        async () => {
          const startAt = new Date(Date.now() + 3_600_000).toISOString(),
            endAt = new Date(Date.now() + 7_200_000).toISOString();
          const event = remember(
            "events",
            (
              await command(alice, {
                type: "event.create",
                event: {
                  conferenceId: conference,
                  title: `QA event ${runId}`,
                  description: "Temporary integration plan.",
                  startAt,
                  endAt,
                  timezone: "UTC",
                  location: "Emulator only",
                  kind: "meetup",
                  capacity: 1,
                  tags: ["Testing"],
                },
              })
            ).id,
          );
          const requestId = nextId();
          await command(bob, { type: "event.rsvp", eventId: event }, requestId);
          assert.equal(
            (
              await command(
                bob,
                { type: "event.rsvp", eventId: event },
                requestId,
              )
            ).duplicate,
            true,
          );
          assert.deepEqual(
            (await db.doc(`events/${event}`).get()).get("waitlistIds"),
            [bob.uid],
          );
          await command(alice, { type: "event.rsvp", eventId: event });
          const promoted = await db.doc(`events/${event}`).get();
          assert.deepEqual(promoted.get("attendeeIds"), [bob.uid]);
          assert.deepEqual(promoted.get("waitlistIds"), []);
          await command(alice, {
            type: "event.checkin",
            eventId: event,
            userId: bob.uid,
          });
          await denied(
            command(alice, {
              type: "event.checkin",
              eventId: event,
              userId: bob.uid,
            }),
            ["ALREADY_EXISTS"],
          );
        },
      );

      await t.test(
        "communities require membership, repeated votes toggle once, and only moderators review reports",
        async () => {
          const community = remember(
            "communities",
            (
              await command(alice, {
                type: "community.create",
                name: `QA ${runId}`,
                description: "Temporary integration circle.",
              })
            ).id,
          );
          await denied(
            command(bob, {
              type: "post.create",
              communityId: community,
              title: "Not joined",
              body: "Join first.",
              kind: "discussion",
            }),
          );
          await command(bob, {
            type: "community.join",
            communityId: community,
          });
          const post = remember(
            "posts",
            (
              await command(bob, {
                type: "post.create",
                communityId: community,
                title: "A temporary conversation",
                body: "This content only exists for integration verification.",
                kind: "discussion",
              })
            ).id,
          );
          await command(alice, { type: "post.vote", postId: post, value: 1 });
          await command(alice, { type: "post.vote", postId: post, value: 1 });
          assert.equal(
            (await db.doc(`posts/${post}`).get()).get("votes")[alice.uid],
            undefined,
          );
          const alicePost = remember("posts", (await command(alice, {
            type: "post.create", communityId: community, title: "Alice's original post",
            body: "Original author text must not be copied into Bob's contribution export.", kind: "discussion",
          })).id);
          await command(alice, { type: "post.comment", postId: alicePost, body: "Alice's separate comment stays out of Bob's export." });
          await command(bob, { type: "post.comment", postId: alicePost, body: "Bob's own contribution is exportable." });
          await command(bob, { type: "post.vote", postId: alicePost, value: 1 });
          assert.ok((await db.doc(`posts/${alicePost}`).get()).get("contributorIds").includes(bob.uid));
          const contributionExport = await callable(bob, "exportAccount", { collection: "contributions" });
          const exportedContribution = contributionExport.records.find((record: Record<string, unknown>) => record.postId === alicePost);
          assert.ok(exportedContribution, "server-maintained contributor index finds Bob's activity");
          assert.equal(exportedContribution.vote, 1);
          assert.deepEqual(exportedContribution.comments.map((comment: Record<string, unknown>) => comment.body), ["Bob's own contribution is exportable."]);
          assert.equal(exportedContribution.body, undefined); assert.equal(exportedContribution.title, undefined);
          assert.ok(!JSON.stringify(exportedContribution).includes("Alice's separate comment"));
          const report = remember(
            "reports",
            (
              await command(bob, {
                type: "report.create",
                targetId: firstMessage,
                targetType: "message",
                reason:
                  "An integration report to verify moderation permissions.",
              })
            ).id,
          );
          assert.equal(
            (await readDocument(bob, `reports/${report}`)).response.status,
            200,
          );
          await denied(
            command(bob, {
              type: "report.review",
              reportId: report,
              outcome: "dismiss",
              note: "Not a moderator.",
            }),
          );
          await command(alice, {
            type: "report.review",
            reportId: report,
            outcome: "dismiss",
            note: "Integration fixture reviewed.",
          });
          assert.equal(
            (await db.doc(`reports/${report}`).get()).get("status"),
            "reviewed",
          );
        },
      );

      await t.test(
        "blocking revokes profile grants, both follow edges, and messages in both directions",
        async () => {
          await command(alice, { type: "profile.block", userId: bob.uid });
          assert.equal(
            (await readDocument(alice, `profiles/${bob.uid}`)).response.status,
            403,
          );
          await denied(
            command(alice, {
              type: "dm.send",
              userId: bob.uid,
              body: "Blocked interaction.",
            }),
          );
          await denied(
            command(bob, {
              type: "dm.send",
              userId: alice.uid,
              body: "Blocked interaction in reverse.",
            }),
          );
          assert.ok(
            !(await db.doc(`follows/${alice.uid}~${bob.uid}`).get()).exists,
          );
          assert.ok(
            !(await db.doc(`follows/${bob.uid}~${alice.uid}`).get()).exists,
          );
          const aliceProfile = await db.doc(`profiles/${alice.uid}`).get(),
            bobProfile = await db.doc(`profiles/${bob.uid}`).get();
          assert.equal(aliceProfile.get("followingCount"), 0);
          assert.equal(aliceProfile.get("followerCount"), 0);
          assert.equal(bobProfile.get("followingCount"), 0);
          assert.equal(bobProfile.get("followerCount"), 0);
        },
      );
    } finally {
      // No database-wide clear: cleanup is restricted to this run's IDs and ephemeral UIDs.
      for (const [collection, ids] of created)
        for (const id of ids)
          await db.recursiveDelete(db.doc(`${collection}/${id}`));
      for (const actor of actors) {
        for (const [collection, field, operator] of [["notifications", "userId", "=="], ["reports", "reporterId", "=="], ["follows", "participantIds", "array-contains"], ["connections", "participantIds", "array-contains"]] as const) {
          const rows = await db
            .collection(collection)
            .where(field, operator, actor.uid)
            .get();
          for (const row of rows.docs) await row.ref.delete();
        }
        for (const path of [`profileAccess/${actor.uid}`, `users/${actor.uid}`])
          await db.recursiveDelete(db.doc(path));
        await db.doc(`profiles/${actor.uid}`).delete();
        await db.doc(`trustSignals/${actor.uid}`).delete();
        await auth.deleteUser(actor.uid).catch((error) => {
          if (error.code !== "auth/user-not-found") throw error;
        });
      }
      await deleteApp(app);
    }
  },
);
