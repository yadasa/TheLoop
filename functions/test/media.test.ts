import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { bootstrap, execute, TransactionStore } from "../src/service";
import { Doc, DomainError, pairId } from "../src/policy";
import {
  authorizeMediaRead,
  claimMediaUpload,
  consumeMediaBudget,
  finishMedia,
  MAX_SOURCE_BYTES,
  mediaIdFor,
  mediaNeedsCleanup,
  mediaUploadInput,
} from "../src/media";
import { imageSignature, sanitizeImage } from "../src/imageCodec";

const initial = "2026-10-26T12:00:00.000Z";
class Database {
  docs = new Map<string, Doc>();
  now = initial;
  sequence = 0;
  async tx<T>(work: (store: TransactionStore) => Promise<T>) {
    const snapshot = structuredClone(this.docs);
    const store: TransactionStore = {
      get: async (path) => snapshot.get(path),
      find: async (collection, field, value, limit, secondary) =>
        [...snapshot.entries()]
          .filter(
            ([path, row]) =>
              path.split("/").length === 2 &&
              path.startsWith(`${collection}/`) &&
              row[field] === value &&
              (!secondary || row[secondary.field] === secondary.value),
          )
          .slice(0, limit)
          .map(([, row]) => row),
      set: (path, value) => {
        snapshot.set(path, value);
      },
      remove: (path) => {
        snapshot.delete(path);
      },
    };
    const result = await work(store);
    this.docs = snapshot;
    return result;
  }
  actor(uid: string) {
    return { uid, emailVerified: true };
  }
  command(uid: string, command: Doc) {
    return this.tx((store) =>
      execute(
        store,
        this.actor(uid),
        { command, requestId: `media-test-${++this.sequence}` },
        this.now,
      ),
    );
  }
  get(path: string) {
    return this.docs.get(path)!;
  }
  input(target: Doc, requestId = `upload-${++this.sequence}`) {
    return mediaUploadInput({
      target,
      contentType: "image/png",
      base64: Buffer.from("fixture pixels").toString("base64"),
      requestId,
    });
  }
  async ready(target: Doc, uid = "alice") {
    const input = this.input(target),
      claim = await this.tx((store) =>
        claimMediaUpload(store, uid, input, "claim-one", this.now),
      );
    const image = {
      id: claim.id,
      mimeType: "image/webp",
      width: 20,
      height: 10,
      size: 100,
    };
    await this.tx((store) =>
      finishMedia(store, uid, claim.id, "claim-one", this.now, {
        image,
        sanitizedPath: `sanitized/${uid}/${claim.id}/claim-one.webp`,
      }),
    );
    return image;
  }
  read(uid: string, mediaId: string, reportId?: string) {
    return this.tx((store) =>
      authorizeMediaRead(store, uid, mediaId, this.now, reportId),
    );
  }
}
async function fixture() {
  const db = new Database();
  for (const uid of ["alice", "bob", "eve", "mod"])
    await db.tx((store) => bootstrap(store, db.actor(uid), db.now, uid));
  db.docs.set("users/mod", { ...db.get("users/mod"), role: "moderator" });
  db.docs.set("conferences/conf", { id: "conf" });
  db.docs.set("channels/room", {
    id: "room",
    conferenceId: "conf",
    visibility: "public",
    topics: ["General"],
  });
  db.docs.set("channels/private", {
    id: "private",
    conferenceId: "conf",
    visibility: "private",
    memberIds: ["alice", "bob"],
    topics: ["General"],
  });
  db.docs.set("communities/builders", {
    id: "builders",
    members: 0,
    moderatorIds: ["mod"],
  });
  db.docs.set(`connections/${pairId("alice", "bob")}`, {
    id: pairId("alice", "bob"),
    status: "accepted",
    participantIds: ["alice", "bob"],
  });
  db.docs.set("squads/squad", {
    id: "squad",
    name: "Friends",
    ownerId: "alice",
    archived: false,
    memberIds: ["alice", "bob"],
    pendingInviteeIds: [],
    memberProfiles: {},
  });
  return db;
}
const rejects = (work: Promise<unknown>, code = "permission-denied") =>
  assert.rejects(
    work,
    (error) => error instanceof DomainError && error.code === code,
  );

