import { assert, Doc, id, pairId } from "./policy";
import type { TransactionStore } from "./service";
import { canSendDirectMessage } from "./directMessages";
import { createHash } from "node:crypto";

export const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export type MediaTarget = {
  kind: "channel" | "squad" | "directMessage" | "community";
  id: string;
};
export function mediaTarget(input: unknown): MediaTarget {
  assert(
    input && typeof input === "object" && !Array.isArray(input),
    "invalid-argument",
    "Choose where to share this image.",
  );
  const target = input as Doc;
  assert(
    Object.keys(target).every((key) => ["kind", "id"].includes(key)) &&
      ["channel", "squad", "directMessage", "community"].includes(target.kind),
    "invalid-argument",
    "Invalid image destination.",
  );
  return { kind: target.kind, id: id(target.id) };
}
export async function activeMediaUser(
  store: TransactionStore,
  uid: string,
): Promise<Doc> {
  const user = await store.get(`users/${uid}`);
  assert(
    user && !user.disabled && !user.deletionPending,
    "permission-denied",
    "This account is unavailable.",
  );
  return user;
}
export async function authorizeMediaTarget(
  store: TransactionStore,
  uid: string,
  target: MediaTarget,
): Promise<Doc> {
  const user = await activeMediaUser(store, uid);
  if (target.kind === "channel") {
    const channel = await store.get(`channels/${target.id}`);
    assert(
      channel &&
        (channel.visibility === "public" || channel.memberIds?.includes(uid)),
      "permission-denied",
      "Join this channel before sharing an image.",
    );
  } else if (target.kind === "squad") {
    const squad = await store.get(`squads/${target.id}`);
    assert(
      squad && !squad.archived && squad.memberIds.includes(uid),
      "permission-denied",
      "Join this Squad before sharing an image.",
    );
  } else if (target.kind === "community") {
    assert(
      user.preferences?.joinedCommunityIds?.includes(target.id) &&
        (await store.get(`communities/${target.id}`)),
      "permission-denied",
      "Join this community before sharing an image.",
    );
  } else {
    const [peer, connection] = await Promise.all([
      store.get(`users/${target.id}`),
      store.get(`connections/${pairId(uid, target.id)}`),
    ]);
    assert(
      target.id !== uid &&
        peer &&
        !peer.disabled &&
        !peer.deletionPending &&
        (await canSendDirectMessage(
          store,
          uid,
          target.id,
          user,
          peer,
          connection,
        )),
      "permission-denied",
      "This person's message privacy settings do not allow this image.",
    );
  }
  return user;
}
function pendingIntents(user: Doc, now: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(user.mediaIntents || {})
      .filter(([, expiry]) => Date.parse(String(expiry)) > Date.parse(now))
      .map(([key, expiry]) => [key, String(expiry)]),
  );
}
export async function consumeMediaBudget(
  store: TransactionStore,
  uid: string,
  now: string,
  upload = false,
  bytes = 0,
): Promise<void> {
  const path = `users/${uid}/system/mediaRate`,
    previous = await store.get(path);
  const minute = Math.floor(Date.parse(now) / 60000),
    day = now.slice(0, 10);
  const current: Doc = {
    minute,
    day,
    uploads: 0,
    reads: 0,
    bytes: 0,
    dailyUploads: 0,
    dailyReads: 0,
    dailyBytes: 0,
    ...(previous || {}),
  };
  if (current.minute !== minute)
    Object.assign(current, { minute, uploads: 0, reads: 0, bytes: 0 });
  if (current.day !== day)
    Object.assign(current, {
      day,
      dailyUploads: 0,
      dailyReads: 0,
      dailyBytes: 0,
    });
  if (upload) {
    assert(
      current.uploads < 10 && current.dailyUploads < 100,
      "resource-exhausted",
      "Image upload limit reached. Please try again later.",
    );
    current.uploads++;
    current.dailyUploads++;
  } else {
    assert(
      current.reads < 120 &&
        current.dailyReads < 10000 &&
        current.bytes + bytes <= 30 * 1024 * 1024 &&
        current.dailyBytes + bytes <= 500 * 1024 * 1024,
      "resource-exhausted",
      "Image viewing limit reached. Please try again later.",
    );
    current.reads++;
    current.dailyReads++;
    current.bytes += bytes;
    current.dailyBytes += bytes;
  }
  store.set(path, current);
}
export function mediaUploadInput(data: unknown): {
  target: MediaTarget;
  contentType: string;
  base64: string;
  requestId: string;
  sourceSize: number;
  payloadHash: string;
} {
  assert(
    data && typeof data === "object" && !Array.isArray(data),
    "invalid-argument",
    "Provide an image upload.",
  );
  const input = data as Doc;
  assert(
    Object.keys(input).every((key) =>
      ["target", "contentType", "base64", "requestId"].includes(key),
    ),
    "invalid-argument",
    "Invalid image upload fields.",
  );
  const target = mediaTarget(input.target),
    requestId = id(input.requestId);
  assert(
    IMAGE_TYPES.includes(input.contentType) &&
      typeof input.base64 === "string" &&
      input.base64.length > 0 &&
      input.base64.length <= Math.ceil(MAX_SOURCE_BYTES / 3) * 4 &&
      input.base64.length % 4 === 0 &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(input.base64),
    "invalid-argument",
    "Choose a JPEG, PNG or WebP image of at most 5 MiB.",
  );
  const sourceSize =
    (input.base64.length / 4) * 3 -
    (input.base64.endsWith("==") ? 2 : input.base64.endsWith("=") ? 1 : 0);
  assert(
    sourceSize > 0 && sourceSize <= MAX_SOURCE_BYTES,
    "invalid-argument",
    "This image exceeds 5 MiB.",
  );
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(target))
    .update("\0")
    .update(input.contentType)
    .update("\0")
    .update(input.base64)
    .digest("hex");
  return {
    target,
    requestId,
    contentType: input.contentType,
    base64: input.base64,
    sourceSize,
    payloadHash,
  };
}
export function mediaIdFor(uid: string, requestId: string): string {
  return `im_${createHash("sha256").update(`${uid}\0${requestId}`).digest("hex").slice(0, 40)}`;
}
export function mediaNeedsCleanup(
  media: Doc,
  source: Doc | undefined,
  now: string,
): boolean {
  if (Date.parse(media.deferCleanupUntil || "") > Date.parse(now)) return false;
  if (media.state === "deleting" || media.state === "failed") return true;
  if (media.state === "processing")
    return Date.parse(media.claimUntil) <= Date.parse(now);
  if (media.state !== "ready") return true;
  return media.linkedCollection
    ? source?.image?.id !== media.id
    : Date.parse(media.expiresAt) <= Date.parse(now);
}
export async function claimMediaUpload(
  store: TransactionStore,
  uid: string,
  input: ReturnType<typeof mediaUploadInput>,
  claimId: string,
  now: string,
): Promise<Doc> {
  const mediaId = mediaIdFor(uid, input.requestId),
    media = await store.get(`privateMedia/${mediaId}`);
  const user = await authorizeMediaTarget(store, uid, input.target);
  assert(
    !media ||
      (media.ownerId === uid && media.payloadHash === input.payloadHash),
    "invalid-argument",
    "Use a new request ID when changing an image or its destination.",
  );
  if (media?.state === "ready") return { image: media.image, complete: true };
  assert(
    !media ||
      media.state === "failed" ||
      (media.state === "processing" &&
        Date.parse(media.claimUntil) <= Date.parse(now)),
    "failed-precondition",
    "This image is already processing. Retry this same upload shortly.",
  );
  const intents = pendingIntents(user, now);
  assert(
    Object.keys(intents).length < 5 || mediaId in intents,
    "resource-exhausted",
    "Finish or wait for an earlier image upload before adding another.",
  );
  await consumeMediaBudget(store, uid, now, true);
  const claimUntil = new Date(Date.parse(now) + 180000).toISOString();
  const claimed = {
    id: mediaId,
    ownerId: uid,
    target: input.target,
    contentType: input.contentType,
    sourceSize: input.sourceSize,
    payloadHash: input.payloadHash,
    state: "processing",
    unlinked: true,
    claimId,
    claimUntil,
    createdAt: media?.createdAt || now,
    expiresAt: claimUntil,
  };
  store.set(`privateMedia/${mediaId}`, claimed);
  store.set(`users/${uid}`, {
    ...user,
    mediaIntents: { ...intents, [mediaId]: claimUntil },
  });
  return claimed;
}
export async function finishMedia(
  store: TransactionStore,
  uid: string,
  mediaId: string,
  claimId: string,
  now: string,
  output?: { image: Doc; sanitizedPath: string },
): Promise<boolean> {
  const media = await store.get(`privateMedia/${mediaId}`);
  if (
    !media ||
    media.state !== "processing" ||
    media.claimId !== claimId ||
    media.ownerId !== uid
  )
    return false;
  const user = await activeMediaUser(store, uid),
    intents = { ...user.mediaIntents };
  if (output) {
    await authorizeMediaTarget(store, uid, media.target);
    const expiresAt = new Date(Date.parse(now) + 3600000).toISOString();
    intents[mediaId] = expiresAt;
    store.set(`privateMedia/${mediaId}`, {
      ...media,
      ...output,
      state: "ready",
      readyAt: now,
      expiresAt,
    });
  } else {
    delete intents[mediaId];
    store.set(`privateMedia/${mediaId}`, {
      ...media,
      state: "failed",
      expiresAt: now,
      failedAt: now,
    });
  }
  store.set(`users/${uid}`, { ...user, mediaIntents: intents });
  return true;
}
export async function linkImage(
  store: TransactionStore,
  uid: string,
  user: Doc,
  imageId: unknown,
  target: MediaTarget,
  collection: string,
  recordId: string,
  caption: string,
  now: string,
): Promise<Doc | undefined> {
  if (imageId === undefined) return;
  const media = await store.get(`privateMedia/${id(imageId)}`);
  assert(
    caption.trim().length > 0,
    "invalid-argument",
    "Add a caption for your image.",
  );
  assert(
    media &&
      media.ownerId === uid &&
      media.state === "ready" &&
      !media.linkedCollection,
    "failed-precondition",
    "Choose your own completed, unused image upload.",
  );
  assert(
    media.target.kind === target.kind &&
      media.target.id === target.id &&
      Date.parse(media.expiresAt) > Date.parse(now),
    "permission-denied",
    "This image was prepared for a different conversation or has expired.",
  );
  store.set(`privateMedia/${media.id}`, {
    ...media,
    unlinked: false,
    linkedCollection: collection,
    linkedId: recordId,
    linkedAt: now,
  });
  user.mediaIntents = { ...user.mediaIntents };
  delete user.mediaIntents[media.id];
  return media.image;
}
const reportCollections: Record<string, string> = {
  message: "messages",
  post: "posts",
  directMessage: "directMessages",
  squadMessage: "squadMessages",
};
export async function authorizeMediaRead(
  store: TransactionStore,
  uid: string,
  mediaId: unknown,
  now: string,
  reportId?: unknown,
): Promise<Doc> {
  const user = await activeMediaUser(store, uid),
    media = await store.get(`privateMedia/${id(mediaId)}`);
  assert(
    media?.state === "ready" &&
      media.sanitizedPath &&
      ["messages", "posts", "directMessages", "squadMessages"].includes(
        media.linkedCollection,
      ),
    "not-found",
    "This image is no longer available.",
  );
  const source = await store.get(
    `${media.linkedCollection}/${id(media.linkedId)}`,
  );
  assert(
    source && source.image?.id === media.id,
    "not-found",
    "This image's message is no longer available.",
  );
  if (reportId !== undefined) {
    const report = await store.get(`reports/${id(reportId)}`);
    assert(
      report &&
        ["admin", "moderator"].includes(user.role) &&
        report.snapshot?.image?.id === media.id &&
        reportCollections[report.targetType] === media.linkedCollection &&
        report.targetId === media.linkedId,
      "permission-denied",
      "This image is not part of an authorized moderation report.",
    );
  } else if (media.linkedCollection === "messages") {
    const channel = await store.get(`channels/${source.channelId}`);
    assert(
      channel &&
        (channel.visibility === "public" || channel.memberIds?.includes(uid)),
      "permission-denied",
      "This image belongs to a private channel.",
    );
  } else if (media.linkedCollection === "squadMessages") {
    const squad = await store.get(`squads/${source.squadId}`);
    assert(
      squad &&
        squad.memberIds.includes(uid) &&
        source.audienceIds?.includes(uid),
      "permission-denied",
      "This image is outside your current Squad history.",
    );
  } else if (media.linkedCollection === "directMessages")
    assert(
      source.participantIds?.includes(uid),
      "permission-denied",
      "This image belongs to a private conversation.",
    );
  assert(
    Number.isSafeInteger(media.image.size) &&
      media.image.size > 0 &&
      media.image.size <= MAX_IMAGE_BYTES,
    "failed-precondition",
    "Invalid image metadata.",
  );
  await consumeMediaBudget(store, uid, now, false, media.image.size);
  return media;
}
