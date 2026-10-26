import test from "node:test";
import assert from "node:assert/strict";
import { Doc, DomainError } from "../src/policy";
import {
  assertEventCheckinWindow,
  cancelEvent,
  editEvent,
  eventRsvpTransition,
} from "../src/eventLifecycle";

const now = "2026-10-26T12:00:00.000Z";
const user = { preferences: {} };
const event = (fields: Doc = {}): Doc => ({
  id: "coffee",
  hostId: "host",
  conferenceId: "afrotech",
  title: "Coffee",
  description: "Meet the community",
  startAt: "2026-10-27T12:00:00.000Z",
  endAt: "2026-10-27T13:00:00.000Z",
  timezone: "UTC",
  location: "Lobby",
  kind: "meetup",
  capacity: 2,
  tags: [],
  attendeeIds: ["host", "alice"],
  waitlistIds: ["bob", "eve"],
  ...fields,
});
const denied = (work: () => unknown, code = "permission-denied") =>
  assert.throws(
    work,
    (error) => error instanceof DomainError && error.code === code,
  );

test("only the actual host or an active global administrator controls event details and cancellation", () => {
  assert.equal(
    editEvent(event(), "host", user, { title: "Updated" }, 0, now).event.title,
    "Updated",
  );
  assert.equal(
    editEvent(
      event(),
      "admin",
      { role: "admin" },
      { title: "Admin correction" },
      0,
      now,
    ).event.hostId,
    "host",
  );
  for (const role of ["member", "moderator"]) {
    denied(() =>
      editEvent(
        event(),
        "outsider",
        { role },
        { title: "Impersonation" },
        0,
        now,
      ),
    );
    denied(() => cancelEvent(event(), "outsider", { role }, 0, "", now));
  }
  denied(
    () =>
      editEvent(
        event(),
        "host",
        { disabled: true },
        { title: "Disabled" },
        0,
        now,
      ),
    "failed-precondition",
  );
});

test("edits reject ownership, attendance, status and revision forgery and stale optimistic versions", () => {
  for (const patch of [
    { hostId: "eve" },
    { conferenceId: "other" },
    { attendeeIds: [] },
    { waitlistIds: [] },
    { sequence: 999 },
    { status: "cancelled" },
    { cancelledAt: now },
  ])
    denied(
      () => editEvent(event(), "host", user, patch, 0, now),
      "invalid-argument",
    );
  denied(
    () =>
      editEvent(
        event({ sequence: 2 }),
        "host",
        user,
        { title: "Stale overwrite" },
        1,
        now,
      ),
    "aborted",
  );
  denied(
    () =>
      editEvent(
        event(),
        "host",
        user,
        { title: "Missing version" },
        undefined,
        now,
      ),
    "invalid-argument",
  );
  const noChange = editEvent(
    event(),
    "host",
    user,
    { title: " Coffee " },
    0,
    now,
  );
  assert.equal(noChange.changed, false);
  assert.equal(noChange.event.sequence, undefined);
});

test("merged event details retain server bounds, safely clear links and validate dates together", () => {
  const original = event({ url: "https://example.test/" });
  const result = editEvent(
    original,
    "host",
    user,
    {
      url: "",
      timezone: "America/Chicago",
      startAt: "2026-10-28T10:00:00-05:00",
      endAt: "2026-10-28T11:00:00-05:00",
    },
    0,
    now,
  );
  assert.equal(result.event.url, undefined);
  assert.equal(result.event.startAt, "2026-10-28T15:00:00.000Z");
  assert.equal(result.event.sequence, 1);
  assert.equal(result.event.updatedAt, now);
  assert.equal(original.url, "https://example.test/");
  for (const patch of [
    { url: "http://example.test" },
    { location: "x".repeat(241) },
    { capacity: 1001 },
    { tags: Array(7).fill("tag") },
    { timezone: "Invalid/Zone" },
    { endAt: "2026-10-26T13:00:00Z" },
  ])
    denied(
      () => editEvent(original, "host", user, patch, 0, now),
      "invalid-argument",
    );
});

test("capacity never silently demotes confirmed attendees and increases promote FIFO within the 1000-member bound", () => {
  denied(
    () => editEvent(event(), "host", user, { capacity: 1 }, 0, now),
    "failed-precondition",
  );
  const expanded = editEvent(event(), "host", user, { capacity: 3 }, 0, now);
  assert.deepEqual(expanded.event.attendeeIds, ["host", "alice", "bob"]);
  assert.deepEqual(expanded.event.waitlistIds, ["eve"]);
  assert.deepEqual(expanded.promotedIds, ["bob"]);
  const large = event({
    capacity: 995,
    attendeeIds: Array.from({ length: 995 }, (_, n) => `going-${n}`),
    waitlistIds: Array.from({ length: 10 }, (_, n) => `waiting-${n}`),
  });
  const opened = editEvent(large, "host", user, { capacity: 0 }, 0, now);
  assert.equal(opened.event.attendeeIds.length, 1000);
  assert.deepEqual(opened.promotedIds, [
    "waiting-0",
    "waiting-1",
    "waiting-2",
    "waiting-3",
    "waiting-4",
  ]);
  assert.deepEqual(opened.event.waitlistIds, [
    "waiting-5",
    "waiting-6",
    "waiting-7",
    "waiting-8",
    "waiting-9",
  ]);
});