test("image upload input rejects excess bytes, malformed base64, MIME types, and forged fields before decoding", () => {
  const valid = {
    target: { kind: "channel", id: "room" },
    requestId: "request-one",
    contentType: "image/png",
    base64: "AA==",
  };
  assert.equal(mediaUploadInput(valid).sourceSize, 1);
  for (const patch of [
    { base64: "data:image/png;base64,AA==" },
    { base64: "AA=" },
    { base64: "=AAA" },
    { contentType: "image/svg+xml" },
    { ownerId: "eve" },
    { target: { kind: "profile", id: "alice" } },
    { requestId: "../path" },
    { base64: "A".repeat(Math.ceil((MAX_SOURCE_BYTES + 3) / 3) * 4) },
  ])
    assert.throws(() => mediaUploadInput({ ...valid, ...patch }), DomainError);
  assert.notEqual(mediaIdFor("alice", "same"), mediaIdFor("bob", "same"));
});

test("image upload authority follows private membership, community membership and recipient DM policy", async () => {
  const db = await fixture();
  await rejects(db.ready({ kind: "channel", id: "private" }, "eve"));
  await rejects(db.ready({ kind: "squad", id: "squad" }, "eve"));
  await rejects(db.ready({ kind: "community", id: "builders" }));
  await db.command("alice", {
    type: "community.join",
    communityId: "builders",
  });
  await db.ready({ kind: "community", id: "builders" });
  await db.ready({ kind: "directMessage", id: "bob" });
  await db.command("bob", {
    type: "preferences.update",
    preferences: { dmPolicy: "nobody" },
  });
  await rejects(db.ready({ kind: "directMessage", id: "bob" }));
});

test("image processing claims reject concurrent/change retries and stale workers cannot finalize another claim", async () => {
  const db = await fixture(),
    input = db.input({ kind: "channel", id: "room" });
  const claim = await db.tx((store) =>
    claimMediaUpload(store, "alice", input, "first", db.now),
  );
  await rejects(
    db.tx((store) => claimMediaUpload(store, "alice", input, "second", db.now)),
    "failed-precondition",
  );
  const changed = { ...input, payloadHash: "different" };
  await rejects(
    db.tx((store) =>
      claimMediaUpload(store, "alice", changed, "second", db.now),
    ),
    "invalid-argument",
  );
  db.now = "2026-10-26T12:04:00.000Z";
  await db.tx((store) =>
    claimMediaUpload(store, "alice", input, "second", db.now),
  );
  assert.equal(
    await db.tx((store) =>
      finishMedia(store, "alice", claim.id, "first", db.now),
    ),
    false,
  );
  const image = {
    id: claim.id,
    mimeType: "image/webp",
    width: 2,
    height: 2,
    size: 50,
  };
  assert.equal(
    await db.tx((store) =>
      finishMedia(store, "alice", claim.id, "second", db.now, {
        image,
        sanitizedPath: "private/output.webp",
      }),
    ),
    true,
  );
  assert.equal(
    (
      await db.tx((store) =>
        claimMediaUpload(store, "alice", input, "third", db.now),
      )
    ).complete,
    true,
  );
  assert.deepEqual(db.get(`privateMedia/${claim.id}`).image, image);
});

