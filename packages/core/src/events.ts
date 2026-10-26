import type {
  Command,
  CommandContext,
  EventDetails,
  LoopEvent,
  LoopState,
} from "./types";
import { previewEventDraft } from "./eventForm";
type EventCommand = Extract<
  Command,
  { type: "event.create" | "event.edit" | "event.cancel" | "event.rsvp" }
>;
const editable = [
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
] as const;
const active = (event: LoopEvent, now: string) =>
  event.status !== "cancelled" && Date.parse(event.endAt) > Date.parse(now);
const version = (event: LoopEvent, expected: number) => {
  if (
    !Number.isSafeInteger(expected) ||
    expected < 0 ||
    expected !== (event.sequence ?? 0)
  )
    throw new Error("This event changed. Refresh its details before saving.");
};
function participants(event: LoopEvent) {
  if (
    event.attendeeIds.length > 1000 ||
    event.waitlistIds.length > 500 ||
    new Set([...event.attendeeIds, ...event.waitlistIds]).size !==
      event.attendeeIds.length + event.waitlistIds.length
  )
    throw new Error("This event participant list needs review.");
}
function details(
  input: EventDetails,
  state: LoopState,
  now: string,
  original?: LoopEvent,
): EventDetails {
  for (const key of ["startAt", "endAt"] as const)
    if (
      typeof input[key] !== "string" ||
      !/(Z|[+-]\d{2}:\d{2})$/i.test(input[key])
    )
      throw new Error("Event times need an explicit Z or UTC offset.");
  if (typeof input.capacity !== "number" || !Number.isInteger(input.capacity))
    throw new Error("Capacity must be a whole number.");
  const result = previewEventDraft(input, {
    conferences: state.conferences,
    existingEvents: state.events.filter((event) => event.id !== original?.id),
    ...(original ? {} : { now }),
  });
  if (!result.event)
    throw new Error(result.errors.join(" ") || "Please check event details.");
  if (Date.parse(result.event.endAt) <= Date.parse(now))
    throw new Error("This event has finished.");
  return result.event;
}
function notify(
  state: LoopState,
  event: LoopEvent,
  context: CommandContext,
  promoted: string[],
) {
  for (const uid of new Set([...event.attendeeIds, ...event.waitlistIds])) {
    if (
      uid === state.currentUserId ||
      state.preferences.blockedIds.includes(uid)
    )
      continue;
    state.notifications.push({
      id: `event-${event.id}-${event.sequence ?? 0}-${uid}`,
      userId: uid,
      title:
        event.status === "cancelled"
          ? "A plan was cancelled"
          : promoted.includes(uid)
            ? "You’re off the waitlist"
            : "An event plan changed",
      body:
        event.status === "cancelled"
          ? `${event.title}${event.cancellationReason ? `: ${event.cancellationReason}` : " was cancelled."}`
          : `Check the latest details for ${event.title}.`,
      kind: "event",
      targetId: event.id,
      createdAt: context.now,
      read: false,
    });
  }
}
/** Fictional local behavior mirrors trusted lifecycle rules; live authority stays on the server. */
export function applyEventCommand(
  state: LoopState,
  command: EventCommand,
  context: CommandContext,
): void {
  if (command.type === "event.create") {
    const value = details(command.event, state, context.now);
    state.events.push({
      ...value,
      id: context.id,
      hostId: state.currentUserId,
      attendeeIds: [state.currentUserId],
      waitlistIds: [],
      status: "scheduled",
      sequence: 0,
      updatedAt: context.now,
    });
    return;
  }
  const event = state.events.find((item) => item.id === command.eventId);
  if (!event) throw new Error("Event not found.");
  participants(event);
  const uid = state.currentUserId;
  if (command.type === "event.rsvp") {
    const going = event.attendeeIds.includes(uid),
      waiting = event.waitlistIds.includes(uid);
    if (going || waiting) {
      event.attendeeIds = event.attendeeIds.filter((id) => id !== uid);
      event.waitlistIds = event.waitlistIds.filter((id) => id !== uid);
      if (going && active(event, context.now) && event.waitlistIds.length)
        event.attendeeIds.push(event.waitlistIds.shift()!);
      return;
    }
    if (!active(event, context.now))
      throw new Error(
        event.status === "cancelled"
          ? "This event was cancelled."
          : "This event has finished.",
      );
    if (event.capacity > 0 && event.attendeeIds.length >= event.capacity) {
      if (event.waitlistIds.length >= 500)
        throw new Error("This event’s waitlist is full.");
      event.waitlistIds.push(uid);
    } else {
      if (event.attendeeIds.length >= 1000)
        throw new Error("This event has reached its RSVP limit.");
      event.attendeeIds.push(uid);
    }
    return;
  }
  if (event.hostId !== uid)
    throw new Error(
      "Only the event host can change this plan in the sample preview.",
    );
  if (command.type === "event.cancel" && event.status === "cancelled") return;
  version(event, command.expectedSequence);
  if (!active(event, context.now))
    throw new Error(
      event.status === "cancelled"
        ? "Cancelled events cannot be edited."
        : "This event has finished.",
    );
  if (command.type === "event.cancel") {
    const reason = (command.reason ?? "").trim();
    if (
      reason.length > 500 ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(reason)
    )
      throw new Error("Use up to 500 characters for the cancellation reason.");
    Object.assign(event, {
      status: "cancelled",
      sequence: (event.sequence ?? 0) + 1,
      updatedAt: context.now,
      cancelledAt: context.now,
      cancelledBy: uid,
      cancellationReason: reason,
    });
    notify(state, event, context, []);
    return;
  }
  if (
    !command.event ||
    typeof command.event !== "object" ||
    Array.isArray(command.event) ||
    !Object.keys(command.event).length ||
    Object.keys(command.event).some(
      (key) => !(editable as readonly string[]).includes(key),
    )
  )
    throw new Error("Only event details and capacity can be edited.");
  const value = details(
    { ...event, ...command.event },
    state,
    context.now,
    event,
  );
  const changed = editable.filter(
    (key) => JSON.stringify(value[key]) !== JSON.stringify(event[key]),
  );
  if (!changed.length) return;
  if (value.capacity && value.capacity < event.attendeeIds.length)
    throw new Error(
      "Capacity cannot be lower than the members already attending.",
    );
  Object.assign(event, value);
  if (!value.url) delete event.url;
  const promoted: string[] = [];
  if (changed.includes("capacity"))
    while (
      event.waitlistIds.length &&
      event.attendeeIds.length < (event.capacity || 1000)
    ) {
      const id = event.waitlistIds.shift()!;
      event.attendeeIds.push(id);
      promoted.push(id);
    }
  event.sequence = (event.sequence ?? 0) + 1;
  event.updatedAt = context.now;
  event.status = "scheduled";
  notify(state, event, context, promoted);
}
