import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "node:crypto";
import {
  DocumentReference,
  FieldPath,
  getFirestore,
  Transaction,
} from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import {
  CallableRequest,
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  bootstrap as bootstrapAccount,
  execute,
  Actor,
  TransactionStore,
} from "./service";
import {
  assert,
  calculateTrust,
  Doc,
  DomainError,
  id,
  pairId,
  text,
} from "./policy";
import { shouldDeliverPush } from "./notifications";
import { scrubCommunityOwner, scrubPost, scrubReactions } from "./cleanup";
import { exportCursor, projectContribution } from "./contributions";
import {
  detachDeletedSquadMember,
  expireSquadInvitation,
  revokeDeletedSquadInvitation,
} from "./squads";
import {
  authorizeMediaRead,
  claimMediaUpload,
  finishMedia,
  MAX_IMAGE_BYTES,
  mediaNeedsCleanup,
  mediaUploadInput,
} from "./media";
import { sanitizeImage } from "./imageCodec";
import { directMessageRead, migrateDirectMessage } from "./directConversations";

export { sendCommunityDigests, sendEventReminders } from "./workers";

initializeApp();
setGlobalOptions({
  region: "us-central1",
  maxInstances: 5,
  memory: "256MiB",
  timeoutSeconds: 60,
});
const db = getFirestore();
const callableOptions = {
  enforceAppCheck: process.env.THELOOP_ENFORCE_APP_CHECK === "true",
  consumeAppCheckToken: false,
};

function actor(request: CallableRequest): Actor {
  if (!request.auth)
    throw new HttpsError("unauthenticated", "Sign in to TheLoop to continue.");
  return {
    uid: request.auth.uid,
    emailVerified: request.auth.token.email_verified === true,
    name:
      typeof request.auth.token.name === "string"
        ? request.auth.token.name
        : undefined,
  };
}
function domainError(error: unknown): never {
  if (error instanceof DomainError)
    throw new HttpsError(error.code, error.message);
  if (error instanceof HttpsError) throw error;
  // Do not leak document paths, private data or service credentials in responses.
  throw new HttpsError(
    "internal",
    "TheLoop could not complete that action. Please try again.",
  );
}
class FirestoreTransactionStore implements TransactionStore {
  private pending = new Map<string, Doc | null>();
  constructor(private tx: Transaction) {}
  async get(path: string): Promise<Doc | undefined> {
    if (this.pending.has(path)) return this.pending.get(path) || undefined;
    const result = await this.tx.get(db.doc(path));
    return result.exists ? result.data() : undefined;
  }
  async find(
    collection: string,
    field: string,
    value: unknown,
    limit: number,
    secondary?: { field: string; value: unknown },
  ): Promise<Doc[]> {
    let query = db.collection(collection).where(field, "==", value);
    if (secondary) query = query.where(secondary.field, "==", secondary.value);
    const result = await this.tx.get(query.limit(limit));
    return result.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }
  set(path: string, value: Doc): void {
    this.pending.set(path, value);
  }
  remove(path: string): void {
    this.pending.set(path, null);
  }
  commit(): void {
    for (const [path, value] of this.pending) {
      if (value) this.tx.set(db.doc(path), value);
      else this.tx.delete(db.doc(path));
    }
  }
}
async function transaction<T>(
  work: (store: TransactionStore) => Promise<T>,
): Promise<T> {
  return db.runTransaction(async (tx) => {
    const store = new FirestoreTransactionStore(tx);
    const result = await work(store);
    store.commit();
    return result;
  });
}

function mediaBucket() {
  const project =
    process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "";
  assert(
    !project.startsWith("demo-") ||
      Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST),
    "failed-precondition",
    "The local image storage emulator is not connected.",
  );
  let configuredBucket: string | undefined;
  try {
    configuredBucket = JSON.parse(
      process.env.FIREBASE_CONFIG || "{}",
    ).storageBucket;
  } catch {
    /* A path-based Firebase config can use the explicit bucket setting. */
  }
  return getStorage().bucket(
    process.env.THELOOP_STORAGE_BUCKET ||
      configuredBucket ||
      `${project}.firebasestorage.app`,
  );
}

