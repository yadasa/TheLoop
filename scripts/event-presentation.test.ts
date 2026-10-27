import test from "node:test";
import assert from "node:assert/strict";
import type { LoopEvent } from "@theloop/core";
import {
  agendaDay,
  firstEventMonth,
  inCalendarMonth,
  inEventPeriod,
  inEventScope,
  localDayKey,
  onCalendarDay,
  scheduleConflicts,
} from "../apps/mobile/src/eventPresentation";

const event = (id: string, start: Date, end: Date): LoopEvent => ({
  id,
  conferenceId: "afrotech",
  title: id,
  description: "",
  startAt: start.toISOString(),
  endAt: end.toISOString(),
  timezone: "America/Chicago",
  location: "Houston",
  kind: "meetup",
  hostId: "host",
  attendeeIds: [],
  waitlistIds: [],
  tags: [],
  capacity: 20,
});
const now = new Date(2026, 9, 27, 12);

test("upcoming, past and cancelled are distinct, including the exact ending instant", () => {
  const ended = event("ended", new Date(2026, 9, 27, 10), now);
  const ongoing = event(
    "ongoing",
    new Date(2026, 9, 26, 10),
    new Date(2026, 9, 28, 10),
  );
  assert.equal(inEventPeriod(ended, "past", now), true);
  assert.equal(inEventPeriod(ended, "upcoming", now), false);
  assert.equal(inEventPeriod(ongoing, "upcoming", now), true);
  assert.equal(agendaDay(ongoing, now), localDayKey(now));
  ongoing.status = "cancelled";
  assert.equal(inEventPeriod(ongoing, "upcoming", now), false);
  assert.equal(inEventPeriod(ongoing, "cancelled", now), true);
});

test("calendar includes every overlapping local day and excludes a midnight end", () => {
  const multi = event(
    "multi",
    new Date(2026, 9, 31, 22),
    new Date(2026, 10, 3, 0),
  );
  assert.equal(onCalendarDay(multi, new Date(2026, 10, 1)), true);
  assert.equal(onCalendarDay(multi, new Date(2026, 10, 2)), true);
  assert.equal(onCalendarDay(multi, new Date(2026, 10, 3)), false);
  assert.equal(inCalendarMonth(multi, new Date(2026, 9, 1)), true);
  assert.equal(inCalendarMonth(multi, new Date(2026, 10, 1)), true);
  assert.equal(inCalendarMonth(multi, new Date(2026, 11, 1)), false);
  assert.equal(localDayKey(new Date(2026, 0, 2, 23)), "2026-01-02");
  assert.equal(localDayKey("invalid"), "");
});

test("conference month selection ignores unrelated and cancelled events; My events includes hosts", () => {
  const other = event("other", new Date(2026, 9, 28), new Date(2026, 9, 29));
  other.conferenceId = "other";
  const target = event("target", new Date(2026, 10, 2), new Date(2026, 10, 3));
  const cancelled = {
    ...target,
    id: "cancelled",
    startAt: new Date(2026, 9, 28).toISOString(),
    status: "cancelled" as const,
  };
  assert.equal(
    firstEventMonth(
      [other, target, cancelled],
      "afrotech",
      "me",
      now,
    ).getMonth(),
    10,
  );
  assert.equal(inEventScope(target, "mine", "host"), true);
  assert.equal(inEventScope(target, "mine", "me"), false);
  target.waitlistIds.push("me");
  assert.equal(inEventScope(target, "mine", "me"), true);
});

test("conflicts require a confirmed RSVP and real overlap, not touching boundaries or a waitlist", () => {
  const target = event(
    "target",
    new Date(2026, 10, 2, 10),
    new Date(2026, 10, 2, 12),
  );
  const overlap = event(
    "overlap",
    new Date(2026, 10, 2, 11),
    new Date(2026, 10, 2, 13),
  );
  overlap.attendeeIds = ["me"];
  const adjacent = event(
    "adjacent",
    new Date(2026, 10, 2, 12),
    new Date(2026, 10, 2, 13),
  );
  adjacent.attendeeIds = ["me"];
  const wait = { ...overlap, id: "wait", attendeeIds: [], waitlistIds: ["me"] };
  const cancelled = {
    ...overlap,
    id: "cancelled",
    status: "cancelled" as const,
  };
  assert.deepEqual(
    scheduleConflicts(
      target,
      [target, overlap, adjacent, wait, cancelled],
      "me",
      now,
    ).map((value) => value.id),
    ["overlap"],
  );
  assert.deepEqual(
    scheduleConflicts({ ...target, status: "cancelled" }, [overlap], "me", now),
    [],
  );
});
