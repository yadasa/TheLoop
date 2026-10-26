import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, eventICS, initialState } from "../src/index";
import type { Command, EventDetails, LoopState } from "../src/types";
const now = "2026-10-26T16:00:00.000Z";
const event: EventDetails = {
  conferenceId: "afrotech",
  title: "Lifecycle coffee circle",
  description: "",
  startAt: "2026-11-06T08:00:00-06:00",
  endAt: "2026-11-06T10:00:00-06:00",
  timezone: "America/Chicago",
  location: "Houston",
  kind: "meetup",
  capacity: 2,
  tags: ["Coffee"],
};
const run = (
  state: LoopState,
  command: Command,
  id = "plan-change",
  instant = now,
) => applyCommand(state, command, { id, now: instant });
const create = () =>
  run(initialState(), { type: "event.create", event }, "plan");
test("event creation owns lifecycle fields and rejects forged calendar values", () => {
  const state = run(
    initialState(),
    {
      type: "event.create",
      event: {
        ...event,
        hostId: "maya",
        attendeeIds: ["maya"],
        sequence: 99,
        status: "cancelled",
      },
    } as unknown as Command,
    "plan",
  );
  const plan = state.events.find((item) => item.id === "plan")!;
  assert.equal(plan.hostId, "me");
  assert.equal(plan.sequence, 0);
  assert.equal(plan.status, "scheduled");
  assert.deepEqual(plan.attendeeIds, ["me"]);
  assert.equal(plan.startAt, "2026-11-06T14:00:00.000Z");
  for (const startAt of ["2026-11-06T08:00", "2027-02-30T08:00:00Z"])
    assert.throws(
      () =>
        run(initialState(), {
          type: "event.create",
          event: { ...event, startAt, endAt: "2027-11-06T20:00:00Z" },
        }),
      /offset|calendar/i,
    );
});
test("event edits preserve ownership/participants and enforce version and capacity", () => {
  const state = create(),
    plan = state.events.find((item) => item.id === "plan")!;
  plan.attendeeIds.push("maya");
  plan.waitlistIds.push("jordan", "imani");
  assert.throws(
    () =>
      run(state, {
        type: "event.edit",
        eventId: "plan",
        expectedSequence: 1,
        event: { title: "Stale edit" },
      }),
    /changed/,
  );
  assert.throws(
    () =>
      run(state, {
        type: "event.edit",
        eventId: "plan",
        expectedSequence: 0,
        event: { capacity: 1 },
      }),
    /lower/,
  );
  assert.throws(
    () =>
      run(state, {
        type: "event.edit",
        eventId: "plan",
        expectedSequence: 0,
        event: { hostId: "maya" },
      } as unknown as Command),
    /Only event details/,
  );
  const updated = run(state, {
    type: "event.edit",
    eventId: "plan",
    expectedSequence: 0,
    event: { capacity: 3, title: "A longer table" },
  }).events.find((item) => item.id === "plan")!;
  assert.deepEqual(updated.attendeeIds, ["me", "maya", "jordan"]);
  assert.deepEqual(updated.waitlistIds, ["imani"]);
  assert.equal(updated.sequence, 1);
  assert.equal(updated.hostId, "me");
});
test("ongoing plans can be corrected without changing their past start", () => {
  const state = create(),
    plan = state.events.find((item) => item.id === "plan")!;
  const edited = run(
    state,
    {
      type: "event.edit",
      eventId: "plan",
      expectedSequence: 0,
      event: { location: "Updated meeting point" },
    },
    "edit",
    "2026-11-06T15:00:00.000Z",
  ).events.find((item) => item.id === "plan")!;
  assert.equal(edited.startAt, plan.startAt);
  assert.equal(edited.location, "Updated meeting point");
  assert.throws(
    () =>
      run(
        state,
        {
          type: "event.edit",
          eventId: "plan",
          expectedSequence: 0,
          event: { title: "Too late" },
        },
        "edit",
        "2026-11-06T17:00:00Z",
      ),
    /finished/,
  );
});
test("cancellation is terminal/idempotent and retains people while allowing withdrawal", () => {
  const state = create(),
    plan = state.events.find((item) => item.id === "plan")!;
  plan.attendeeIds.push("maya");
  plan.waitlistIds.push("jordan");
  const cancelled = run(state, {
    type: "event.cancel",
    eventId: "plan",
    expectedSequence: 0,
    reason: "Venue no longer available.",
  });
  const item = cancelled.events.find((value) => value.id === "plan")!;
  assert.equal(item.status, "cancelled");
  assert.equal(item.sequence, 1);
  assert.deepEqual(item.attendeeIds, ["me", "maya"]);
  const again = run(cancelled, {
    type: "event.cancel",
    eventId: "plan",
    expectedSequence: 0,
    reason: "A retry",
  });
  assert.deepEqual(again.events, cancelled.events);
  assert.deepEqual(again.notifications, cancelled.notifications);
  assert.throws(
    () =>
      run(cancelled, {
        type: "event.edit",
        eventId: "plan",
        expectedSequence: 1,
        event: { title: "Reopen" },
      }),
    /Cancelled/,
  );
  const withdrawn = run(cancelled, {
    type: "event.rsvp",
    eventId: "plan",
  }).events.find((value) => value.id === "plan")!;
  assert.deepEqual(withdrawn.attendeeIds, ["maya"]);
  assert.deepEqual(withdrawn.waitlistIds, ["jordan"]);
  assert.equal(withdrawn.sequence, 1);
  cancelled.currentUserId = "nia";
  assert.throws(
    () => run(cancelled, { type: "event.rsvp", eventId: "plan" }),
    /cancelled/,
  );
});
test("full waitlists never block existing members from leaving", () => {
  const state = create(),
    plan = state.events.find((item) => item.id === "plan")!;
  plan.capacity = 1000;
  plan.attendeeIds = [
    "me",
    ...Array.from({ length: 999 }, (_, i) => `attendee-${i}`),
  ];
  plan.waitlistIds = Array.from({ length: 500 }, (_, i) => `waiting-${i}`);
  const left = run(state, { type: "event.rsvp", eventId: "plan" }).events.find(
    (item) => item.id === "plan",
  )!;
  assert.equal(left.attendeeIds.length, 1000);
  assert.equal(left.waitlistIds.length, 499);
  assert.ok(left.attendeeIds.includes("waiting-0"));
  assert.ok(
    run(state, { type: "event.rsvp", eventId: "plan" }).notifications.some(
      (notice) =>
        notice.userId === "waiting-0" &&
        notice.title === "You’re off the waitlist",
    ),
  );
  state.currentUserId = "waiting-3";
  assert.equal(
    run(state, { type: "event.rsvp", eventId: "plan" }).events.find(
      (item) => item.id === "plan",
    )!.waitlistIds.length,
    499,
  );
});
test("calendar updates retain stable identity and communicate cancellation safely", () => {
  const original = create().events.find((item) => item.id === "plan")!;
  const modified = {
    ...original,
    status: "cancelled" as const,
    sequence: 2,
    updatedAt: "2026-10-27T12:00:00Z",
    cancellationReason: "Venue closed\r\nPlease check the app.",
  };
  const first = eventICS(original),
    second = eventICS(modified);
  assert.equal(first.match(/^UID:.*$/m)?.[0], second.match(/^UID:.*$/m)?.[0]);
  assert.match(second, /SEQUENCE:2\r\nSTATUS:CANCELLED/);
  assert.match(second, /LAST-MODIFIED:20261027T120000Z/);
  assert.ok(second.includes("Venue closed\\nPlease check the app."));
  const injected = eventICS({ ...original, id: "plan\r\nATTENDEE:someone" });
  assert.equal(
    injected.split("\r\n").filter((line) => line.startsWith("ATTENDEE:"))
      .length,
    0,
  );
  assert.ok(
    !second.includes("METHOD:CANCEL"),
    "a downloaded event is not an iTIP delivery",
  );
});
