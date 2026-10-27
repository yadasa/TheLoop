import type { Channel, LoopState, Message } from "./types";

export function pinnedIds(channel: Channel): string[] {
  return [
    ...new Set(
      (Array.isArray(channel.pinnedMessageIds)
        ? channel.pinnedMessageIds
        : []
      ).filter((value) => typeof value === "string" && value.length > 0),
    ),
  ].slice(0, 20);
}
export function canManagePins(
  state: LoopState,
  channel: Channel,
  role: "member" | "moderator" | "admin" = "member",
): boolean {
  const uid = state.currentUserId;
  if (
    !uid ||
    (channel.visibility !== "public" && !channel.memberIds?.includes(uid))
  )
    return false;
  return (
    role === "admin" ||
    role === "moderator" ||
    !!channel.moderatorIds?.includes(uid) ||
    !!state.communities
      .find((community) => community.id === channel.communityId)
      ?.moderatorIds.includes(uid)
  );
}
export function visiblePinnedMessages(
  state: LoopState,
  channel: Channel,
  rows: Message[],
): Message[] {
  if (
    !state.currentUserId ||
    (channel.visibility !== "public" &&
      !channel.memberIds?.includes(state.currentUserId))
  )
    return [];
  const ids = pinnedIds(channel);
  const byId = new Map(
    rows
      .filter(
        (message) =>
          message.channelId === channel.id &&
          !state.preferences.blockedIds.includes(message.authorId) &&
          state.preferences.subscriptions[`${channel.id}:${message.topic}`] !==
            "hidden",
      )
      .map((message) => [message.id, message]),
  );
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}
