import type { LoopState, Notification } from "./types";
/** Notification previews require current conversation access, just like message screens. */
export function notificationAccessible(
  state: LoopState,
  notification: Notification,
): boolean {
  if (!state.currentUserId || notification.userId !== state.currentUserId)
    return false;
  const blocked = state.preferences.blockedIds;
  if (blocked.includes(notification.actorId || notification.dmSenderId || ""))
    return false;
  if (notification.kind !== "message") return true;
  const peer =
    notification.dmSenderId ||
    (notification.id.endsWith("_dm") ? notification.targetId : undefined);
  if (peer) return !blocked.includes(peer);
  const channel = state.channels.find(
    (item) => item.id === notification.targetId,
  );
  if (
    !channel ||
    (channel.visibility !== "public" &&
      !channel.memberIds?.includes(state.currentUserId))
  )
    return false;
  const choices = state.preferences.subscriptions;
  return (
    choices[channel.id] !== "hidden" &&
    choices[channel.conferenceId] !== "hidden" &&
    (!notification.topic ||
      choices[`${channel.id}:${notification.topic}`] !== "hidden")
  );
}
