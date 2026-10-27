import { Doc } from "./policy";

export function localClock(
  now: Date,
  timezone = "UTC",
): { date: string; time: string; weekday: string } {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  }
  const parts = Object.fromEntries(
    format.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday: parts.weekday,
  };
}
export function inQuietHours(preferences: Doc, now: Date): boolean {
  if (!preferences.quietHours) return false;
  const time = localClock(now, preferences.timezone || "UTC").time;
  const start = preferences.quietStart || "22:00";
  const end = preferences.quietEnd || "08:00";
  return (
    start === end ||
    (start < end ? time >= start && time < end : time >= start || time < end)
  );
}
export function digestSlot(preferences: Doc, now: Date): string | undefined {
  if (!["daily", "weekly"].includes(preferences.digest)) return;
  const clock = localClock(now, preferences.timezone || "UTC");
  if (!clock.time.startsWith("09:")) return;
  if (preferences.digest === "weekly" && clock.weekday !== "Mon") return;
  return `${preferences.digest}_${clock.date}`;
}
export function shouldDeliverPush(
  notification: Doc,
  preferences: Doc,
  now: Date,
): boolean {
  if (
    notification.actorId &&
    preferences.blockedIds?.includes(notification.actorId)
  )
    return false;
  if (
    notification.dmSenderId &&
    preferences.blockedIds?.includes(notification.dmSenderId)
  )
    return false;
  if (inQuietHours(preferences, now)) return false;
  if (
    notification.kind === "event" &&
    !["updated", "cancelled", "promoted"].includes(
      notification.eventNoticeType,
    ) &&
    preferences.eventReminders === false
  )
    return false;
  if (
    notification.kind === "squad" &&
    preferences.squadMutedIds?.includes(notification.targetId)
  )
    return false;
  const dmSenderId =
    notification.dmSenderId ||
    (notification.kind === "message" &&
    String(notification.id || "").endsWith("_dm")
      ? notification.targetId
      : undefined);
  return !dmSenderId || !preferences.dmMutedIds?.includes(dmSenderId);
}
export function subscription(
  preferences: Doc,
  channel: Doc,
  topic?: string,
): string {
  const choices = preferences.subscriptions || {};
  return (
    (topic ? choices[`${channel.id}:${topic}`] : undefined) ||
    choices[channel.id] ||
    choices[channel.conferenceId] ||
    "muted"
  );
}
export function digestContent(
  uid: string,
  preferences: Doc,
  channels: Doc[],
  messages: Doc[],
  posts: Doc[],
  now: Date,
): { messageCount: number; postCount: number } {
  const cutoff =
    now.getTime() - (preferences.digest === "weekly" ? 7 : 1) * 86_400_000;
  const blocked = preferences.blockedIds || [];
  const channelsById = new Map(
    channels.map((channel) => [channel.id, channel]),
  );
  const messageCount = messages.filter((message) => {
    const channel = channelsById.get(message.channelId);
    const channelRead = preferences.readChannels?.[message.channelId] || "";
    const topicRead =
      preferences.readChannels?.[`${message.channelId}:${message.topic}`] || "";
    const readThrough = channelRead > topicRead ? channelRead : topicRead;
    return (
      channel &&
      (channel.visibility === "public" || channel.memberIds?.includes(uid)) &&
      message.authorId !== uid &&
      !blocked.includes(message.authorId) &&
      Date.parse(message.createdAt) >= cutoff &&
      message.createdAt > readThrough &&
      subscription(preferences, channel, message.topic) === "following"
    );
  }).length;
  const postCount = posts.filter(
    (post) =>
      post.authorId !== uid &&
      !blocked.includes(post.authorId) &&
      (preferences.joinedCommunityIds || []).includes(post.communityId) &&
      Date.parse(post.createdAt) >= cutoff,
  ).length;
  return { messageCount, postCount };
}
