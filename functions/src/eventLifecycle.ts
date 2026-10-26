import { assert, Doc, httpsUrl, list, rsvp, text } from "./policy";
import { absoluteEventInstant } from "./eventDates";

export const EVENT_ATTENDEE_LIMIT = 1000;
export const EVENT_WAITLIST_LIMIT = 500;
const editableFields = [
  "title",
  "description",
  "startAt",
  "endAt",
  "timezone",
  "location",
  "kind",
  "capacity",
  "tags",
  "url",
];
export type EventMutation = {
  event: Doc;
  changed: boolean;
  changedFields: string[];
  promotedIds: string[];
};

function authorize(event: Doc, actorId: string, user: Doc): void {
  assert(
    user && !user.disabled && !user.deletionPending,
    "failed-precondition",
    "This account is unavailable.",
  );
  assert(
    event.hostId === actorId || user.role === "admin",
    "permission-denied",
    "Only the event host or an administrator can change this event.",
  );
}

function sequenceOf(event: Doc): number {
  const value = event.sequence ?? 0;
  assert(
    Number.isInteger(value) && value >= 0 && value < 2147483647,
    "failed-precondition",
    "This event needs an administrator review.",
  );
  return value;
}

function expectSequence(event: Doc, expected: unknown): number {
  assert(
    Number.isInteger(expected) && Number(expected) >= 0,
    "invalid-argument",
    "Provide the event version you reviewed.",
  );
  const sequence = sequenceOf(event);
  assert(
    sequence === expected,
    "aborted",
    "This event changed. Refresh its details before saving.",
  );
  return sequence;
}

function participantLists(event: Doc): {
  attendeeIds: string[];
  waitlistIds: string[];
} {
  const attendeeIds: string[] = [...(event.attendeeIds || [])],
    waitlistIds: string[] = [...(event.waitlistIds || [])];
  assert(
    attendeeIds.length <= EVENT_ATTENDEE_LIMIT &&
      waitlistIds.length <= EVENT_WAITLIST_LIMIT &&
      new Set([...attendeeIds, ...waitlistIds]).size ===
        attendeeIds.length + waitlistIds.length,
    "failed-precondition",
    "This event participant list needs an administrator review.",
  );
  return { attendeeIds, waitlistIds };
}

/** Content edits never accept ownership, RSVP lists, status, revision or attendance signals. */
export function editEvent(
  event: Doc,
  actorId: string,
  user: Doc,
  input: unknown,
  expected: unknown,
  now: string,
): EventMutation {
  authorize(event, actorId, user);
  const sequence = expectSequence(event, expected);
  assert(
    event.status !== "cancelled",
    "failed-precondition",
    "Cancelled events cannot be edited.",
  );
  assert(
    Date.parse(event.endAt) > Date.parse(now),
    "failed-precondition",
    "This event has finished.",
  );
  assert(
    input && typeof input === "object" && !Array.isArray(input),
    "invalid-argument",
    "Provide the event fields to edit.",
  );
  const entries = Object.entries(input);
  assert(
    entries.length > 0 &&
      entries.every(([key]) => editableFields.includes(key)),
    "invalid-argument",
    "Only event details and capacity can be edited.",
  );
  const updated: Doc = { ...event };
  for (const [key, value] of entries) {
    if (key === "title") updated.title = text(value, "Title", 160);
    if (key === "description")
      updated.description = text(value, "Description", 5000, 0);
    if (key === "location") updated.location = text(value, "Location", 240);
    if (key === "tags") updated.tags = list(value, "Tags", 6, 30);
    if (key === "url") {
      const url = text(value, "URL", 2048, 0);
      if (url) updated.url = httpsUrl(url);
      else delete updated.url;
    }
    if (key === "kind") {
      assert(
        ["conference", "meetup", "workshop", "social"].includes(String(value)),
        "invalid-argument",
        "Invalid event type.",
      );
      updated.kind = value;
    }
    if (key === "capacity") {
      assert(
        Number.isInteger(value) &&
          Number(value) >= 0 &&
          Number(value) <= EVENT_ATTENDEE_LIMIT,
        "invalid-argument",
        "Capacity must be 0 (open) through 1,000.",
      );
      updated.capacity = value;
    }
    if (key === "timezone") {
      const timezone = text(value, "Timezone", 80);
      let valid = true;
      try {
        new Intl.DateTimeFormat("en", { timeZone: timezone });
      } catch {
        valid = false;
      }
      assert(valid, "invalid-argument", "Use a valid timezone.");
      updated.timezone = timezone;
    }
    if (key === "startAt" || key === "endAt") {
      updated[key] = absoluteEventInstant(
        value,
        key === "startAt" ? "Start time" : "End time",
      );
    }
  }
  assert(
    Date.parse(updated.endAt) > Date.parse(updated.startAt) &&
      Date.parse(updated.endAt) > Date.parse(now),
    "invalid-argument",
    "Choose an event end after its start and in the future.",
  );
  const { attendeeIds, waitlistIds } = participantLists(event);
  assert(
    !updated.capacity || updated.capacity >= attendeeIds.length,
    "failed-precondition",
    "Capacity cannot be lower than the members already attending.",
  );
  const changedFields = editableFields.filter(
    (key) => JSON.stringify(updated[key]) !== JSON.stringify(event[key]),
  );
  if (!changedFields.length)
    return { event, changed: false, changedFields: [], promotedIds: [] };
  const promotedIds: string[] = [];
  if (changedFields.includes("capacity")) {
    const ceiling = updated.capacity || EVENT_ATTENDEE_LIMIT;
    while (waitlistIds.length && attendeeIds.length < ceiling) {
      const uid = waitlistIds.shift()!;
      attendeeIds.push(uid);
      promotedIds.push(uid);
    }
  }
  return {
    event: {
      ...updated,
      status: "scheduled",
      sequence: sequence + 1,
      updatedAt: now,
      attendeeIds,
      waitlistIds,
    },
    changed: true,
    changedFields,
    promotedIds,
  };
}

