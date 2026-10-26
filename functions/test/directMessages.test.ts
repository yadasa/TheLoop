import test from "node:test";
import assert from "node:assert/strict";
import { bootstrap, execute, TransactionStore } from "../src/service";
import { Doc, DomainError, pairId } from "../src/policy";
import { authorSnapshot, participationIdentity } from "../src/identity";
import {
  claimMediaUpload,
  mediaUploadInput,
  authorizeMediaRead,
} from "../src/media";
import { shouldDeliverPush } from "../src/notifications";

const now = "2026-10-26T12:00:00.000Z";
class Database {
  docs = new Map<string, Doc>();
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
      set: (path, row) => {
        snapshot.set(path, row);
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
        { command, requestId: `dm-test-${++this.sequence}` },
        now,
      ),
    );
  }
  get(path: string) {
    return this.docs.get(path)!;
  }
  notices(uid: string) {
    return [...this.docs.entries()]
      .filter(
        ([path, row]) =>
          path.startsWith("notifications/") && row.userId === uid,
      )
      .map(([, row]) => row);
  }
  message(id: string, fromId: string, toId: string) {
    this.docs.set(`directMessages/${id}`, {
      id,
      fromId,
      toId,
      participantIds: [fromId, toId],
      conversationId: pairId(fromId, toId),
      unreadRecipientId: toId,
      body: "Fixture",
      createdAt: now,
      read: false,
    });
  }
}
async function fixture() {
  const db = new Database();
  for (const uid of ["alice", "bob", "eve"])
    await db.tx((store) =>
      bootstrap(store, db.actor(uid), now, `${uid} Person`),
    );
  db.docs.set(`connections/${pairId("alice", "bob")}`, {
    id: pairId("alice", "bob"),
    status: "accepted",
    participantIds: ["alice", "bob"],
  });
  db.docs.set("channels/room", {
    id: "room",
    visibility: "public",
    topics: ["General"],
  });
  db.docs.set("communities/builders", {
    id: "builders",
    moderatorIds: ["eve"],
    members: 0,
  });
  return db;
}
const rejects = (work: Promise<unknown>, code = "permission-denied") =>
  assert.rejects(
    work,
    (error) => error instanceof DomainError && error.code === code,
  );

test("participation snapshots are bounded minimal identities and safely preserve Unicode initials", () => {
  const profile = {
    name: "🖤 Zuri",
    initials: "untrusted",
    company: "Private",
    bio: "Private",
  };
  assert.deepEqual(participationIdentity(profile), {
    name: "🖤 Zuri",
    initials: "🖤Z",
  });
  assert.deepEqual(Object.keys(authorSnapshot(profile)).sort(), [
    "authorInitials",
    "authorName",
  ]);
  assert.ok(participationIdentity({ name: "x".repeat(200) }).name.length <= 80);
});

test("channel, post and reply identities come from the author without disclosing professional profiles", async () => {
  const db = await fixture();
  db.docs.set("profiles/alice", {
    ...db.get("profiles/alice"),
    name: "Zuri Williams",
    initials: "OLD",
    visibility: "connections",
    company: "PRIVATE_COMPANY",
    bio: "PRIVATE_BIO",
  });
  await db.command("alice", {
    type: "community.join",
    communityId: "builders",
  });
  const message = (
    await db.command("alice", {
      type: "message.send",
      channelId: "room",
      topic: "General",
      body: "Hello",
    })
  ).id;
  const post = (
    await db.command("alice", {
      type: "post.create",
      communityId: "builders",
      title: "Hello",
      body: "Discussion",
      kind: "discussion",
    })
  ).id;
  await db.command("alice", {
    type: "post.comment",
    postId: post,
    body: "My reply",
  });
  for (const row of [
    db.get(`messages/${message}`),
    db.get(`posts/${post}`),
    db.get(`posts/${post}`).comments[0],
  ]) {
    assert.equal(row.authorName, "Zuri Williams");
    assert.equal(row.authorInitials, "ZW");
    assert.ok(!JSON.stringify(row).includes("PRIVATE_"));
  }
  await rejects(
    db.command("alice", {
      type: "message.send",
      channelId: "room",
      topic: "General",
      body: "Forged",
      authorName: "Another person",
    }),
    "invalid-argument",
  );
  await rejects(
    db.command("alice", {
      type: "post.comment",
      postId: post,
      body: "Forged",
      authorInitials: "FA",
    }),
    "invalid-argument",
  );
});

test("DM edits preserve participants, original identity snapshots, images and read state; only sender controls content", async () => {
  const db = await fixture(),
    message = (
      await db.command("alice", {
        type: "dm.send",
        userId: "bob",
        body: "Original",
      })
    ).id;
  const image = {
    id: "image",
    mimeType: "image/webp",
    width: 2,
    height: 2,
    size: 20,
  };
  db.docs.set(`directMessages/${message}`, {
    ...db.get(`directMessages/${message}`),
    image,
  });
  db.docs.set("privateMedia/image", {
    id: "image",
    state: "ready",
    image,
    sanitizedPath: "private/image.webp",
    linkedCollection: "directMessages",
    linkedId: message,
  });
  await db.command("bob", { type: "dm.read", userId: "alice" });
  const before = structuredClone(db.get(`directMessages/${message}`));
  assert.equal(before.fromName, "alice Person");
  assert.equal(before.toInitials, "BP");
  await db.command("alice", {
    type: "profile.update",
    profile: { name: "A Changed Name" },
  });
  await db.command("alice", {
    type: "dm.edit",
    messageId: message,
    body: "Corrected",
  });
  const after = { ...db.get(`directMessages/${message}`) };
  delete after.editedAt;
  delete after.body;
  const preserved = { ...before };
  delete preserved.body;
  assert.deepEqual(after, preserved);
  assert.equal(db.get(`directMessages/${message}`).body, "Corrected");
  await rejects(
    db.command("alice", {
      type: "dm.edit",
      messageId: message,
      body: "Forgery",
      toId: "eve",
      read: false,
    }),
    "invalid-argument",
  );
  await rejects(
    db.command("bob", {
      type: "dm.edit",
      messageId: message,
      body: "Not mine",
    }),
  );
  db.docs.set("users/eve", { ...db.get("users/eve"), role: "admin" });
  await rejects(db.command("eve", { type: "dm.delete", messageId: message }));
  await db.command("bob", { type: "profile.block", userId: "alice" });
  await rejects(
    db.command("alice", {
      type: "dm.edit",
      messageId: message,
      body: "Blocked pair",
    }),
  );
  await db.command("alice", { type: "dm.delete", messageId: message });
  assert.equal(db.get(`directMessages/${message}`), undefined);
  await rejects(
    db.tx((store) => authorizeMediaRead(store, "alice", "image", now)),
    "not-found",
  );
});