export const uploadMedia = onCall(
  {
    ...callableOptions,
    memory: "512MiB",
    timeoutSeconds: 120,
    concurrency: 1,
    maxInstances: 3,
    cpu: 1,
  },
  async (request) => {
    const identity = actor(request);
    let claim: Doc | undefined,
      outputPath: string | undefined,
      finished = false,
      bucket: ReturnType<typeof mediaBucket> | undefined;
    const claimId = randomUUID();
    try {
      const input = mediaUploadInput(request.data);
      bucket = mediaBucket();
      claim = await transaction((store) =>
        claimMediaUpload(
          store,
          identity.uid,
          input,
          claimId,
          new Date().toISOString(),
        ),
      );
      if (claim.complete) return { image: claim.image, duplicate: true };
      const bytes = Buffer.from(input.base64, "base64");
      assert(
        bytes.length === input.sourceSize &&
          bytes.toString("base64") === input.base64,
        "invalid-argument",
        "Use canonical base64 image bytes without a data URL prefix.",
      );
      const sanitized = await sanitizeImage(bytes, input.contentType, claim.id);
      outputPath = `sanitized/${identity.uid}/${claim.id}/${claimId}.webp`;
      await bucket.file(outputPath).save(sanitized.bytes, {
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: {
          contentType: "image/webp",
          cacheControl: "private, no-store",
          metadata: { theloopMediaId: claim.id },
        },
      });
      finished = await transaction((store) =>
        finishMedia(
          store,
          identity.uid,
          claim!.id,
          claimId,
          new Date().toISOString(),
          { image: sanitized.image, sanitizedPath: outputPath! },
        ),
      );
      assert(
        finished,
        "failed-precondition",
        "This image processing request expired. Please try again.",
      );
      return { image: sanitized.image };
    } catch (error) {
      if (claim && !claim.complete && !finished) {
        if (outputPath && bucket)
          await bucket
            .file(outputPath)
            .delete({ ignoreNotFound: true })
            .catch(() => undefined);
        await transaction((store) =>
          finishMedia(
            store,
            identity.uid,
            claim!.id,
            claimId,
            new Date().toISOString(),
          ),
        ).catch(() => undefined);
      }
      return domainError(error);
    }
  },
);

export const getMedia = onCall(
  {
    ...callableOptions,
    memory: "256MiB",
    timeoutSeconds: 30,
    concurrency: 10,
    maxInstances: 3,
  },
  async (request) => {
    const identity = actor(request);
    try {
      assert(
        request.data &&
          typeof request.data === "object" &&
          Object.keys(request.data).every((key) =>
            ["mediaId", "reportId"].includes(key),
          ),
        "invalid-argument",
        "Provide an image ID and optional moderation report.",
      );
      const media = await transaction((store) =>
        authorizeMediaRead(
          store,
          identity.uid,
          request.data.mediaId,
          new Date().toISOString(),
          request.data.reportId,
        ),
      );
      const [bytes] = await mediaBucket().file(media.sanitizedPath).download();
      assert(
        bytes.length === media.image.size && bytes.length <= MAX_IMAGE_BYTES,
        "not-found",
        "This image is no longer available.",
      );
      return { image: media.image, base64: bytes.toString("base64") };
    } catch (error) {
      if ((error as Doc)?.code === 404)
        return domainError(
          new DomainError("not-found", "This image is no longer available."),
        );
      return domainError(error);
    }
  },
);

async function removePrivateMedia(
  mediaId: string,
  now: string,
  forceOwner?: string,
): Promise<void> {
  const media = await transaction(async (store) => {
    const current = await store.get(`privateMedia/${mediaId}`);
    if (!current || (forceOwner && current.ownerId !== forceOwner)) return;
    const source = [
      "messages",
      "posts",
      "squadMessages",
      "directMessages",
    ].includes(current.linkedCollection)
      ? await store.get(`${current.linkedCollection}/${id(current.linkedId)}`)
      : undefined;
    if (!forceOwner && !mediaNeedsCleanup(current, source, now)) return;
    const user = await store.get(`users/${current.ownerId}`);
    if (user) {
      const intents = { ...user.mediaIntents };
      delete intents[mediaId];
      store.set(`users/${current.ownerId}`, { ...user, mediaIntents: intents });
    }
    const deferred =
      current.deferCleanupUntil ||
      (current.state === "processing" &&
      Date.parse(current.claimUntil) > Date.parse(now)
        ? current.claimUntil
        : undefined);
    const marked: Doc = {
      ...current,
      state: "deleting",
      ...(deferred ? { deferCleanupUntil: deferred } : {}),
    };
    store.set(`privateMedia/${mediaId}`, marked);
    return marked;
  });
  if (!media) return;
  // Only this server's bounded owner/image namespace can be deleted; retries also clear
  // a sanitized object left by a terminated processing attempt.
  const prefix = `sanitized/${id(media.ownerId)}/${id(media.id)}/`;
  await mediaBucket().deleteFiles({ prefix, force: true });
  // An account may be deleted while its isolated encoder is still running. Retain a
  // short tombstone until that claim expires so a late output is swept again.
  if (Date.parse(media.deferCleanupUntil || "") > Date.parse(now)) return;
  await transaction(async (store) => {
    const current = await store.get(`privateMedia/${mediaId}`);
    if (current?.state === "deleting") store.remove(`privateMedia/${mediaId}`);
  });
}

