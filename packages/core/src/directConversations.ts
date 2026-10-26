import type { DirectConversation, DirectMessage } from "./types";

/** Sequence orders live writes, while the timestamp cutoff covers unmigrated history. */
export function effectiveDirectRead(
  message: Pick<DirectMessage, "toId" | "createdAt" | "read" | "sequence">,
  conversation?: Pick<DirectConversation, "readThrough" | "readAt">,
): boolean {
  if (message.read) return true;
  if (!conversation) return false;
  if (Number.isSafeInteger(message.sequence) && Number(message.sequence) > 0)
    return (
      Number(message.sequence) <=
      Number(conversation.readThrough[message.toId] || 0)
    );
  const cutoff = Date.parse(conversation.readAt[message.toId] || "");
  const created = Date.parse(message.createdAt);
  return (
    Number.isFinite(cutoff) && Number.isFinite(created) && created <= cutoff
  );
}