test("cancellation is terminal and idempotent while retaining participant and attendance history", () => {
  const original = event({ sequence: 3, checkinCount: 1 });
  const cancelled = cancelEvent(
    original,
    "host",
    user,
    3,
    "Venue unavailable",
    now,
  );
  assert.equal(cancelled.event.status, "cancelled");
  assert.equal(cancelled.event.sequence, 4);
  assert.equal(cancelled.event.cancelledBy, "host");
  assert.deepEqual(cancelled.event.attendeeIds, original.attendeeIds);
  assert.deepEqual(cancelled.event.waitlistIds, original.waitlistIds);
  assert.equal(cancelled.event.checkinCount, 1);
  assert.equal(
    cancelEvent(cancelled.event, "host", user, 0, "Different retry reason", now)
      .changed,
    false,
  );
  denied(
    () => editEvent(cancelled.event, "host", user, { title: "Reopen" }, 4, now),
    "failed-precondition",
  );
  denied(
    () => eventRsvpTransition(cancelled.event, "new-person", now),
    "failed-precondition",
  );
});

test("full attendee and waitlist bounds never prevent an existing member from withdrawing", () => {
  const full = event({
    capacity: 1000,
    attendeeIds: Array.from({ length: 1000 }, (_, n) => `going-${n}`),
    waitlistIds: Array.from({ length: 500 }, (_, n) => `waiting-${n}`),
  });
  const leaveGoing = eventRsvpTransition(full, "going-0", now);
  assert.equal(leaveGoing.attendeeIds.length, 1000);
  assert.equal(leaveGoing.promotedId, "waiting-0");
  assert.equal(leaveGoing.waitlistIds.length, 499);
  const leaveWaiting = eventRsvpTransition(full, "waiting-499", now);
  assert.equal(leaveWaiting.attendeeIds.length, 1000);
  assert.equal(leaveWaiting.waitlistIds.length, 499);
  assert.equal(leaveWaiting.promotedId, undefined);
  denied(
    () => eventRsvpTransition(full, "new-person", now),
    "resource-exhausted",
  );
});

test("cancelled and completed events permit own withdrawal without promoting a new attendee", () => {
  for (const inactive of [
    event({ status: "cancelled" }),
    event({ endAt: "2026-10-25T12:00:00Z" }),
  ]) {
    const result = eventRsvpTransition(inactive, "alice", now);
    assert.deepEqual(result.attendeeIds, ["host"]);
    assert.deepEqual(result.waitlistIds, ["bob", "eve"]);
    assert.equal(result.promotedId, undefined);
    denied(
      () => eventRsvpTransition(inactive, "new-person", now),
      "failed-precondition",
    );
    denied(
      () =>
        cancelEvent(
          inactive.status === "cancelled"
            ? event({ endAt: "2026-10-25T12:00:00Z" })
            : inactive,
          "host",
          user,
          0,
          "",
          now,
        ),
      "failed-precondition",
    );
  }
});

test("trust-bearing attendance has an active target and a bounded six-hour-before to 24-hour-after window", () => {
  const current = event({
    startAt: "2026-10-26T12:00:00.000Z",
    endAt: "2026-10-26T13:00:00.000Z",
  });
  assert.doesNotThrow(() =>
    assertEventCheckinWindow(current, user, "2026-10-26T06:00:00.000Z"),
  );
  assert.doesNotThrow(() =>
    assertEventCheckinWindow(current, user, "2026-10-27T13:00:00.000Z"),
  );
  for (const instant of [
    "2026-10-26T05:59:59.999Z",
    "2026-10-27T13:00:00.001Z",
  ])
    denied(
      () => assertEventCheckinWindow(current, user, instant),
      "failed-precondition",
    );
  for (const target of [
    undefined,
    { disabled: true },
    { deletionPending: true },
  ])
    denied(
      () => assertEventCheckinWindow(current, target, now),
      "failed-precondition",
    );
  denied(
    () =>
      assertEventCheckinWindow({ ...current, status: "cancelled" }, user, now),
    "failed-precondition",
  );
});