test("each supported send links only its owner's ready image to the exact target once", async () => {
  const db = await fixture();
  await db.command("alice", {
    type: "community.join",
    communityId: "builders",
  });
  const cases = [
    {
      target: { kind: "channel", id: "room" },
      command: {
        type: "message.send",
        channelId: "room",
        topic: "General",
        body: "Caption",
      },
      collection: "messages",
    },
    {
      target: { kind: "squad", id: "squad" },
      command: {
        type: "squad.message.send",
        squadId: "squad",
        body: "Caption",
      },
      collection: "squadMessages",
    },
    {
      target: { kind: "directMessage", id: "bob" },
      command: { type: "dm.send", userId: "bob", body: "Caption" },
      collection: "directMessages",
    },
    {
      target: { kind: "community", id: "builders" },
      command: {
        type: "post.create",
        communityId: "builders",
        title: "A photo",
        body: "Caption",
        kind: "discussion",
      },
      collection: "posts",
    },
  ];
  for (const row of cases) {
    const image = await db.ready(row.target),
      result = await db.command("alice", { ...row.command, imageId: image.id });
    assert.deepEqual(db.get(`${row.collection}/${result.id}`).image, image);
    assert.equal(db.get(`privateMedia/${image.id}`).linkedId, result.id);
    assert.equal(db.get("users/alice").mediaIntents[image.id], undefined);
    await rejects(
      db.command("alice", { ...row.command, imageId: image.id }),
      "failed-precondition",
    );
  }
  const privateImage = await db.ready({ kind: "channel", id: "private" });
  await rejects(
    db.command("alice", {
      type: "message.send",
      channelId: "room",
      topic: "General",
      body: "Wrong conversation",
      imageId: privateImage.id,
    }),
  );
  await rejects(
    db.command("bob", {
      type: "message.send",
      channelId: "private",
      topic: "General",
      body: "Wrong owner",
      imageId: privateImage.id,
    }),
    "failed-precondition",
  );
  await rejects(
    db.command("alice", {
      type: "message.send",
      channelId: "private",
      topic: "General",
      body: "",
      imageId: privateImage.id,
    }),
    "invalid-argument",
  );
  await rejects(db.read("alice", privateImage.id), "not-found");
});

test("private image reads require current message access and exact validated report scope", async () => {
  const db = await fixture(),
    image = await db.ready({ kind: "channel", id: "private" });
  const message = (
    await db.command("alice", {
      type: "message.send",
      channelId: "private",
      topic: "General",
      body: "Private photo caption",
      imageId: image.id,
    })
  ).id;
  await db.read("bob", image.id);
  await rejects(db.read("mod", image.id));
  const report = (
    await db.command("bob", {
      type: "report.create",
      targetType: "message",
      targetId: message,
      reason: "Review this image with the selected message.",
    })
  ).id;
  assert.deepEqual(db.get(`reports/${report}`).snapshot.image, image);
  await db.read("mod", image.id, report);
  await rejects(db.read("eve", image.id, report));
  const another = await db.ready({ kind: "channel", id: "room" });
  await db.command("alice", {
    type: "message.send",
    channelId: "room",
    topic: "General",
    body: "Unrelated image",
    imageId: another.id,
  });
  await rejects(db.read("mod", another.id, report));
  db.docs.set("channels/private", {
    ...db.get("channels/private"),
    memberIds: ["alice"],
  });
  await rejects(db.read("bob", image.id));
  await db.command("alice", { type: "message.delete", messageId: message });
  await rejects(db.read("mod", image.id, report), "not-found");
});

test("Squad image reads respect captured audiences and block-safe edited history", async () => {
  const db = await fixture(),
    image = await db.ready({ kind: "squad", id: "squad" });
  const message = (
    await db.command("alice", {
      type: "squad.message.send",
      squadId: "squad",
      body: "Current audience photo",
      imageId: image.id,
    })
  ).id;
  await db.read("bob", image.id);
  db.docs.set("squads/squad", {
    ...db.get("squads/squad"),
    memberIds: ["alice", "bob", "eve"],
  });
  await rejects(db.read("eve", image.id));
  await db.command("alice", { type: "profile.block", userId: "bob" });
  await db.command("alice", {
    type: "squad.message.edit",
    messageId: message,
    body: "Edited after block",
  });
  await rejects(db.read("bob", image.id));
});