test("muting suppresses new DM notices and delayed push while keeping message history readable", async () => {
  const db = await fixture();
  await db.command("alice", {
    type: "dm.send",
    userId: "bob",
    body: "Before mute",
  });
  const pending = db.notices("bob")[0];
  await db.command("bob", { type: "dm.mute", userId: "alice", muted: true });
  await db.command("bob", { type: "dm.mute", userId: "alice", muted: true });
  assert.deepEqual(db.get("users/bob").preferences.dmMutedIds, ["alice"]);
  const sent = (
    await db.command("alice", {
      type: "dm.send",
      userId: "bob",
      body: "Quietly stored",
    })
  ).id;
  assert.equal(db.get(`directMessages/${sent}`).body, "Quietly stored");
  assert.equal(db.notices("bob").length, 1);
  assert.equal(
    shouldDeliverPush(pending, db.get("users/bob").preferences, new Date(now)),
    false,
  );
  assert.equal(
    shouldDeliverPush(
      { id: "old-request_dm", kind: "message", targetId: "alice" },
      db.get("users/bob").preferences,
      new Date(now),
    ),
    false,
  );
  assert.equal(
    shouldDeliverPush(
      { id: "channel_reply", kind: "message", targetId: "alice" },
      db.get("users/bob").preferences,
      new Date(now),
    ),
    true,
  );
  await db.command("bob", { type: "dm.read", userId: "alice" });
  assert.equal(db.get(`directMessages/${sent}`).read, true);
  await db.command("bob", { type: "dm.mute", userId: "alice", muted: false });
  await db.command("alice", {
    type: "dm.send",
    userId: "bob",
    body: "Ping restored",
  });
  assert.equal(db.notices("bob").length, 2);
  await rejects(
    db.command("bob", {
      type: "preferences.update",
      preferences: { dmMutedIds: ["eve"] },
    }),
    "invalid-argument",
  );
});

test("conversation-scoped unread pages progress beyond 200 unrelated messages without marking another peer", async () => {
  const db = await fixture();
  for (let n = 0; n < 205; n++) db.message(`other-${n}`, "eve", "bob");
  for (let n = 0; n < 205; n++) db.message(`selected-${n}`, "alice", "bob");
  db.message("own-outgoing", "bob", "alice");
  const first = await db.command("bob", { type: "dm.read", userId: "alice" });
  assert.equal(first.marked, 200);
  assert.equal(first.hasMore, true);
  const second = await db.command("bob", { type: "dm.read", userId: "alice" });
  assert.equal(second.marked, 5);
  assert.equal(second.hasMore, false);
  for (let n = 0; n < 205; n++) {
    assert.equal(db.get(`directMessages/selected-${n}`).read, true);
    assert.equal(db.get(`directMessages/other-${n}`).read, false);
  }
  assert.equal(db.get("directMessages/own-outgoing").read, false);
});

test("only recipient-authored directional history grants replies, including media, and blocks always win", async () => {
  const db = await fixture();
  db.docs.delete(`connections/${pairId("alice", "bob")}`);
  await db.command("alice", {
    type: "preferences.update",
    preferences: { dmPolicy: "nobody" },
  });
  await db.command("bob", {
    type: "preferences.update",
    preferences: { dmPolicy: "everyone" },
  });
  db.message("outbound-to-another-person", "alice", "someone-else");
  db.message("unanswered-attacker", "eve", "alice");
  await rejects(
    db.command("eve", {
      type: "dm.send",
      userId: "alice",
      body: "My unanswered inbound is not consent",
    }),
  );
  await db.command("alice", {
    type: "dm.send",
    userId: "bob",
    body: "I started this conversation",
  });
  const reply = await db.command("bob", {
    type: "dm.send",
    userId: "alice",
    body: "You messaged me, so I can reply",
  });
  assert.equal(db.get(`directMessages/${reply.id}`).fromName, "bob Person");
  const input = mediaUploadInput({
    target: { kind: "directMessage", id: "alice" },
    contentType: "image/png",
    base64: "AA==",
    requestId: "reply-image",
  });
  await db.tx((store) => claimMediaUpload(store, "bob", input, "claim", now));
  await db.command("alice", { type: "profile.block", userId: "bob" });
  await rejects(
    db.command("bob", {
      type: "dm.send",
      userId: "alice",
      body: "Prior consent cannot bypass a block",
    }),
  );
  await rejects(
    db.tx((store) =>
      claimMediaUpload(
        store,
        "bob",
        { ...input, requestId: "blocked-image" },
        "claim",
        now,
      ),
    ),
  );
});