export const cleanupPrivateMedia = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "UTC",
    timeoutSeconds: 540,
    memory: "256MiB",
    maxInstances: 1,
  },
  async () => {
    const now = new Date().toISOString();
    for (let page = 0; page < 5; page++) {
      const expired = await db
        .collection("privateMedia")
        .where("unlinked", "==", true)
        .where("expiresAt", "<=", now)
        .orderBy("expiresAt")
        .limit(100)
        .get();
      if (expired.empty) break;
      for (const media of expired.docs) await removePrivateMedia(media.id, now);
      if (expired.size < 100) break;
    }
    const checkpoint = db.doc("system/mediaCleanup"),
      cursor = (await checkpoint.get()).get("cursor");
    let query = db
      .collection("privateMedia")
      .orderBy(FieldPath.documentId())
      .limit(100);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    for (const media of page.docs) await removePrivateMedia(media.id, now);
    await checkpoint.set({
      cursor: page.size === 100 ? page.docs.at(-1)!.id : null,
      updatedAt: now,
    });
  },
);

export const expireSquadInvites = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "UTC",
    timeoutSeconds: 540,
    memory: "256MiB",
    maxInstances: 1,
  },
  async () => {
    const now = new Date().toISOString();
    // A bounded run resumes naturally from the earliest still-pending reservation next tick.
    for (let page = 0; page < 20; page++) {
      const expired = await db
        .collection("squadInvites")
        .where("status", "==", "pending")
        .where("expiresAt", "<=", now)
        .orderBy("expiresAt")
        .limit(100)
        .get();
      if (expired.empty) break;
      for (const invite of expired.docs)
        await transaction((store) =>
          expireSquadInvitation(store, invite.id, now),
        );
      if (expired.size < 100) break;
    }
  },
);

export const bootstrap = onCall(callableOptions, async (request) => {
  const identity = actor(request);
  try {
    return await transaction((store) =>
      bootstrapAccount(
        store,
        identity,
        new Date().toISOString(),
        request.data?.name,
      ),
    );
  } catch (error) {
    return domainError(error);
  }
});

export const executeCommand = onCall(callableOptions, async (request) => {
  const identity = actor(request);
  try {
    const payload = request.data;
    assert(
      payload && typeof payload === "object",
      "invalid-argument",
      "Invalid request.",
    );
    assert(
      JSON.stringify(payload).length < 24000,
      "invalid-argument",
      "That action is too large.",
    );
    return await transaction((store) =>
      execute(
        store,
        identity,
        { requestId: payload.requestId, command: payload.command },
        new Date().toISOString(),
      ),
    );
  } catch (error) {
    return domainError(error);
  }
});

export const getTrust = onCall(callableOptions, async (request) => {
  const identity = actor(request);
  try {
    const targetId = id(request.data?.userId || identity.uid);
    const snapshot = await db.runTransaction(async (tx) => {
      const [profile, signals, connection, privateUser] = await Promise.all([
        tx.get(db.doc(`profiles/${targetId}`)),
        tx.get(db.doc(`trustSignals/${targetId}`)),
        tx.get(db.doc(`connections/${pairId(identity.uid, targetId)}`)),
        tx.get(db.doc(`users/${identity.uid}`)),
      ]);
      assert(
        privateUser.exists &&
          !privateUser.get("disabled") &&
          !privateUser.get("deletionPending"),
        "permission-denied",
        "This account is unavailable.",
      );
      assert(profile.exists, "not-found", "Member not found.");
      assert(
        targetId === identity.uid ||
          profile.get("visibility") === "public" ||
          connection.get("status") === "accepted",
        "permission-denied",
        "This profile is visible to connections only.",
      );
      const serverSignals = {
        ...signals.data(),
        ...(targetId === identity.uid
          ? { emailVerified: identity.emailVerified }
          : {}),
      };
      const trust = calculateTrust(
        profile.data()!,
        serverSignals,
        new Date().toISOString(),
      );
      if (JSON.stringify(profile.get("trust")) !== JSON.stringify(trust))
        tx.update(profile.ref, { trust });
      if (
        targetId === identity.uid &&
        signals.get("emailVerified") !== identity.emailVerified
      )
        tx.set(signals.ref, serverSignals);
      return { trust, verified: profile.get("verified") === true };
    });
    return {
      userId: targetId,
      ...snapshot,
      explanation:
        "Trust reflects account history and verifiable community signals. It is not a background check, professional credential, identity guarantee, or ranking of personal worth. Reports never reduce trust before moderator review.",
      appealAvailable: targetId === identity.uid,
    };
  } catch (error) {
    return domainError(error);
  }
});

export const appealTrust = onCall(callableOptions, async (request) => {
  const identity = actor(request);
  try {
    const reason = text(request.data?.reason, "Appeal reason", 2000, 20);
    const appealId = `${identity.uid}_${new Date().toISOString().slice(0, 10)}`;
    const ref = db.doc(`trustAppeals/${appealId}`);
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      assert(
        !existing.exists,
        "resource-exhausted",
        "Your appeal is already in the review queue.",
      );
      tx.set(ref, {
        id: appealId,
        userId: identity.uid,
        reason,
        status: "open",
        createdAt: new Date().toISOString(),
      });
    });
    return { ok: true, id: appealId };
  } catch (error) {
    return domainError(error);
  }
});

