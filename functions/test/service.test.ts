import test from "node:test";
import assert from "node:assert/strict";
import { bootstrap, execute, Actor, TransactionStore } from "../src/service";
import { Doc, DomainError } from "../src/policy";
import { directMessageRead } from "../src/directConversations";

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
      find: async (collection, field, value, limit, secondary) =>
        [...snapshot.entries()]
          .filter(
            ([path, data]) =>
              path.startsWith(collection + "/") &&
              path.split("/").length === 2 &&
              data[field] === value &&
              (!secondary || data[secondary.field] === secondary.value),
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
test("message replies stay in their authorized channel and original topic", async () => {
  const db = await database();
  db.documents.set("messages/parent", { id: "parent", channelId: "lobby", topic: "General", authorId: "bob", body: "Original", createdAt: now, reactions: {} });
  await assert.rejects(db.command("alice", { type: "message.send", channelId: "lobby", topic: "Travel", body: "Wrong topic", replyTo: "parent" }), /same group chat and topic/);
  await assert.rejects(db.command("alice", { type: "message.send", channelId: "private", topic: "General", body: "Wrong channel", replyTo: "parent" }), /same group chat and topic/);
  const result = await db.command("alice", { type: "message.send", channelId: "lobby", topic: "General", body: "Same conversation", replyTo: "parent" });
  assert.equal(db.get(`messages/${result.id}`).replyTo, "parent");
});

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

test("event lifecycle commands preserve revision, FIFO capacity, private jobs and idempotent cancellation", async () => {
  const db = await database();
  const draft = {
    conferenceId: "afrotech",
    title: "A plan",
    description: "",
    startAt: "2026-10-27T12:00:00Z",
    endAt: "2026-10-27T13:00:00Z",
    timezone: "UTC",
    location: "Lobby",
    kind: "meetup",
    capacity: 1,
    tags: [],
    url: "https://example.test/",
  };
  const created = await db.command("alice", {
    type: "event.create",
    event: draft,
  });
  const path = `events/${created.id}`;
  assert.equal(db.get(path).description, "");
  assert.equal(db.get(path).sequence, 0);
  assert.equal(db.get(path).status, "scheduled");
  await db.command("bob", { type: "event.rsvp", eventId: created.id });
  await db.command("eve", { type: "event.rsvp", eventId: created.id });
  db.get("users/eve").role = "moderator";
  await assert.rejects(
    db.command("eve", {
      type: "event.edit",
      eventId: created.id,
      expectedSequence: 0,
      event: { title: "Impersonation" },
    }),
    /Only the event host/,
  );
  const change = {
    type: "event.edit",
    eventId: created.id,
    expectedSequence: 0,
    event: { capacity: 2 },
  };
  await db.command("alice", change, "capacity-change");
  await db.command("alice", change, "capacity-change");
  assert.equal(db.get(path).sequence, 1);
  assert.deepEqual(db.get(path).attendeeIds, ["alice", "bob"]);
  assert.deepEqual(db.get(path).waitlistIds, ["eve"]);
  await assert.rejects(db.command("alice", change), /event changed/);
  await db.command("alice", {
    type: "event.edit",
    eventId: created.id,
    expectedSequence: 1,
    event: { url: "" },
  });
  assert.equal(db.get(path).url, undefined);
  assert.equal(db.get(path).sequence, 2);
  const cancel = await db.command("alice", {
    type: "event.cancel",
    eventId: created.id,
    expectedSequence: 2,
    reason: "Venue unavailable",
  });
  assert.equal(cancel.status, "cancelled");
  assert.equal(cancel.sequence, 3);
  const retry = await db.command("alice", {
    type: "event.cancel",
    eventId: created.id,
    expectedSequence: 0,
  });
  assert.equal(retry.unchanged, true);
  assert.equal(db.get(path).sequence, 3);
  assert.equal(
    [...db.documents.keys()].filter((key) => key.startsWith("eventChangeJobs/"))
      .length,
    3,
  );
  await assert.rejects(
    db.command("alice", {
      type: "event.edit",
      eventId: created.id,
      expectedSequence: 3,
      event: { title: "Reopen" },
    }),
    /Cancelled/,
  );
  await assert.rejects(
    db.command("alice", {
      type: "event.edit",
      eventId: created.id,
      expectedSequence: 3,
      event: { hostId: "eve" },
    }),
    /Cancelled/,
  );
  await db.command("bob", { type: "event.rsvp", eventId: created.id });
  assert.deepEqual(db.get(path).attendeeIds, ["alice"]);
  assert.deepEqual(db.get(path).waitlistIds, ["eve"]);
  db.get("users/eve").role = "admin";
  await assert.rejects(
    db.command("eve", {
      type: "event.checkin",
      eventId: created.id,
      userId: "alice",
    }),
    /Cancelled/,
  );
});

test("event creation requires real absolute instants and cannot forge lifecycle or ownership fields", async () => {
  const db = await database();
  const draft = {
    conferenceId: "afrotech",
    title: "A plan",
    description: "",
    startAt: "2027-02-28T12:00:00Z",
    endAt: "2027-02-28T13:00:00Z",
    timezone: "UTC",
    location: "Lobby",
    kind: "meetup",
    capacity: 0,
    tags: [],
  };
  for (const patch of [
    { startAt: "2027-02-30T12:00:00Z" },
    { startAt: "2027-02-28T12:00:00" },
    { startAt: "2027-02-28T12:00:00+25:00" },
    { status: "cancelled" },
    { sequence: 99 },
    { hostId: "eve" },
    { attendeeIds: ["eve"] },
  ])
    await assert.rejects(
      db.command("alice", {
        type: "event.create",
        event: { ...draft, ...patch },
      }),
      (error) =>
        error instanceof DomainError && error.code === "invalid-argument",
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
  assert.equal(
    directMessageRead(
      db.get(`directMessages/${sent.id}`),
      db.get("directConversations/alice~bob"),
    ),
    true,
  );
  assert.equal(read.hasMore, false);
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
test("post mutation handlers maintain the contributor query index without accepting client IDs", async () => {
  const db = await database();
  for (const uid of ["alice", "bob"])
    await db.command(uid, { type: "community.join", communityId: "builders" });
  const payload = {
    type: "post.create",
    communityId: "builders",
    title: "A useful poll",
    body: "",
    kind: "poll",
    options: ["Coffee", "Dinner"],
  };
  await assert.rejects(
    () => db.command("alice", { ...payload, contributorIds: ["forged"] }),
    /cannot be changed/,
  );
  const created = await db.command("alice", payload);
  assert.deepEqual(db.get(`posts/${created.id}`).contributorIds, []);
  await db.command("bob", { type: "post.vote", postId: created.id, value: 1 });
  assert.deepEqual(db.get(`posts/${created.id}`).contributorIds, ["bob"]);
  await db.command("bob", { type: "post.vote", postId: created.id, value: 1 });
  assert.deepEqual(db.get(`posts/${created.id}`).contributorIds, []);
  await db.command("bob", {
    type: "poll.vote",
    postId: created.id,
    optionId: "option-0",
  });
  await db.command("bob", {
    type: "post.comment",
    postId: created.id,
    body: "My context for this choice",
  });
  assert.deepEqual(db.get(`posts/${created.id}`).contributorIds, ["bob"]);
});
test("replacing displayed onboarding choices mutes deselected follows and preserves explicit mutes/hides", async () => {
  const db = await database();
  for (const channelId of ["chosen", "inherited", "quiet", "hidden", "outside"])
    db.documents.set(`channels/${channelId}`, {
      id: channelId,
      conferenceId: "afrotech",
      visibility: "public",
      members: channelId === "outside" ? 1 : 0,
    });
  await db.command("alice", {
    type: "subscription.set",
    targetId: "lobby",
    value: "following",
  });
  db.get("users/alice").preferences.subscriptions = {
    ...db.get("users/alice").preferences.subscriptions,
    afrotech: "following",
    quiet: "muted",
    hidden: "hidden",
    outside: "following",
  };
  await db.command("alice", {
    type: "onboarding.complete",
    interests: ["Technology"],
    channelIds: ["chosen"],
    replaceChannels: true,
    channelScopeIds: ["lobby", "chosen", "inherited", "quiet", "hidden"],
  });
  assert.deepEqual(db.get("users/alice").preferences.subscriptions, {
    afrotech: "following",
    lobby: "muted",
    chosen: "following",
    inherited: "muted",
    quiet: "muted",
    hidden: "hidden",
    outside: "following",
  });
  assert.equal(db.get("channels/lobby").members, 0);
  assert.equal(db.get("channels/chosen").members, 1);
  assert.equal(db.get("channels/inherited").members, 0);
  assert.equal(db.get("channels/outside").members, 1);
  await db.command("alice", {
    type: "onboarding.complete",
    interests: [],
    channelIds: ["chosen"],
    replaceChannels: true,
    channelScopeIds: ["lobby", "chosen"],
  });
  assert.equal(db.get("channels/chosen").members, 1);
});
test("default onboarding stays additive and empty interest-only update never clears follows", async () => {
  const db = await database();
  await db.command("alice", {
    type: "subscription.set",
    targetId: "lobby",
    value: "following",
  });
  await db.command("alice", {
    type: "onboarding.complete",
    interests: ["Design"],
    channelIds: [],
  });
  assert.equal(
    db.get("users/alice").preferences.subscriptions.lobby,
    "following",
  );
  assert.equal(db.get("channels/lobby").members, 1);
});
test("replacement scope rejects hidden unauthorized private channels and selected IDs outside scope atomically", async () => {
  const db = await database();
  await assert.rejects(
    () =>
      db.command("bob", {
        type: "onboarding.complete",
        interests: [],
        channelIds: ["lobby"],
        replaceChannels: true,
        channelScopeIds: ["lobby", "private"],
      }),
    /Join this private/,
  );
  assert.equal(db.get("channels/lobby").members, undefined);
  assert.deepEqual(db.get("users/bob").preferences.subscriptions, {});
  await assert.rejects(
    () =>
      db.command("bob", {
        type: "onboarding.complete",
        interests: [],
        channelIds: ["lobby"],
        replaceChannels: true,
        channelScopeIds: [],
      }),
    /within the displayed/,
  );
  await assert.rejects(
    () =>
      db.command("bob", {
        type: "onboarding.complete",
        interests: [],
        channelIds: [],
        replaceChannels: true,
      }),
    /scope/,
  );
});
test("post authors can edit their content without changing identity, votes, or community", async () => {
  const db = await database();
  await db.command("alice", {
    type: "community.join",
    communityId: "builders",
  });
  const created = await db.command("alice", {
    type: "post.create",
    communityId: "builders",
    title: "Original",
    body: "Original body",
    kind: "discussion",
    url: "https://example.com/original",
  });
  const postBefore = structuredClone(db.get(`posts/${created.id}`));
  await db.command("alice", {
    type: "post.edit",
    postId: created.id,
    post: {
      title: "Clearer title",
      body: "Corrected context",
      tags: ["Community"],
      url: "",
    },
  });
  const edited = db.get(`posts/${created.id}`);
  assert.equal(edited.authorId, "alice");
  assert.equal(edited.communityId, "builders");
  assert.equal(edited.createdAt, postBefore.createdAt);
  assert.deepEqual(edited.votes, postBefore.votes);
  assert.equal(edited.editedAt, now);
  assert.equal(edited.url, undefined);
  await assert.rejects(
    () =>
      db.command("bob", {
        type: "post.edit",
        postId: created.id,
        post: { body: "Impersonation" },
      }),
    /Only the author/,
  );
  db.get("users/eve").role = "moderator";
  await assert.rejects(
    () =>
      db.command("eve", {
        type: "post.edit",
        postId: created.id,
        post: { body: "Moderator impersonation" },
      }),
    /Only the author/,
  );
  await assert.rejects(
    () =>
      db.command("alice", {
        type: "post.edit",
        postId: created.id,
        post: { votes: { alice: 100 }, authorId: "eve" },
      }),
    /Only title/,
  );
});
test("link-kind post edits cannot silently remove the required HTTPS destination", async () => {
  const db = await database();
  await db.command("alice", {
    type: "community.join",
    communityId: "builders",
  });
  const created = await db.command("alice", {
    type: "post.create",
    communityId: "builders",
    title: "Useful resource",
    body: "Read this",
    kind: "link",
    url: "https://example.com/resource",
  });
  await assert.rejects(
    () =>
      db.command("alice", {
        type: "post.edit",
        postId: created.id,
        post: { url: "" },
      }),
    /retain a valid HTTPS/,
  );
  assert.equal(
    db.get(`posts/${created.id}`).url,
    "https://example.com/resource",
  );
});
test("post authors can remove after leaving and members can unsave a deleted post", async () => {
  const db = await database();
  await db.command("alice", {
    type: "community.join",
    communityId: "builders",
  });
  const created = await db.command("alice", {
    type: "post.create",
    communityId: "builders",
    title: "My post",
    body: "My context",
    kind: "discussion",
  });
  await db.command("bob", { type: "post.save", postId: created.id });
  await db.command("alice", {
    type: "community.join",
    communityId: "builders",
  });
  await db.command(
    "alice",
    { type: "post.delete", postId: created.id },
    "author-delete",
  );
  assert.equal(db.documents.has(`posts/${created.id}`), false);
  assert.equal(db.get("moderationAudit/author-delete").authorization, "author");
  assert.equal(
    db.get("moderationAudit/author-delete").subjectAuthorId,
    "alice",
  );
  assert.equal(db.get("moderationAudit/author-delete").body, undefined);
  await db.command("bob", { type: "post.save", postId: created.id });
  assert.deepEqual(db.get("users/bob").preferences.savedPostIds, []);
  await assert.rejects(
    () => db.command("bob", { type: "post.save", postId: created.id }),
    /no longer available/,
  );
});
test("reply edit/delete obeys reply authorship, survives leaving, and preserves other replies", async () => {
  const db = await database();
  for (const uid of ["alice", "bob", "eve"])
    await db.command(uid, { type: "community.join", communityId: "builders" });
  const created = await db.command("alice", {
    type: "post.create",
    communityId: "builders",
    title: "Discussion",
    body: "Context",
    kind: "discussion",
  });
  const bobReply = await db.command("bob", {
    type: "post.comment",
    postId: created.id,
    body: "My reply",
  });
  const eveReply = await db.command("eve", {
    type: "post.comment",
    postId: created.id,
    body: "Other reply",
  });
  await assert.rejects(
    () =>
      db.command("alice", {
        type: "comment.delete",
        postId: created.id,
        commentId: bobReply.id,
      }),
    /reply author/,
  );
  db.get("users/eve").role = "moderator";
  await assert.rejects(
    () =>
      db.command("eve", {
        type: "comment.edit",
        postId: created.id,
        commentId: bobReply.id,
        body: "Forged",
      }),
    /Only the author/,
  );
  await db.command("bob", { type: "community.join", communityId: "builders" });
  await db.command("bob", {
    type: "comment.edit",
    postId: created.id,
    commentId: bobReply.id,
    body: "Corrected reply",
  });
  assert.equal(
    db
      .get(`posts/${created.id}`)
      .comments.find((comment: Doc) => comment.id === bobReply.id).editedAt,
    now,
  );
  await db.command("bob", {
    type: "comment.delete",
    postId: created.id,
    commentId: bobReply.id,
  });
  assert.deepEqual(
    db.get(`posts/${created.id}`).comments.map((comment: Doc) => comment.id),
    [eveReply.id],
  );
  assert.deepEqual(db.get(`posts/${created.id}`).contributorIds, ["eve"]);
  await db.command(
    "eve",
    { type: "post.delete", postId: created.id },
    "mod-delete",
  );
  assert.equal(
    db.get("moderationAudit/mod-delete").authorization,
    "global-moderator",
  );
});
test("comment reports remove exactly the reported reply, retain the parent thread, and audit the decision", async () => {
  const db = await database();
  for (const uid of ["alice", "bob", "eve"])
    await db.command(uid, { type: "community.join", communityId: "builders" });
  const created = await db.command("alice", {
    type: "post.create",
    communityId: "builders",
    title: "Keep this thread",
    body: "Parent context",
    kind: "discussion",
  });
  const reported = await db.command("bob", {
    type: "post.comment",
    postId: created.id,
    body: "Reported reply",
  });
  const retained = await db.command("eve", {
    type: "post.comment",
    postId: created.id,
    body: "Keep this reply",
  });
  const report = await db.command("alice", {
    type: "report.create",
    targetType: "comment",
    targetId: reported.id,
    postId: created.id,
    reason: "Please review only this reply",
  });
  db.get("users/eve").role = "moderator";
  await db.command(
    "eve",
    { type: "report.review", reportId: report.id, outcome: "remove" },
    "review-comment",
  );
  assert.equal(db.get(`posts/${created.id}`).title, "Keep this thread");
  assert.deepEqual(
    db.get(`posts/${created.id}`).comments.map((comment: Doc) => comment.id),
    [retained.id],
  );
  assert.deepEqual(db.get(`posts/${created.id}`).contributorIds, ["eve"]);
  assert.equal(db.get("moderationAudit/review-comment").targetId, reported.id);
  await assert.rejects(
    () =>
      db.command("alice", {
        type: "report.create",
        targetType: "comment",
        targetId: retained.id,
        reason: "Missing parent",
      }),
    /ID/,
  );
});
test("reported snapshots are bounded and available only after the reporter can read the target", async () => {
  const db = await database();
  const sent = await db.command("alice", {
    type: "message.send",
    channelId: "private",
    topic: "Private",
    body: "Sensitive contextual message",
  });
  await assert.rejects(
    () =>
      db.command("bob", {
        type: "report.create",
        targetType: "message",
        targetId: sent.id,
        reason: "Unauthorized read attempt",
      }),
    /Join this private/,
  );
  const ownReport = await db.command("alice", {
    type: "report.create",
    targetType: "message",
    targetId: sent.id,
    reason: "Review this context",
  });
  assert.equal(
    db.get(`reports/${ownReport.id}`).snapshot.body,
    "Sensitive contextual message",
  );
  assert.equal(db.get(`reports/${ownReport.id}`).snapshot.authorId, "alice");
  await db.command("alice", { type: "message.delete", messageId: sent.id });
  assert.equal(
    db.get(`reports/${ownReport.id}`).snapshot.body,
    "Sensitive contextual message",
  );
  await db.command("bob", {
    type: "profile.update",
    profile: { visibility: "connections", bio: "Private profile context" },
  });
  await assert.rejects(
    () =>
      db.command("eve", {
        type: "report.create",
        targetType: "profile",
        targetId: "bob",
        reason: "Cannot read this profile",
      }),
    /connections only/,
  );
  db.documents.set("directMessages/private-dm", {
    id: "private-dm",
    fromId: "alice",
    toId: "bob",
    participantIds: ["alice", "bob"],
    body: "x".repeat(3000),
  });
  await assert.rejects(
    () =>
      db.command("eve", {
        type: "report.create",
        targetType: "directMessage",
        targetId: "private-dm",
        reason: "Unauthorized private conversation",
      }),
    /participant/,
  );
  const dmReport = await db.command("bob", {
    type: "report.create",
    targetType: "directMessage",
    targetId: "private-dm",
    reason: "Review a received message",
  });
  assert.equal(db.get(`reports/${dmReport.id}`).snapshot.body.length, 2000);
  db.get("users/eve").role = "moderator";
  await db.command("eve", {
    type: "report.review",
    reportId: dmReport.id,
    outcome: "remove",
  });
  assert.equal(db.documents.has("directMessages/private-dm"), false);
});


test("message pins require moderator authority and private channel membership", async () => {
  const db = await database();
  db.documents.set("messages/pin-message", { id: "pin-message", channelId: "lobby", authorId: "alice", body: "Meetup details", topic: "General" });
  const command = { type: "message.pin", channelId: "lobby", messageId: "pin-message", pinned: true };
  await assert.rejects(db.command("alice", command), /moderator/);
  db.get("channels/lobby").moderatorIds = ["alice"];
  await db.command("alice", command, "pin-receipt");
  assert.deepEqual(db.get("channels/lobby").pinnedMessageIds, ["pin-message"]);
  assert.equal(db.get("moderationAudit/pin-receipt").action, "message.pin");
  assert.equal((await db.command("alice", command, "pin-receipt")).duplicate, true);
  db.get("users/bob").role = "admin";
  await assert.rejects(db.command("bob", { ...command, channelId: "private" }), /private channel/);
  await assert.rejects(db.command("alice", { ...command, pinned: "true" }), /pin or unpin/);
  await assert.rejects(db.command("alice", { ...command, role: "admin" }), /field/);
  await assert.rejects(db.command("alice", { ...command, messageId: "missing" }), /no longer available/);
  db.documents.set("messages/other-room", { id: "other-room", channelId: "private", authorId: "alice", body: "Private" });
  await assert.rejects(db.command("alice", { ...command, messageId: "other-room" }), /no longer available/);
});

test("pins enforce capacity, repair stale records, support unpin and disappear on message deletion", async () => {
  const db = await database();
  db.get("users/alice").role = "moderator";
  const ids = Array.from({ length: 21 }, (_, i) => `pinned-${i}`);
  for (const id of ids) db.documents.set(`messages/${id}`, { id, channelId: "lobby", authorId: "bob", body: "Details", topic: "General", reactions: {} });
  db.get("channels/lobby").pinnedMessageIds = ids.slice(0, 20);
  await assert.rejects(db.command("alice", { type: "message.pin", channelId: "lobby", messageId: ids[20], pinned: true }), /20 pinned messages/);
  await db.command("alice", { type: "message.pin", channelId: "lobby", messageId: ids[0], pinned: true });
  assert.equal(db.get("channels/lobby").pinnedMessageIds.length, 20);
  db.documents.delete(`messages/${ids[1]}`);
  await db.command("alice", { type: "message.pin", channelId: "lobby", messageId: ids[20], pinned: true });
  assert.equal(db.get("channels/lobby").pinnedMessageIds.length, 20);
  assert.equal(db.get("channels/lobby").pinnedMessageIds.includes(ids[1]), false);
  await db.command("bob", { type: "message.delete", messageId: ids[20] });
  assert.equal(db.get("channels/lobby").pinnedMessageIds.includes(ids[20]), false);
  await db.command("alice", { type: "message.pin", channelId: "lobby", messageId: ids[0], pinned: false });
  assert.equal(db.get("channels/lobby").pinnedMessageIds.includes(ids[0]), false);
});

test("community moderators can manage their channel pins and report removal clears the pin", async () => {
  const db = await database();
  db.get("channels/lobby").communityId = "builders";
  db.documents.set("messages/community-pin", { id: "community-pin", channelId: "lobby", authorId: "bob", body: "Details", topic: "General" });
  await db.command("eve", { type: "message.pin", channelId: "lobby", messageId: "community-pin", pinned: true });
  db.get("users/alice").role = "moderator";
  db.documents.set("reports/pinned-report", { id: "pinned-report", targetType: "message", targetId: "community-pin", targetAuthorId: "bob", status: "open" });
  await db.command("alice", { type: "report.review", reportId: "pinned-report", outcome: "remove" });
  assert.equal(db.documents.has("messages/community-pin"), false);
  assert.deepEqual(db.get("channels/lobby").pinnedMessageIds, []);
});
