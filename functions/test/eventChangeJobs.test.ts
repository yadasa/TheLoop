import test from "node:test";
import assert from "node:assert/strict";
import { Doc } from "../src/policy";
import type { TransactionStore } from "../src/service";
import {
  eventChangeJob,
  eventNoticeCurrent,
  eventReminderEligible,
  eventReminderNotice,
  processEventChangePage,
  scrubEventChangeJob,
  eventChangeJobExpired,
  createEventReminder,
} from "../src/eventChangeJobs";

const now = "2026-10-26T12:00:00.000Z";
const event = (fields: Doc = {}): Doc => ({
  id: "coffee",
  hostId: "host",
  title: "Coffee",
  startAt: "2026-10-26T12:20:00.000Z",
  endAt: "2026-10-26T13:00:00.000Z",
  sequence: 1,
  attendeeIds: ["alice", "bob"],
  waitlistIds: [],
  ...fields,
});
class Database {
  docs = new Map<string, Doc>();
  maxWrites = 0;
  async tx<T>(work: (store: TransactionStore) => Promise<T>, fail = false) {
    const snapshot = structuredClone(this.docs);
    let writes = 0;
    const store: TransactionStore = {
      get: async (path) => snapshot.get(path),
      find: async () => [],
      set: (path, data) => {
        snapshot.set(path, data);
        writes++;
      },
      remove: (path) => {
        snapshot.delete(path);
        writes++;
      },
    };
    const result = await work(store);
    this.maxWrites = Math.max(this.maxWrites, writes);
    if (fail) throw new Error("Simulated transaction rollback");
    this.docs = snapshot;
    return result;
  }
  notices() {
    return [...this.docs]
      .filter(([path]) => path.startsWith("notifications/"))
      .map(([, notice]) => notice);
  }
  setup(current: Doc) {
    const job = eventChangeJob(current, "host", ["bob"], ["capacity"], now);
    this.docs.set("events/coffee", current);
    this.docs.set(`eventChangeJobs/${job.id}`, job);
    for (const uid of job.recipientIds)
      this.docs.set(`users/${uid}`, { preferences: {} });
    return job;
  }
}

test("notification fanout pages at most 100 recipients and commits cursor with stable notices", async () => {
  const db = new Database(),
    job = db.setup(
      event({
        attendeeIds: Array.from({ length: 1000 }, (_, n) => `going-${n}`),
        waitlistIds: Array.from({ length: 500 }, (_, n) => `waiting-${n}`),
      }),
    );
  let pages = 0;
  for (;;) {
    const result = await db.tx((store) =>
      processEventChangePage(store, job.id, now, 100),
    );
    pages++;
    assert.ok(result.processed <= 100);
    if (result.complete) break;
  }
  assert.equal(pages, 15);
  assert.equal(db.notices().length, 1500);
  assert.ok(db.maxWrites <= 101);
  const before = structuredClone(db.docs);
  assert.deepEqual(
    await db.tx((store) => processEventChangePage(store, job.id, now)),
    { processed: 0, complete: true },
  );
  assert.deepEqual(db.docs, before);
});

test("transaction rollback and retry cannot lose cursor progress or duplicate delivery", async () => {
  const db = new Database(),
    job = db.setup(event());
  await assert.rejects(
    db.tx((store) => processEventChangePage(store, job.id, now, 1), true),
    /rollback/,
  );
  assert.equal(db.docs.get(`eventChangeJobs/${job.id}`)!.cursor, 0);
  assert.equal(db.notices().length, 0);
  await db.tx((store) => processEventChangePage(store, job.id, now, 1));
  await db.tx((store) => processEventChangePage(store, job.id, now, 1));
  assert.equal(db.notices().length, 2);
  assert.equal(new Set(db.notices().map((notice) => notice.id)).size, 2);
  assert.equal(
    db.notices().find((notice) => notice.userId === "bob")!.eventNoticeType,
    "promoted",
  );
});

test("cancel notices remain in-app for reminder opt-outs, with active accounts and blocks respected", async () => {
  const db = new Database(),
    job = db.setup(
      event({
        status: "cancelled",
        cancellationReason: "Venue unavailable",
        attendeeIds: ["alice", "bob", "disabled", "deleting", "blocked"],
      }),
    );
  db.docs.set("users/alice", { preferences: { eventReminders: false } });
  db.docs.set("users/disabled", { disabled: true });
  db.docs.set("users/deleting", { deletionPending: true });
  db.docs.set("users/blocked", { preferences: { blockedIds: ["host"] } });
  await db.tx((store) => processEventChangePage(store, job.id, now));
  assert.deepEqual(
    db
      .notices()
      .map((notice) => notice.userId)
      .sort(),
    ["alice", "bob"],
  );
  assert.ok(
    db
      .notices()
      .every(
        (notice) =>
          notice.eventNoticeType === "cancelled" &&
          notice.body.includes("Venue unavailable"),
      ),
  );
});

test("new revisions and cancellation supersede obsolete update jobs without stale notices", async () => {
  const db = new Database(),
    job = db.setup(event());
  db.docs.set("events/coffee", event({ status: "cancelled", sequence: 2 }));
  await db.tx((store) => processEventChangePage(store, job.id, now));
  assert.equal(db.notices().length, 0);
  assert.equal(db.docs.get(`eventChangeJobs/${job.id}`)!.status, "superseded");
  const removed = new Database(),
    second = removed.setup(event());
  removed.docs.delete("events/coffee");
  await removed.tx((store) => processEventChangePage(store, second.id, now));
  assert.equal(removed.notices().length, 0);
});

