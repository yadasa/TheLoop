import { canMessage, Doc } from "./policy";
import type { TransactionStore } from "./service";

/** Recipient-authored outbound history consents to replies; unanswered inbound does not. */
export async function canSendDirectMessage(
  store: TransactionStore,
  senderId: string,
  recipientId: string,
  sender: Doc,
  recipient: Doc,
  connection?: Doc,
): Promise<boolean> {
  if (
    senderId === recipientId ||
    sender.disabled ||
    sender.deletionPending ||
    recipient.disabled ||
    recipient.deletionPending ||
    sender.preferences?.blockedIds?.includes(recipientId) ||
    recipient.preferences?.blockedIds?.includes(senderId)
  )
    return false;
  if (canMessage(senderId, recipientId, sender, recipient, connection))
    return true;
  const previous = await store.find(
    "directMessages",
    "fromId",
    recipientId,
    1,
    { field: "toId", value: senderId },
  );
  return previous.some(
    (message) => message.fromId === recipientId && message.toId === senderId,
  );
}
