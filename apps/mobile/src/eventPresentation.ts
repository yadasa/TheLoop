import type { LoopEvent } from "@theloop/core";

export type EventPeriod = "upcoming" | "past" | "cancelled";
export function localDayKey(value: string | Date): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function inEventScope(
  event: LoopEvent,
  scope: string,
  uid: string,
): boolean {
  return (
    scope === "all" ||
    (scope === "mine"
      ? event.attendeeIds.includes(uid) ||
        event.waitlistIds.includes(uid) ||
        event.hostId === uid
      : event.conferenceId === scope)
  );
}
export function inEventPeriod(
  event: LoopEvent,
  period: EventPeriod,
  now: Date,
): boolean {
  if (period === "cancelled") return event.status === "cancelled";
  if (event.status === "cancelled") return false;
  const end = Date.parse(event.endAt);
  return (
    Number.isFinite(end) &&
    (period === "upcoming" ? end > now.getTime() : end <= now.getTime())
  );
}
export function overlapsWindow(
  event: LoopEvent,
  start: Date,
  end: Date,
): boolean {
  return (
    Date.parse(event.startAt) < end.getTime() &&
    Date.parse(event.endAt) > start.getTime()
  );
}
export function onCalendarDay(event: LoopEvent, date: Date): boolean {
  return overlapsWindow(
    event,
    new Date(date.getFullYear(), date.getMonth(), date.getDate()),
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
  );
}
export function inCalendarMonth(event: LoopEvent, month: Date): boolean {
  return overlapsWindow(
    event,
    new Date(month.getFullYear(), month.getMonth(), 1),
    new Date(month.getFullYear(), month.getMonth() + 1, 1),
  );
}
export function firstEventMonth(
  events: LoopEvent[],
  scope: string,
  uid: string,
  now: Date,
): Date {
  const next = events
    .filter(
      (event) =>
        inEventScope(event, scope, uid) &&
        inEventPeriod(event, "upcoming", now),
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  const date = next
    ? new Date(Math.max(Date.parse(next.startAt), now.getTime()))
    : now;
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
export function scheduleConflicts(
  event: LoopEvent,
  events: LoopEvent[],
  uid: string,
  now: Date,
): LoopEvent[] {
  if (!uid || !inEventPeriod(event, "upcoming", now)) return [];
  return events
    .filter(
      (other) =>
        other.id !== event.id &&
        other.attendeeIds.includes(uid) &&
        inEventPeriod(other, "upcoming", now) &&
        overlapsWindow(other, new Date(event.startAt), new Date(event.endAt)),
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}
export function agendaDay(event: LoopEvent, now: Date): string {
  const start = Date.parse(event.startAt);
  return localDayKey(
    start < now.getTime() && Date.parse(event.endAt) > now.getTime()
      ? now
      : event.startAt,
  );
}
export function eventTimeRange(event: LoopEvent): string {
  const start = new Date(event.startAt),
    end = new Date(event.endAt);
  const time: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };
  return `${start.toLocaleTimeString(undefined, time)} – ${localDayKey(start) === localDayKey(end) ? "" : end.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", "}${end.toLocaleTimeString(undefined, time)}`;
}