test("media byte budgets and cleanup decisions are bounded and preserve active processing and linked sources", async () => {
  const db = await fixture();
  for (let n = 0; n < 30; n++)
    await db.tx((store) =>
      consumeMediaBudget(store, "alice", db.now, false, 1024 * 1024),
    );
  await rejects(
    db.tx((store) => consumeMediaBudget(store, "alice", db.now, false, 1)),
    "resource-exhausted",
  );
  db.now = "2026-10-26T12:01:00.000Z";
  await db.tx((store) => consumeMediaBudget(store, "alice", db.now, false, 1));
  assert.equal(
    mediaNeedsCleanup(
      { state: "processing", claimUntil: "2026-10-26T12:02:00.000Z" },
      undefined,
      db.now,
    ),
    false,
  );
  assert.equal(mediaNeedsCleanup({ state: "failed" }, undefined, db.now), true);
  assert.equal(
    mediaNeedsCleanup(
      { state: "deleting", deferCleanupUntil: "2026-10-26T12:03:00.000Z" },
      undefined,
      db.now,
    ),
    false,
    "in-flight account deletion retains a short cleanup tombstone",
  );
  const media = {
    id: "photo",
    state: "ready",
    linkedCollection: "messages",
    expiresAt: initial,
  };
  assert.equal(
    mediaNeedsCleanup(media, { image: { id: "photo" } }, db.now),
    false,
  );
  assert.equal(mediaNeedsCleanup(media, undefined, db.now), true);
  assert.equal(
    mediaNeedsCleanup(
      { ...media, linkedCollection: undefined },
      undefined,
      db.now,
    ),
    true,
  );
});

test("real image codec rotates pixels, strips EXIF/ICC, bounds output and emits a complete WebP", async () => {
  const original = await sharp({
    create: { width: 4000, height: 2000, channels: 3, background: "#444444" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const sanitized = await sanitizeImage(
    original,
    "image/jpeg",
    "fixture-image",
  );
  const metadata = await sharp(sanitized.bytes).metadata();
  assert.equal(imageSignature(sanitized.bytes), "image/webp");
  assert.equal(metadata.width, 1024);
  assert.equal(metadata.height, 2048);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.ok(sanitized.bytes.length <= 1024 * 1024);
  assert.equal(sanitized.image.size, sanitized.bytes.length);
  assert.equal(sanitized.bytes.readUInt32LE(4) + 8, sanitized.bytes.length);
});

test("real image codec rejects mismatches, SVG, malformed/animated bytes, oversized sources and decoded pixel bombs", async () => {
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "black" },
  })
    .png()
    .toBuffer();
  await rejects(
    sanitizeImage(png, "image/jpeg", "mismatch"),
    "invalid-argument",
  );
  await rejects(
    sanitizeImage(
      Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
      "image/png",
      "svg",
    ),
    "invalid-argument",
  );
  await rejects(
    sanitizeImage(Buffer.alloc(MAX_SOURCE_BYTES + 1), "image/png", "large"),
    "invalid-argument",
  );
  const apng = Buffer.concat([
    png.subarray(0, 8),
    Buffer.from([0, 0, 0, 8]),
    Buffer.from("acTL"),
    Buffer.alloc(12),
  ]);
  await rejects(
    sanitizeImage(apng, "image/png", "animated-png"),
    "invalid-argument",
  );
  const animatedWebp = Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.from([12, 0, 0, 0]),
    Buffer.from("WEBPANIM"),
    Buffer.alloc(4),
  ]);
  await rejects(
    sanitizeImage(animatedWebp, "image/webp", "animated-webp"),
    "invalid-argument",
  );
  const bomb = await sharp({
    create: { width: 4000, height: 4000, channels: 3, background: "black" },
  })
    .png()
    .toBuffer();
  await rejects(
    sanitizeImage(bomb, "image/png", "pixel-bomb"),
    "invalid-argument",
  );
});