test("reminders use current attendance, cancellation, time, opt-in and active-account state", () => {
  const current = event(),
    user = { preferences: {} };
  assert.equal(eventReminderEligible(current, "alice", user, now), true);
  for (const [changed, member] of [
    [{ ...current, status: "cancelled" }, user],
    [{ ...current, attendeeIds: [] }, user],
    [{ ...current, startAt: "2026-10-26T11:59:00Z" }, user],
    [current, { disabled: true }],
    [current, { deletionPending: true }],
    [current, { preferences: { eventReminders: false } }],
    [current, { preferences: { blockedIds: ["host"] } }],
  ] as const)
    assert.equal(eventReminderEligible(changed, "alice", member, now), false);
});

test("reminder transactions reread cancelled or rescheduled candidates and only write once per actual start", async () => {
  const db = new Database();
  db.setup(event());
  db.docs.set("events/coffee", event({ status: "cancelled" }));
  assert.equal(
    await db.tx((store) => createEventReminder(store, "coffee", "alice", now)),
    false,
  );
  db.docs.set("events/coffee", event());
  assert.equal(
    await db.tx((store) => createEventReminder(store, "coffee", "alice", now)),
    true,
  );
  assert.equal(
    await db.tx((store) => createEventReminder(store, "coffee", "alice", now)),
    false,
  );
  db.docs.set("events/coffee", event({ startAt: "2026-10-26T12:25:00.000Z" }));
  assert.equal(
    await db.tx((store) => createEventReminder(store, "coffee", "alice", now)),
    true,
  );
  db.docs.set("events/coffee", event({ attendeeIds: [] }));
  assert.equal(
    await db.tx((store) => createEventReminder(store, "coffee", "alice", now)),
    false,
  );
  assert.equal(db.notices().length, 2);
});

test("reminder IDs change on reschedule while stale reminders and outdated change notices cannot push", () => {
  const current = event(),
    user = { preferences: {} },
    notice = eventReminderNotice(current, "alice", now);
  const moved = event({ startAt: "2026-10-26T12:25:00.000Z", sequence: 2 });
  assert.notEqual(eventReminderNotice(moved, "alice", now).id, notice.id);
  assert.equal(
    eventReminderNotice(
      { ...current, sequence: 2, title: "Cosmetic edit" },
      "alice",
      now,
    ).id,
    notice.id,
  );
  assert.equal(eventNoticeCurrent(notice, current, "alice", user, now), true);
  assert.equal(eventNoticeCurrent(notice, moved, "alice", user, now), false);
  assert.equal(
    eventNoticeCurrent(
      notice,
      { ...current, status: "cancelled" },
      "alice",
      user,
      now,
    ),
    false,
  );
  assert.equal(
    eventNoticeCurrent(
      { kind: "event", eventSequence: 1, eventNoticeType: "updated" },
      moved,
      "alice",
      user,
      now,
    ),
    false,
  );
  assert.equal(
    eventNoticeCurrent(
      { kind: "event", eventSequence: 2, eventNoticeType: "cancelled" },
      { ...moved, status: "cancelled" },
      "alice",
      user,
      now,
    ),
    true,
  );
});

test("account deletion scrubs queued recipients and actors without moving the cursor past undelivered members", async () => {
  const db = new Database(),
    job = db.setup(event({ attendeeIds: ["alice", "bob", "eve"] }));
  await db.tx((store) => processEventChangePage(store, job.id, now, 1));
  const path = `eventChangeJobs/${job.id}`;
  const scrubbed = scrubEventChangeJob(db.docs.get(path)!, "alice");
  assert.equal(scrubbed.cursor, 0);
  assert.deepEqual(scrubbed.recipientIds, ["bob", "eve"]);
  db.docs.set(path, scrubbed);
  await db.tx((store) => processEventChangePage(store, job.id, now, 1));
  assert.ok(db.notices().some((notice) => notice.userId === "bob"));
  const scrubFuture = scrubEventChangeJob(db.docs.get(path)!, "eve");
  assert.equal(scrubFuture.cursor, 1);
  assert.deepEqual(scrubFuture.recipientIds, ["bob"]);
  assert.deepEqual(scrubEventChangeJob(scrubFuture, "eve"), scrubFuture);
  assert.equal(
    scrubEventChangeJob({ ...scrubFuture, actorId: "host" }, "host").actorId,
    "deleted-member",
  );
});

test("only completed or superseded jobs expire after seven days, preserving pending cancellation delivery", () => {
  const old = { createdAt: "2026-10-01T00:00:00.000Z" };
  assert.equal(
    eventChangeJobExpired({ ...old, status: "complete" }, now),
    true,
  );
  assert.equal(
    eventChangeJobExpired({ ...old, status: "superseded" }, now),
    true,
  );
  assert.equal(
    eventChangeJobExpired({ ...old, status: "pending" }, now),
    false,
  );
  assert.equal(
    eventChangeJobExpired({ createdAt: now, status: "complete" }, now),
    false,
  );
});