export function cancelEvent(
  event: Doc,
  actorId: string,
  user: Doc,
  expected: unknown,
  reason: unknown,
  now: string,
): EventMutation {
  authorize(event, actorId, user);
  // A fresh request retry after cancellation is also idempotent, without a second fanout.
  if (event.status === "cancelled")
    return { event, changed: false, changedFields: [], promotedIds: [] };
  const sequence = expectSequence(event, expected);
  assert(
    Date.parse(event.endAt) > Date.parse(now),
    "failed-precondition",
    "This event has finished.",
  );
  const cancellationReason = text(reason ?? "", "Cancellation reason", 500, 0);
  return {
    event: {
      ...event,
      status: "cancelled",
      sequence: sequence + 1,
      updatedAt: now,
      cancelledAt: now,
      cancelledBy: actorId,
      cancellationReason,
    },
    changed: true,
    changedFields: ["status"],
    promotedIds: [],
  };
}

/** Existing participants can always withdraw; only new joins need capacity and lifecycle gates. */
export function eventRsvpTransition(
  event: Doc,
  uid: string,
  now: string,
): { attendeeIds: string[]; waitlistIds: string[]; promotedId?: string } {
  const { attendeeIds, waitlistIds } = participantLists(event);
  const participating = attendeeIds.includes(uid) || waitlistIds.includes(uid);
  const active =
    event.status !== "cancelled" && Date.parse(event.endAt) > Date.parse(now);
  if (participating && !active)
    return {
      attendeeIds: attendeeIds.filter((id) => id !== uid),
      waitlistIds: waitlistIds.filter((id) => id !== uid),
    };
  assert(
    active,
    "failed-precondition",
    event.status === "cancelled"
      ? "This event was cancelled."
      : "This event has finished.",
  );
  if (!participating) {
    const full =
      Number(event.capacity) > 0 &&
      attendeeIds.length >= Number(event.capacity);
    assert(
      full
        ? waitlistIds.length < EVENT_WAITLIST_LIMIT
        : attendeeIds.length < EVENT_ATTENDEE_LIMIT,
      "resource-exhausted",
      full
        ? "This event’s waitlist is full."
        : "This event has reached its RSVP limit.",
    );
  }
  return rsvp(event, uid);
}

export function assertEventCheckinWindow(
  event: Doc,
  targetUser: Doc | undefined,
  now: string,
): void {
  assert(
    event.status !== "cancelled",
    "failed-precondition",
    "Cancelled events cannot confirm attendance.",
  );
  assert(
    targetUser && !targetUser.disabled && !targetUser.deletionPending,
    "failed-precondition",
    "This member is unavailable.",
  );
  const instant = Date.parse(now),
    start = Date.parse(event.startAt),
    end = Date.parse(event.endAt);
  assert(
    Number.isFinite(start) &&
      Number.isFinite(end) &&
      instant >= start - 6 * 3600000 &&
      instant <= end + 24 * 3600000,
    "failed-precondition",
    "Attendance confirmation is available from six hours before the event until 24 hours after it ends.",
  );
}
