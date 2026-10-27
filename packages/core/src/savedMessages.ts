import type { Channel, LoopState, Message, SavedMessage } from "./types";
import { validLinkId } from "./links";

export function savedMessages(state: LoopState): SavedMessage[] {
  const seen = new Set<string>();
  return (state.preferences.savedMessages || [])
    .filter((entry) => {
      if (
        !validLinkId(entry.messageId) ||
        !validLinkId(entry.channelId) ||
        !Number.isFinite(Date.parse(entry.savedAt)) ||
        seen.has(entry.messageId)
      )
        return false;
      seen.add(entry.messageId);
      return true;
    })
    .slice(0, 100)
    .sort(
      (a, b) =>
        b.savedAt.localeCompare(a.savedAt) ||
        b.messageId.localeCompare(a.messageId),
    );
}

export function visibleSavedMessage(
  state: LoopState,
  channel: Channel,
  message: Message,
): boolean {
  const prefs = state.preferences;
  return (
    !!state.currentUserId &&
    message.channelId === channel.id &&
    (channel.visibility === "public" ||
      channel.memberIds?.includes(state.currentUserId) === true) &&
    !prefs.blockedIds.includes(message.authorId) &&
    prefs.subscriptions[channel.conferenceId] !== "hidden" &&
    prefs.subscriptions[channel.id] !== "hidden" &&
    prefs.subscriptions[`${channel.id}:${message.topic}`] !== "hidden"
  );
}
