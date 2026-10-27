import type { DirectConversation, LoopState } from "@theloop/core";
import { searchText } from "./searchDestinations";
export type InboxFilter = "all" | "unread" | "muted";
export function inboxRows(
  items: DirectConversation[],
  state: LoopState,
  filter: InboxFilter,
  query = "",
) {
  const q = searchText(query),
    uid = state.currentUserId;
  if (!uid) return [];
  return items
    .flatMap((conversation) => {
      if (
        conversation.participantIds.length !== 2 ||
        !conversation.participantIds.includes(uid)
      )
        return [];
      const peerId = conversation.participantIds.find((id) => id !== uid);
      if (!peerId || state.preferences.blockedIds.includes(peerId)) return [];
      const unread = Math.max(0, conversation.unreadCounts[uid] || 0);
      const muted = state.preferences.dmMutedIds?.includes(peerId) || false;
      if ((filter === "unread" && !unread) || (filter === "muted" && !muted))
        return [];
      const name =
        state.profiles.find((profile) => profile.id === peerId)?.name ||
        conversation.memberNames[peerId] ||
        "";
      if (
        q &&
        !searchText(`${name} ${conversation.lastMessage?.body || ""}`).includes(
          q,
        )
      )
        return [];
      return [{ conversation, peerId, unread, muted }];
    })
    .sort(
      (a, b) =>
        b.conversation.lastAt.localeCompare(a.conversation.lastAt) ||
        a.conversation.id.localeCompare(b.conversation.id),
    );
}