export const registerPushToken = onCall(callableOptions, async (request) => {
  const identity = actor(request);
  try {
    const token = text(request.data?.token, "Push token", 250);
    assert(
      /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(token),
      "invalid-argument",
      "Use a valid Expo push token.",
    );
    const tokenId = Buffer.from(token).toString("base64url");
    const user = await db.doc(`users/${identity.uid}`).get();
    assert(
      user.exists && !user.get("disabled"),
      "failed-precondition",
      "Complete account setup first.",
    );
    if (request.data?.remove === true)
      await db.doc(`users/${identity.uid}/pushTokens/${tokenId}`).delete();
    else {
      const current = await db
        .collection(`users/${identity.uid}/pushTokens`)
        .limit(11)
        .get();
      assert(
        current.size < 10 || current.docs.some((doc) => doc.id === tokenId),
        "resource-exhausted",
        "Maximum registered devices reached.",
      );
      const platform = text(
        request.data?.platform || "unknown",
        "Platform",
        20,
      );
      await db
        .doc(`users/${identity.uid}/pushTokens/${tokenId}`)
        .set({ token, platform, updatedAt: new Date().toISOString() });
    }
    return { ok: true };
  } catch (error) {
    return domainError(error);
  }
});

export const deliverPushNotification = onDocumentCreated(
  "notifications/{notificationId}",
  async (event) => {
    const notification = event.data?.data();
    if (!notification) return;
    const user = await db.doc(`users/${notification.userId}`).get();
    if (!user.exists || user.get("disabled") || user.get("deletionPending"))
      return;
    const prefs = user.get("preferences") || {};
    // Quiet hours are interpreted in the member's selected timezone; absent/invalid zones use UTC.
    if (!shouldDeliverPush(notification, prefs, new Date())) return;
    const tokens = await db
      .collection(`users/${notification.userId}/pushTokens`)
      .limit(10)
      .get();
    if (tokens.empty) return;
    // Only a generic message is sent to lock screens; private message bodies stay in-app.
    const messages = tokens.docs.map((doc) => ({
      to: doc.get("token"),
      title: "TheLoop",
      body:
        notification.kind === "message"
          ? "You have a new message in TheLoop."
          : notification.title,
      data: {
        notificationId: event.params.notificationId,
        targetId: notification.targetId,
        kind: notification.kind,
      },
      sound: "default",
    }));
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.EXPO_ACCESS_TOKEN
          ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(messages),
    });
    if (!response.ok) throw new Error(`Expo push returned ${response.status}`);
    const body = (await response.json()) as {
      data?: { status: string; details?: { error?: string } }[];
    };
    for (let index = 0; index < (body.data?.length || 0); index++)
      if (body.data?.[index]?.details?.error === "DeviceNotRegistered")
        await tokens.docs[index].ref.delete();
  },
);

export const exportAccount = onCall(callableOptions, async (request) => {
  const identity = actor(request);
  try {
    const allowed: Record<
      string,
      { field: string; operator: "==" | "array-contains"; source?: string }
    > = {
      messages: { field: "authorId", operator: "==" },
      posts: { field: "authorId", operator: "==" },
      contributions: {
        field: "contributorIds",
        operator: "array-contains",
        source: "posts",
      },
      events: { field: "attendeeIds", operator: "array-contains" },
      connections: { field: "participantIds", operator: "array-contains" },
      follows: { field: "participantIds", operator: "array-contains" },
      squads: { field: "memberIds", operator: "array-contains" },
      squadInvites: { field: "participantIds", operator: "array-contains" },
      squadMessages: { field: "authorId", operator: "==" },
      directMessages: { field: "participantIds", operator: "array-contains" },
      directConversations: {
        field: "participantIds",
        operator: "array-contains",
      },
      notifications: { field: "userId", operator: "==" },
      reports: { field: "reporterId", operator: "==" },
    };
    const collection = request.data?.collection;
    if (!collection) {
      const [profile, user] = await Promise.all([
        db.doc(`profiles/${identity.uid}`).get(),
        db.doc(`users/${identity.uid}`).get(),
      ]);
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        profile: profile.data() || null,
        preferences: user.get("preferences") || null,
        collections: Object.keys(allowed),
        instructions:
          "Request each collection with the returned nextCursor until it is null.",
      };
    }
    assert(
      typeof collection === "string" && collection in allowed,
      "invalid-argument",
      "Invalid export collection.",
    );
    const filter = allowed[collection];
    let query = db
      .collection(filter.source || collection)
      .where(filter.field, filter.operator, identity.uid)
      .orderBy(FieldPath.documentId())
      .limit(100);
    if (request.data.cursor)
      query = query.startAfter(exportCursor(request.data.cursor));
    const snapshot = await query.get();
    const conversationIds =
      collection === "directMessages"
        ? [
            ...new Set(
              snapshot.docs.map((doc) =>
                pairId(doc.get("fromId"), doc.get("toId")),
              ),
            ),
          ]
        : [];
    const conversations = conversationIds.length
      ? await db.getAll(
          ...conversationIds.map((value) =>
            db.doc(`directConversations/${value}`),
          ),
        )
      : [];
    const conversationMap = new Map(
      conversations.map((doc) => [doc.id, doc.data()]),
    );
    return {
      collection,
      records: snapshot.docs
        .map((doc) =>
          collection === "contributions"
            ? projectContribution(doc.data(), identity.uid)
            : collection === "directMessages"
              ? {
                  ...doc.data(),
                  read: directMessageRead(
                    doc.data(),
                    conversationMap.get(
                      pairId(doc.get("fromId"), doc.get("toId")),
                    ),
                  ),
                }
              : doc.data(),
        )
        .filter((record) => record !== undefined),
      nextCursor: snapshot.size === 100 ? snapshot.docs.at(-1)!.id : null,
    };
  } catch (error) {
    return domainError(error);
  }
});

