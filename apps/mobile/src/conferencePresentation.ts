import type { Conference, LoopState } from "@theloop/core";

// Conference dates are calendar days, not UTC instants to shift into the device zone.
export function calendarDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date
    : null;
}

export function conferenceDateRange(conference: Conference): string {
  const start = calendarDay(conference.startDate);
  const end = calendarDay(conference.endDate);
  if (!start || !end || end < start) return "Dates to be announced";
  const format = (date: Date) =>
    date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  return start.getTime() === end.getTime()
    ? format(start)
    : `${format(start)} – ${format(end)}`;
}

export function conferenceTiming(
  conference: Conference,
  now = new Date(),
): string {
  const start = calendarDay(conference.startDate);
  const end = calendarDay(conference.endDate);
  if (!start || !end || end < start) return "CONFERENCE";
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const days = Math.round((start.getTime() - today) / 86_400_000);
  if (today > end.getTime()) return "PAST CONFERENCE";
  if (days <= 0) return "HAPPENING NOW";
  if (days === 1) return "STARTS TOMORROW";
  return days <= 30 ? `IN ${days} DAYS` : "COMING UP";
}

export function conferenceChannels(state: LoopState, conferenceId: string) {
  if (!state.currentUserId) return [];
  return state.channels.filter(
    (channel) =>
      channel.conferenceId === conferenceId &&
      (channel.visibility === "public" ||
        channel.memberIds?.includes(state.currentUserId)),
  );
}

export function featuredConference(
  state: LoopState,
  now = new Date(),
): Conference | undefined {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return state.conferences
    .filter((conference) => {
      const start = calendarDay(conference.startDate),
        end = calendarDay(conference.endDate);
      return (
        start &&
        end &&
        end >= start &&
        end.getTime() >= today &&
        state.preferences.subscriptions[conference.id] !== "hidden" &&
        conferenceChannels(state, conference.id).length > 0
      );
    })
    .sort((a, b) => {
      const active = (conference: Conference) =>
        calendarDay(conference.startDate)!.getTime() <= today ? 1 : 0;
      const followed = (conference: Conference) =>
        state.preferences.subscriptions[conference.id] === "following" ? 1 : 0;
      return (
        active(b) - active(a) ||
        followed(b) - followed(a) ||
        a.startDate.localeCompare(b.startDate) ||
        a.id.localeCompare(b.id)
      );
    })[0];
}
