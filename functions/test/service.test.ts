import test from "node:test";
import assert from "node:assert/strict";
import { bootstrap, execute, Actor, TransactionStore } from "../src/service";
import { Doc, DomainError } from "../src/policy";

const now = "2026-10-26T12:00:00Z";
const actor = (uid: string): Actor => ({ uid, name: uid, emailVerified: true });
class Database {
  documents = new Map<string, Doc>();
  sequence = 0;
  async tx<T>(work: (store: TransactionStore) => Promise<T>): Promise<T> {
    const snapshot = new Map<string, Doc>(
      [...this.documents.entries()].map(([path, value]) => [
        path,
        structuredClone(value),
      ]),
    );
    const store: TransactionStore = {
      get: async (path) => snapshot.get(path),
      find: async (collection, field, value, limit) =>
        [...snapshot.entries()]
          .filter(
            ([path, data]) =>
              path.startsWith(collection + "/") &&
              path.split("/").length === 2 &&
              data[field] === value,
          )
          .slice(0, limit)
          .map(([, data]) => data),
      set: (path, value) => {
        snapshot.set(path, value);
      },
      remove: (path) => {
        snapshot.delete(path);
      },
    };
    const result = await work(store);
    this.documents = snapshot;
    return result;
  }
  async boot(uid: string) {
    await this.tx((store) => bootstrap(store, actor(uid), now));
  }
  async command(
    uid: string,
    command: Doc,
    requestId = `request-${++this.sequence}`,
  ) {
    return this.tx((store) =>
      execute(store, actor(uid), { requestId, command }, now),
    );
  }
  get(path: string) {
    return this.documents.get(path)!;
  }
}
async function database() {
  const db = new Database();
  await db.boot("alice");
  await db.boot("bob");
  await db.boot("eve");
  db.documents.set("conferences/afrotech", { id: "afrotech" });
  db.documents.set("channels/lobby", {
    id: "lobby",
    conferenceId: "afrotech",
    visibility: "public",
  });
  db.documents.set("channels/private", {
    id: "private",
    conferenceId: "afrotech",
    visibility: "private",
    memberIds: ["alice"],
  });
  db.documents.set("communities/builders", {
    id: "builders",
    members: 0,
    moderatorIds: ["eve"],
  });
  return db;
}
test("bootstrap never seeds fabricated people, messages, badges or relationships", async () => {
  const db = new Database();
  await db.boot("new-member");
  assert.deepEqual([...db.documents.keys()].sort(), [
    "profiles/new-member",
    "trustSignals/new-member",
    "users/new-member",
  ]);
  assert.equal(db.get("profiles/new-member").verified, false);
  assert.equal(db.get("profiles/new-member").foundingYear, undefined);
  assert.deepEqual(
    db.get("users/new-member").preferences.joinedCommunityIds,
    [],
  );
});
test("idempotent retry creates only one message and consumes one rate-limit unit", async () => {
  const db = await database();
  const command = {
    type: "message.send",
    channelId: "lobby",
    topic: "Introductions",
    body: "Hello community",
  };
  await db.command("alice", command, "same-request");
  const result = await db.command("alice", command, "same-request");
  assert.equal(result.duplicate, true);
  assert.equal(
    [...db.documents.keys()].filter((path) => path.startsWith("messages/"))
      .length,
    1,
  );
  assert.equal(db.get("users/alice/system/rate").count, 1);
});
test("private-channel membership and authorship are checked server-side", async () => {
  const db = await database();
  await assert.rejects(
    () =>
      db.command("bob", {
        type: "message.send",
        channelId: "private",
        topic: "Private",
        body: "Unauthorized",
      }),
    /Join this private/,
  );
  const sent = await db.command("alice", {
    type: "message.send",
    channelId: "lobby",
    topic: "Introductions",
    body: "Original",
  });
  await assert.rejects(
    () =>
      db.command("bob", {
        type: "message.edit",
        messageId: sent.id,
        body: "Forged",
      }),
    /Only the author/,
  );
  assert.equal(db.get(`messages/${sent.id}`).body, "Original");
  await assert.rejects(
    () => db.command("bob", { type: "message.delete", messageId: sent.id }),
    /Only the author/,
  );
});
test("sending and replying preserve channel and topic mute preferences", async () => {
  const db = await database();
  await db.command("alice", {
    type: "subscription.set",
    targetId: "lobby",
    value: "muted",
  });
  await db.command("alice", {
    type: "subscription.set",
    targetId: "lobby:Introductions",
    value: "hidden",
  });
  await db.command("alice", {
    type: "message.send",
    channelId: "lobby",
    topic: "Introductions",
    body: "One useful reply",
  });
  assert.deepEqual(db.get("users/alice").preferences.subscriptions, {
    lobby: "muted",
    "lobby:Introductions": "hidden",
  });
});
test("community content requires membership and stored votes are one per member", async () => {
  const db = await database();
  const command = {
    type: "post.create",
    communityId: "builders",
    title: "What are you building?",
    body: "Share your work",
    kind: "discussion",
  };
  await assert.rejects(
    () => db.command("alice", command),
    /Join this community/,
  );
  await db.command("alice", {
    type: "community.join",
    communityId: "builders",
  });
  const created = await db.command("alice", command);
  await db.command("alice", {
    type: "post.vote",
    postId: created.id,
    value: 1,
  });
  await db.command("alice", {
    type: "post.vote",
    postId: created.id,
    value: -1,
  });
  assert.deepEqual(db.get(`posts/${created.id}`).votes, { alice: -1 });
});
test("connection recipients control acceptance and blocks close DM access", async () => {
  const db = await database();
  await assert.rejects(
    () =>
      db.command("alice", { type: "dm.send", userId: "bob", body: "Hello" }),
    /privacy settings/,
  );
  const request = await db.command("alice", {
    type: "connection.request",
    userId: "bob",
  });
  await assert.rejects(
    () =>
      db.command("eve", {
        type: "connection.respond",
        connectionId: request.id,
        accept: true,
      }),
    /Only the recipient/,
  );
  await db.command("bob", {
    type: "connection.respond",
    connectionId: request.id,
    accept: true,
  });
  await db.command("alice", {
    type: "dm.send",
    userId: "bob",
    body: "Hello after connecting",
  });
  assert.ok(db.get("profileAccess/alice/members/bob"));
  await db.command("bob", { type: "profile.block", userId: "alice" });
  assert.equal(db.documents.has(`connections/${request.id}`), false);
  assert.equal(db.documents.has("profileAccess/alice/members/bob"), false);
  await assert.rejects(
    () =>
      db.command("alice", {
        type: "dm.send",
        userId: "bob",
        body: "Blocked attempt",
      }),
    /unavailable/,
  );
});
test("RSVP toggles are transactional and release capacity to the FIFO waitlist", async () => {
  const db = await database();
  db.documents.set("events/coffee", {
    id: "coffee",
    title: "Community coffee",
    endAt: "2026-11-01T12:00:00Z",
    capacity: 1,
    attendeeIds: [],
    waitlistIds: [],
  });
  await db.command("alice", { type: "event.rsvp", eventId: "coffee" });
  const waiting = await db.command("bob", {
    type: "event.rsvp",
    eventId: "coffee",
  });
  assert.equal(waiting.status, "waitlisted");
  await db.command("alice", { type: "event.rsvp", eventId: "coffee" });
  assert.deepEqual(db.get("events/coffee").attendeeIds, ["bob"]);
  assert.deepEqual(db.get("events/coffee").waitlistIds, []);
  assert.ok(
    [...db.documents.values()].some(
      (value) =>
        value.userId === "bob" && value.title === "You’re off the waitlist",
    ),
  );
});
test("trust cannot be set by clients and repetitive request abuse is bounded", async () => {
  const db = await database();
  await assert.rejects(
    () =>
      db.command("alice", {
        type: "profile.update",
        profile: { trust: { score: 100 } },
      }),
    DomainError,
  );
  await assert.rejects(
    () =>
      db.command("alice", {
        type: "preferences.update",
        preferences: { joinedCommunityIds: ["builders"] },
      }),
    DomainError,
  );
  for (let i = 0; i < 45; i++)
    await db.command("alice", {
      type: "preferences.update",
      preferences: { quietHours: false },
    });
  await assert.rejects(
    () =>
      db.command("alice", {
        type: "preferences.update",
        preferences: { quietHours: false },
      }),
    /try again in a minute/,
  );
});
test("reports do not automatically punish a member and review requires a moderator", async () => {
  const db = await database();
  const before = structuredClone(db.get("profiles/bob").trust);
  const report = await db.command("alice", {
    type: "report.create",
    targetType: "profile",
    targetId: "bob",
    reason: "Please review this account",
  });
  assert.deepEqual(db.get("profiles/bob").trust, before);
  await assert.rejects(
    () =>
      db.command("eve", {
        type: "report.review",
        reportId: report.id,
        outcome: "dismiss",
      }),
    /Moderation access/,
  );
  db.get("users/eve").role = "moderator";
  await assert.rejects(
    () =>
      db.command("eve", {
        type: "report.review",
        reportId: report.id,
        outcome: "remove",
      }),
    /account review/,
  );
  assert.equal(db.get(`reports/${report.id}`).status, "open");
  await db.command("eve", {
    type: "report.review",
    reportId: report.id,
    outcome: "dismiss",
  });
  assert.equal(db.get(`reports/${report.id}`).status, "reviewed");
});
test("DM read receipts can only mark received messages for the opened peer", async () => {
  const db = await database();
  const connection = await db.command("alice", {
    type: "connection.request",
    userId: "bob",
  });
  await db.command("bob", {
    type: "connection.respond",
    connectionId: connection.id,
    accept: true,
  });
  const sent = await db.command("alice", {
    type: "dm.send",
    userId: "bob",
    body: "A private hello",
  });
  await db.command("alice", { type: "dm.read", userId: "bob" });
  assert.equal(db.get(`directMessages/${sent.id}`).read, false);
  const read = await db.command("bob", { type: "dm.read", userId: "alice" });
  assert.equal(read.marked, 1);
  assert.equal(db.get(`directMessages/${sent.id}`).read, true);
  assert.equal(db.get(`directMessages/${sent.id}`).unreadRecipientId, "");
});
test("conference creation requires a server-owned administrator role", async () => {
  const db = await database();
  const command = {
    type: "conference.create",
    conference: {
      name: "Builders Week",
      shortName: "BW",
      city: "Houston",
      startDate: "2026-11-01",
      endDate: "2026-11-03",
      description: "A community gathering",
      tagline: "Build together",
    },
  };
  await assert.rejects(() => db.command("alice", command), /administrator/);
  db.get("users/alice").role = "admin";
  const created = await db.command("alice", command);
  assert.equal(db.get(`conferences/${created.id}`).members, 0);
  assert.deepEqual(db.get(`conferences/${created.id}`).organizerIds, ["alice"]);
});
test("private channel membership is moderator-owned and excludes unauthorized posters", async () => {
  const db = await database();
  const command = {
    type: "channel.create",
    channel: {
      conferenceId: "afrotech",
      name: "volunteers",
      description: "The host team",
      icon: "#",
      topics: ["Plans"],
      visibility: "private",
      memberIds: ["bob"],
    },
  };
  await assert.rejects(
    () => db.command("alice", command),
    /Channel creation requires/,
  );
  db.get("users/alice").role = "moderator";
  const created = await db.command("alice", command);
  assert.deepEqual(db.get(`channels/${created.id}`).memberIds, [
    "alice",
    "bob",
  ]);
  await assert.rejects(
    () =>
      db.command("eve", {
        type: "channel.member",
        channelId: created.id,
        userId: "eve",
        add: true,
      }),
    /moderators/,
  );
  await db.command("bob", {
    type: "message.send",
    channelId: created.id,
    topic: "Plans",
    body: "Ready to help",
  });
  await db.command("alice", {
    type: "channel.member",
    channelId: created.id,
    userId: "bob",
    add: false,
  });
  await assert.rejects(
    () =>
      db.command("bob", {
        type: "message.send",
        channelId: created.id,
        topic: "Plans",
        body: "No access now",
      }),
    /Join this private/,
  );
  assert.equal(db.get(`channels/${created.id}`).members, 1);
});
test("only channel followers or private members can create topics; duplicate names are rejected", async () => {
  const db = await database();
  await assert.rejects(
    () =>
      db.command("alice", {
        type: "topic.create",
        channelId: "lobby",
        name: "Coffee chats",
      }),
    /Follow this channel/,
  );
  await db.command("alice", {
    type: "subscription.set",
    targetId: "lobby",
    value: "following",
  });
  await db.command("alice", {
    type: "topic.create",
    channelId: "lobby",
    name: "Coffee chats",
  });
  await assert.rejects(
    () =>
      db.command("alice", {
        type: "topic.create",
        channelId: "lobby",
        name: "coffee CHATS",
      }),
    /already exists/,
  );
  await assert.rejects(
    () =>
      db.command("alice", {
        type: "message.send",
        channelId: "lobby",
        topic: "Not a topic",
        body: "Invalid",
      }),
    /Create this topic/,
  );
});
test("membership counters change once per logical channel subscription transition", async () => {
  const db = await database();
  await db.command("alice", {
    type: "subscription.set",
    targetId: "lobby",
    value: "following",
  });
  await db.command("alice", {
    type: "subscription.set",
    targetId: "lobby",
    value: "following",
  });
  assert.equal(db.get("channels/lobby").members, 1);
  await db.command("alice", {
    type: "subscription.set",
    targetId: "lobby",
    value: "muted",
  });
  assert.equal(db.get("channels/lobby").members, 0);
  await db.command("alice", {
    type: "subscription.set",
    targetId: "lobby",
    value: "hidden",
  });
  assert.equal(db.get("channels/lobby").members, 0);
});
test("follows are directional, server-counted and trust-neutral, and retry does not toggle twice", async () => {
  const db = await database();
  const trust = structuredClone(db.get("profiles/alice").trust);
  await db.command(
    "alice",
    { type: "profile.follow", userId: "bob" },
    "follow-once",
  );
  await db.command(
    "alice",
    { type: "profile.follow", userId: "bob" },
    "follow-once",
  );
  assert.equal(db.get("profiles/alice").followingCount, 1);
  assert.equal(db.get("profiles/bob").followerCount, 1);
  assert.deepEqual(db.get("profiles/alice").trust, trust);
  assert.ok(db.get("follows/alice~bob"));
  assert.equal(db.documents.has("follows/bob~alice"), false);
  await db.command("alice", { type: "profile.follow", userId: "bob" });
  assert.equal(db.get("profiles/alice").followingCount, 0);
  assert.equal(db.get("profiles/bob").followerCount, 0);
});
test("blocking clears follows in both directions and preserves unrelated follower counts", async () => {
  const db = await database();
  await db.command("alice", { type: "profile.follow", userId: "bob" });
  await db.command("bob", { type: "profile.follow", userId: "alice" });
  await db.command("eve", { type: "profile.follow", userId: "bob" });
  await db.command(
    "bob",
    { type: "profile.block", userId: "alice" },
    "block-once",
  );
  await db.command(
    "bob",
    { type: "profile.block", userId: "alice" },
    "block-once",
  );
  assert.equal(db.documents.has("follows/alice~bob"), false);
  assert.equal(db.documents.has("follows/bob~alice"), false);
  assert.equal(db.get("profiles/alice").followerCount, 0);
  assert.equal(db.get("profiles/alice").followingCount, 0);
  assert.equal(db.get("profiles/bob").followerCount, 1);
  assert.equal(db.get("profiles/bob").followingCount, 0);
  assert.deepEqual(db.get("users/alice").preferences.followingIds, []);
  await assert.rejects(
    () => db.command("alice", { type: "profile.follow", userId: "bob" }),
    /unavailable/,
  );
});
test("arbitrary event hosts cannot farm attendance trust; approved organizers can confirm once", async () => {
  const db = await database();
  db.documents.set("events/coffee", {
    id: "coffee",
    conferenceId: "afrotech",
    hostId: "alice",
    title: "Coffee",
    startAt: now,
    endAt: "2026-10-26T15:00:00Z",
    attendeeIds: ["alice", "bob"],
  });
  const checkin = { type: "event.checkin", eventId: "coffee", userId: "bob" };
  await assert.rejects(
    () => db.command("alice", checkin),
    /approved conference organizer/,
  );
  assert.equal(db.get("trustSignals/bob").verifiedAttendance, 0);
  db.get("conferences/afrotech").organizerIds = ["alice"];
  await db.command("alice", checkin);
  assert.equal(db.get("trustSignals/bob").verifiedAttendance, 1);
  await assert.rejects(() => db.command("alice", checkin), /already confirmed/);
  await assert.rejects(
    () => db.command("alice", { ...checkin, userId: "alice" }),
    /own attendance/,
  );
});
