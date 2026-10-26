import type { LoopState, LoopEvent, Profile, Subscription } from "./types";
export const subscriptionFor = (
  s: LoopState,
  id: string,
  parentId?: string,
): Subscription =>
  s.preferences.subscriptions[id] ??
  (parentId ? s.preferences.subscriptions[parentId] : undefined) ??
  "muted";
export const visibleChannels = (s: LoopState) =>
  s.channels.filter(
    (c) =>
      subscriptionFor(s, c.id, c.conferenceId) !== "hidden" &&
      (!s.preferences.hideUnsubscribed ||
        subscriptionFor(s, c.id, c.conferenceId) === "following") &&
      (c.visibility === "public" || c.memberIds?.includes(s.currentUserId)),
  );
export const channelUnread = (s: LoopState, id: string) => {
  const inherited = subscriptionFor(
    s,
    id,
    s.channels.find((c) => c.id === id)?.conferenceId,
  );
  return inherited === "hidden"
    ? 0
    : s.messages.filter(
        (m) =>
          m.channelId === id &&
          m.authorId !== s.currentUserId &&
          m.createdAt > (s.preferences.readChannels[id] ?? "") &&
          !s.preferences.blockedIds.includes(m.authorId) &&
          (s.preferences.subscriptions[`${id}:${m.topic}`] ?? inherited) ===
            "following",
      ).length;
};
export const connected = (s: LoopState, id: string) =>
  s.connections.some(
    (c) =>
      c.status === "accepted" &&
      ((c.fromId === s.currentUserId && c.toId === id) ||
        (c.toId === s.currentUserId && c.fromId === id)),
  );
export const suggestedConnections = (s: LoopState): Profile[] =>
  s.profiles
    .filter(
      (p) =>
        p.id !== s.currentUserId &&
        !s.preferences.blockedIds.includes(p.id) &&
        !s.connections.some(
          (c) =>
            [c.fromId, c.toId].includes(s.currentUserId) &&
            [c.fromId, c.toId].includes(p.id),
        ),
    )
    .sort(
      (a, b) =>
        b.interests.filter((x) => s.preferences.interests.includes(x)).length -
        a.interests.filter((x) => s.preferences.interests.includes(x)).length,
    );
export const trustLabel = (score: number) =>
  score >= 85
    ? "Community pillar"
    : score >= 65
      ? "Trusted contributor"
      : score >= 35
        ? "Growing connection"
        : "New to the circle";
export const displayDate = (
  date: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) => new Intl.DateTimeFormat("en-US", options).format(new Date(date));
const esc = (v: string) =>
  v
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
const stamp = (v: string) =>
  new Date(v)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
export function eventICS(
  e: Pick<
    LoopEvent,
    "id" | "title" | "description" | "startAt" | "endAt" | "location"
  > &
    Partial<
      Pick<
        LoopEvent,
        "status" | "sequence" | "updatedAt" | "cancellationReason"
      >
    >,
): string {
  const modified =
    e.updatedAt && Number.isFinite(Date.parse(e.updatedAt))
      ? e.updatedAt
      : e.startAt;
  const sequence =
    Number.isSafeInteger(e.sequence) && Number(e.sequence) >= 0
      ? Number(e.sequence)
      : 0;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TheLoop//Community Calendar//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${esc(e.id)}@theloop.community`,
    `DTSTAMP:${stamp(modified)}`,
    `LAST-MODIFIED:${stamp(modified)}`,
    `SEQUENCE:${sequence}`,
    `STATUS:${e.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    `DTSTART:${stamp(e.startAt)}`,
    `DTEND:${stamp(e.endAt)}`,
    `SUMMARY:${esc(e.title)}`,
    `DESCRIPTION:${esc(`${e.status === "cancelled" && e.cancellationReason ? `Cancelled: ${e.cancellationReason}\n\n` : ""}${e.description}`)}`,
    `LOCATION:${esc(e.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return (
    lines
      .map((line) => {
        let out = "";
        let width = 0;
        for (const ch of line) {
          const point = ch.codePointAt(0)!;
          const bytes =
            point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
          if (width + bytes > 73) {
            out += "\r\n ";
            width = 1;
          }
          out += ch;
          width += bytes;
        }
        return out;
      })
      .join("\r\n") + "\r\n"
  );
}
export function safeURL(value: string): boolean {
  try {
    const u = new URL(value);
    return (
      ["https:", "http:"].includes(u.protocol) && !u.username && !u.password
    );
  } catch {
    return false;
  }
}
export const postScore = (votes: Record<string, number>) =>
  Object.values(votes).reduce((n, v) => n + v, 0);