/** Server-held cursor resumes exactly this participant's legacy history; no public backfill. */
export const syncDirectConversations = onCall(
  { ...callableOptions, timeoutSeconds: 120 },
  async (request) => {
    const identity = actor(request),
      leaseId = randomUUID(),
      now = new Date().toISOString();
    let claimed = false;
    try {
      const progress = await transaction(async (store) => {
        const path = `users/${identity.uid}`,
          user = await store.get(path);
        assert(
          user && !user.disabled && !user.deletionPending,
          "failed-precondition",
          "Complete account setup before continuing.",
        );
        const previous = user.directCatalog || {
          complete: false,
          cursor: null,
          processed: 0,
        };
        if (previous.complete) return previous;
        assert(
          !previous.leaseUntil || previous.leaseUntil <= now,
          "aborted",
          "Conversation discovery is already running. Please retry shortly.",
        );
        const bucket = Math.floor(Date.parse(now) / 60000);
        const count =
          previous.bucket === bucket ? Number(previous.count || 0) : 0;
        assert(
          count < 30,
          "resource-exhausted",
          "Conversation discovery is progressing. Please retry in a minute.",
        );
        const next = {
          ...previous,
          bucket,
          count: count + 1,
          leaseId,
          leaseUntil: new Date(Date.parse(now) + 180000).toISOString(),
          updatedAt: now,
        };
        store.set(path, { ...user, directCatalog: next });
        return next;
      });
      if (progress.complete)
        return {
          complete: true,
          processed: progress.processed,
          cursor: null,
          updatedAt: progress.updatedAt,
        };
      claimed = true;
      let query = db
        .collection("directMessages")
        .where("participantIds", "array-contains", identity.uid)
        .orderBy(FieldPath.documentId())
        .limit(50);
      if (progress.cursor)
        query = query.startAfter(exportCursor(progress.cursor));
      const page = await query.get();
      for (const source of page.docs)
        await transaction((store) =>
          migrateDirectMessage(store, identity.uid, source.id),
        );
      return await transaction(async (store) => {
        const path = `users/${identity.uid}`,
          user = await store.get(path);
        assert(
          user &&
            !user.disabled &&
            !user.deletionPending &&
            user.directCatalog?.leaseId === leaseId,
          "aborted",
          "Conversation discovery changed. Please retry.",
        );
        const next = {
          ...user.directCatalog,
          cursor: page.size === 50 ? page.docs.at(-1)!.id : null,
          processed: Number(user.directCatalog.processed || 0) + page.size,
          complete: page.size < 50,
          updatedAt: new Date().toISOString(),
        };
        delete next.leaseId;
        delete next.leaseUntil;
        store.set(path, { ...user, directCatalog: next });
        claimed = false;
        return {
          complete: next.complete,
          processed: next.processed,
          cursor: next.cursor,
          updatedAt: next.updatedAt,
        };
      });
    } catch (error) {
      if (claimed)
        await transaction(async (store) => {
          const path = `users/${identity.uid}`,
            user = await store.get(path);
          if (user?.directCatalog?.leaseId !== leaseId) return;
          const progress = { ...user.directCatalog };
          delete progress.leaseId;
          delete progress.leaseUntil;
          store.set(path, { ...user, directCatalog: progress });
        }).catch(() => undefined);
      return domainError(error);
    }
  },
);

export const deleteAccount = onCall(callableOptions, async (request) => {
  const identity = actor(request);
  try {
    assert(
      request.data?.confirmation === "DELETE",
      "invalid-argument",
      "Confirm account deletion.",
    );
    assert(
      Date.now() / 1000 - Number(request.auth!.token.auth_time || 0) < 300,
      "failed-precondition",
      "Sign in again before deleting your account.",
    );
    const jobId = identity.uid;
    await db.runTransaction(async (tx) => {
      const userRef = db.doc(`users/${identity.uid}`);
      const user = await tx.get(userRef);
      const jobRef = db.doc(`deletionJobs/${jobId}`);
      const job = await tx.get(jobRef);
      assert(user.exists, "not-found", "Account not found.");
      if (job.exists) return;
      tx.update(userRef, { deletionPending: true });
      tx.create(jobRef, {
        userId: identity.uid,
        status: "pending",
        createdAt: new Date().toISOString(),
      });
    });
    return { ok: true, status: "pending" };
  } catch (error) {
    return domainError(error);
  }
});

async function mutateMatching(
  collection: string,
  field: string,
  operator: "==" | "array-contains",
  uid: string,
  update?: (data: Doc) => Doc,
): Promise<void> {
  // Deletions intentionally use bounded pages so large histories do not become a single Firestore batch.
  for (;;) {
    const matches = await db
      .collection(collection)
      .where(field, operator, uid)
      .limit(200)
      .get();
    if (matches.empty) return;
    if (update) {
      for (const doc of matches.docs)
        await db.runTransaction(async (tx) => {
          const current = await tx.get(doc.ref);
          if (!current.exists) return;
          const value = current.get(field);
          if (operator === "==" ? value !== uid : !value?.includes(uid)) return;
          tx.set(doc.ref, update(current.data()!));
        });
    } else {
      const batch = db.batch();
      for (const doc of matches.docs) batch.delete(doc.ref);
      await batch.commit();
    }
    // Update callbacks remove the queried UID, allowing the next bounded page to advance.
  }
}
async function patchLatest(
  ref: DocumentReference,
  transform: (data: Doc) => Doc | undefined,
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists) return;
    const patch = transform(current.data()!);
    if (patch) tx.update(ref, patch);
  });
}
export const processAccountDeletion = onDocumentCreated(
  {
    document: "deletionJobs/{jobId}",
    timeoutSeconds: 540,
    memory: "512MiB",
    retry: true,
  },
  async (event) => {
    const job = event.data?.data();
    if (!job || job.status === "complete") return;
    if ((await event.data!.ref.get()).get("status") === "complete") return;
    const uid: string = job.userId;
    await getAuth()
      .updateUser(uid, { disabled: true })
      .catch((error) => {
        if (error.code !== "auth/user-not-found") throw error;
      });
    const deletionTime = new Date().toISOString();
    let mediaCursor: string | undefined;
    for (;;) {
      let query = db
        .collection("privateMedia")
        .where("ownerId", "==", uid)
        .orderBy(FieldPath.documentId())
        .limit(100);
      if (mediaCursor) query = query.startAfter(mediaCursor);
      const page = await query.get();
      if (page.empty) break;
      for (const media of page.docs)
        await removePrivateMedia(media.id, deletionTime, uid);
      mediaCursor = page.docs.at(-1)!.id;
    }
    for (;;) {
      const page = await db
        .collection("squads")
        .where("memberIds", "array-contains", uid)
        .limit(100)
        .get();
      if (page.empty) break;
      for (const squad of page.docs)
        await transaction((store) =>
          detachDeletedSquadMember(store, squad.id, uid, deletionTime),
        );
    }
    for (;;) {
      const page = await db
        .collection("squadInvites")
        .where("participantIds", "array-contains", uid)
        .limit(100)
        .get();
      if (page.empty) break;
      for (const invite of page.docs)
        await transaction((store) =>
          revokeDeletedSquadInvitation(store, invite.id, deletionTime),
        );
    }
    await mutateMatching("squadMessages", "authorId", "==", uid);
    await mutateMatching(
      "squadMessages",
      "audienceIds",
      "array-contains",
      uid,
      (data) => ({
        ...data,
        audienceIds: data.audienceIds.filter((value: string) => value !== uid),
        ...(scrubReactions(data, uid) || {}),
      }),
    );
    // Directional follow edges are removed with their surviving member's public counts in
    // one transaction. Deleting a repeated job cannot subtract a count twice.
    for (;;) {
      const page = await db
        .collection("follows")
        .where("participantIds", "array-contains", uid)
        .limit(100)
        .get();
      if (page.empty) break;
      for (const edge of page.docs)
        await db.runTransaction(async (tx) => {
          const current = await tx.get(edge.ref);
          if (!current.exists) return;
          const outgoing = current.get("followerId") === uid;
          const peerId = outgoing
            ? current.get("followingId")
            : current.get("followerId");
          const [peerProfile, peerUser] = await Promise.all([
            tx.get(db.doc(`profiles/${peerId}`)),
            tx.get(db.doc(`users/${peerId}`)),
          ]);
          if (peerProfile.exists) {
            const field = outgoing ? "followerCount" : "followingCount";
            tx.update(peerProfile.ref, {
              [field]: Math.max(0, Number(peerProfile.get(field) || 0) - 1),
            });
          }
          if (!outgoing && peerUser.exists)
            tx.update(peerUser.ref, {
              "preferences.followingIds": (
                peerUser.get("preferences.followingIds") || []
              ).filter((value: string) => value !== uid),
            });
          tx.delete(edge.ref);
        });
    }
    // Remove each accepted edge with its peer trust signal atomically, so worker retries cannot
    // repeatedly subtract reputation or leave private-profile grants behind.
    for (;;) {
      const page = await db
        .collection("connections")
        .where("participantIds", "array-contains", uid)
        .limit(100)
        .get();
      if (page.empty) break;
      for (const edge of page.docs)
        await db.runTransaction(async (tx) => {
          const connection = await tx.get(edge.ref);
          if (!connection.exists) return;
          const peerId =
            connection.get("fromId") === uid
              ? connection.get("toId")
              : connection.get("fromId");
          const [signals, profile] = await Promise.all([
            tx.get(db.doc(`trustSignals/${peerId}`)),
            tx.get(db.doc(`profiles/${peerId}`)),
          ]);
          if (
            connection.get("status") === "accepted" &&
            signals.exists &&
            profile.exists
          ) {
            const updated = {
              ...signals.data(),
              acceptedConnections: Math.max(
                0,
                Number(signals.get("acceptedConnections") || 0) - 1,
              ),
            };
            tx.set(signals.ref, updated);
            tx.update(profile.ref, {
              trust: calculateTrust(
                profile.data()!,
                updated,
                new Date().toISOString(),
              ),
            });
          }
          tx.delete(edge.ref);
          tx.delete(db.doc(`profileAccess/${uid}/members/${peerId}`));
          tx.delete(db.doc(`profileAccess/${peerId}/members/${uid}`));
        });
    }
    for (const [collection, field, operator] of [
      ["messages", "authorId", "=="],
      ["posts", "authorId", "=="],
      ["directMessages", "participantIds", "array-contains"],
      ["directConversations", "participantIds", "array-contains"],
      ["notifications", "userId", "=="],
      ["reports", "reporterId", "=="],
      ["trustAppeals", "userId", "=="],
    ] as const)
      await mutateMatching(collection, field, operator, uid);
    await mutateMatching("moderationAudit", "actorId", "==", uid, (data) => ({
      ...data,
      actorId: "deleted-member",
    }));
    await mutateMatching(
      "moderationAudit",
      "subjectAuthorId",
      "==",
      uid,
      (data) => ({ ...data, subjectAuthorId: "deleted-member" }),
    );
    // Decrement community counts exactly once by clearing the disappearing membership in the
    // same transaction. This also remains safe if the worker resumes after a partial failure.
    const privateUser = await db.doc(`users/${uid}`).get();
    for (const [targetId, value] of Object.entries(
      privateUser.get("preferences.subscriptions") || {},
    )) {
      if (value !== "following" || targetId.includes(":")) continue;
      await db.runTransaction(async (tx) => {
        const [user, channel, conference] = await Promise.all([
          tx.get(db.doc(`users/${uid}`)),
          tx.get(db.doc(`channels/${targetId}`)),
          tx.get(db.doc(`conferences/${targetId}`)),
        ]);
        const subscriptions = user.get("preferences.subscriptions") || {};
        if (subscriptions[targetId] !== "following") return;
        tx.update(user.ref, {
          "preferences.subscriptions": {
            ...subscriptions,
            [targetId]: "hidden",
          },
        });
        const target =
          channel.exists && channel.get("visibility") === "public"
            ? channel
            : conference.exists
              ? conference
              : undefined;
        if (target)
          tx.update(target.ref, {
            members: Math.max(0, Number(target.get("members") || 0) - 1),
          });
      });
    }
    for (const communityId of privateUser.get(
      "preferences.joinedCommunityIds",
    ) || [])
      await db.runTransaction(async (tx) => {
        const [user, community] = await Promise.all([
          tx.get(db.doc(`users/${uid}`)),
          tx.get(db.doc(`communities/${communityId}`)),
        ]);
        const prefs = user.get("preferences") || {};
        if (!prefs.joinedCommunityIds?.includes(communityId)) return;
        tx.update(user.ref, {
          "preferences.joinedCommunityIds": prefs.joinedCommunityIds.filter(
            (value: string) => value !== communityId,
          ),
        });
        if (community.exists)
          tx.update(community.ref, {
            members: Math.max(0, Number(community.get("members") || 0) - 1),
          });
      });
    for (const field of ["attendeeIds", "waitlistIds"]) {
      for (;;) {
        const page = await db
          .collection("events")
          .where(field, "array-contains", uid)
          .limit(100)
          .get();
        if (page.empty) break;
        for (const item of page.docs)
          await db.runTransaction(async (tx) => {
            const current = await tx.get(item.ref);
            if (!current.exists) return;
            const data = current.data()!;
            const wasGoing = data.attendeeIds?.includes(uid);
            const attendeeIds = (data.attendeeIds || []).filter(
              (value: string) => value !== uid,
            );
            const waitlistIds = (data.waitlistIds || []).filter(
              (value: string) => value !== uid,
            );
            const promotedId =
              wasGoing && Date.parse(data.endAt) > Date.now()
                ? waitlistIds.shift()
                : undefined;
            const recipient = promotedId
              ? await tx.get(db.doc(`users/${promotedId}`))
              : undefined;
            tx.update(item.ref, {
              attendeeIds: promotedId
                ? [...attendeeIds, promotedId]
                : attendeeIds,
              waitlistIds,
            });
            if (
              promotedId &&
              recipient?.exists &&
              !recipient.get("disabled") &&
              !recipient.get("deletionPending")
            ) {
              const notificationId = `deletion_${uid}_${item.id}_${promotedId}`;
              tx.set(db.doc(`notifications/${notificationId}`), {
                id: notificationId,
                userId: promotedId,
                title: "You’re off the waitlist",
                body: `A spot opened for ${data.title}. You’re now going.`,
                kind: "event",
                targetId: item.id,
                createdAt: new Date().toISOString(),
                read: false,
                unreadUserId: promotedId,
              });
            }
          });
      }
    }
    await mutateMatching("events", "hostId", "==", uid, (data) => ({
      ...data,
      hostId: "deleted-member",
      hostDeleted: true,
    }));
    await mutateMatching("communities", "creatorId", "==", uid, (data) =>
      scrubCommunityOwner(data, uid),
    );
    for (;;) {
      const page = await db
        .collection("channels")
        .where("memberIds", "array-contains", uid)
        .limit(100)
        .get();
      if (page.empty) break;
      for (const doc of page.docs)
        await patchLatest(doc.ref, (current) => {
          const memberIds = (current.memberIds || []).filter(
            (value: string) => value !== uid,
          );
          const moderatorIds = (current.moderatorIds || []).filter(
            (value: string) => value !== uid,
          );
          return {
            memberIds,
            members: memberIds.length,
            moderatorIds,
            needsModerator: moderatorIds.length === 0,
            ...(current.creatorId === uid
              ? { creatorId: "deleted-member" }
              : {}),
          };
        });
    }
    for (;;) {
      const page = await db
        .collection("channels")
        .where("moderatorIds", "array-contains", uid)
        .limit(100)
        .get();
      if (page.empty) break;
      for (const doc of page.docs)
        await patchLatest(doc.ref, (current) => {
          const moderatorIds = (current.moderatorIds || []).filter(
            (value: string) => value !== uid,
          );
          return {
            moderatorIds,
            needsModerator: moderatorIds.length === 0,
            ...(current.creatorId === uid
              ? { creatorId: "deleted-member" }
              : {}),
          };
        });
    }
    for (;;) {
      const page = await db
        .collection("conferences")
        .where("organizerIds", "array-contains", uid)
        .limit(100)
        .get();
      if (page.empty) break;
      for (const doc of page.docs)
        await patchLatest(doc.ref, (current) => ({
          organizerIds: (current.organizerIds || []).filter(
            (value: string) => value !== uid,
          ),
        }));
    }
    for (;;) {
      const page = await db
        .collection("communities")
        .where("moderatorIds", "array-contains", uid)
        .limit(200)
        .get();
      if (page.empty) break;
      for (const doc of page.docs) {
        await patchLatest(doc.ref, (current) => {
          const moderators = (current.moderatorIds || []).filter(
            (value: string) => value !== uid,
          );
          return {
            moderatorIds: moderators,
            needsModerator: moderators.length === 0,
          };
        });
      }
    }
    for (const field of ["followingIds", "blockedIds", "dmMutedIds"]) {
      for (;;) {
        const page = await db
          .collection("users")
          .where(`preferences.${field}`, "array-contains", uid)
          .limit(200)
          .get();
        if (page.empty) break;
        for (const doc of page.docs)
          await patchLatest(doc.ref, (current) => ({
            [`preferences.${field}`]: (
              current.preferences?.[field] || []
            ).filter((value: string) => value !== uid),
          }));
      }
    }
    // Remove the deleted member's embedded comments and votes from remaining discussions.
    let cursor: string | undefined;
    for (;;) {
      let query = db
        .collection("posts")
        .orderBy(FieldPath.documentId())
        .limit(200);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      if (page.empty) break;
      for (const doc of page.docs) {
        if (scrubPost(doc.data(), uid))
          await patchLatest(doc.ref, (current) => scrubPost(current, uid));
      }
      cursor = page.docs.at(-1)!.id;
    }
    cursor = undefined;
    for (;;) {
      let query = db
        .collection("messages")
        .orderBy(FieldPath.documentId())
        .limit(200);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      if (page.empty) break;
      for (const doc of page.docs) {
        if (scrubReactions(doc.data(), uid))
          await patchLatest(doc.ref, (current) => scrubReactions(current, uid));
      }
      cursor = page.docs.at(-1)!.id;
    }
    for (;;) {
      const page = await db
        .collectionGroup("members")
        .where("userId", "==", uid)
        .limit(200)
        .get();
      if (page.empty) break;
      const batch = db.batch();
      for (const doc of page.docs) batch.delete(doc.ref);
      await batch.commit();
    }
    await db.recursiveDelete(db.doc(`profileAccess/${uid}`));
    await db.recursiveDelete(db.doc(`users/${uid}`));
    await db.doc(`profiles/${uid}`).delete();
    await db.doc(`trustSignals/${uid}`).delete();
    await getAuth()
      .deleteUser(uid)
      .catch((error) => {
        if (error.code !== "auth/user-not-found") throw error;
      });
    await event.data!.ref.set({
      userId: uid,
      status: "complete",
      completedAt: new Date().toISOString(),
    });
  },
);
