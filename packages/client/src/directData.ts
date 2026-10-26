import type { DirectMessage } from "@theloop/core";

// Optional snapshots preserve compatibility with older demonstration/history records.
export type DirectSnapshot = DirectMessage & { conversationId?: string; participantIds?: string[]; fromName?: string; fromInitials?: string; toName?: string; toInitials?: string };
export function directConversationId(userId: string, peerId: string): string {
  if (!userId || !peerId || userId === peerId || [userId, peerId].some(id => id.length > 200 || /[\s/\\\u0000-\u001F\u007F]/.test(id))) throw new Error("Choose another member for this conversation.");
  return [userId, peerId].sort().join("~");
}
export function isDirectConversation(message: DirectMessage, userId: string, peerId: string): boolean {
  return (message.fromId === userId && message.toId === peerId) || (message.fromId === peerId && message.toId === userId);
}
export function mergeDirectMessages(buckets: Iterable<DirectSnapshot[]>, userId: string, blockedIds: ReadonlySet<string>): DirectSnapshot[] {
  const records = new Map<string, DirectSnapshot>();
  for (const bucket of buckets) for (const message of bucket) {
    const peerId = message.fromId === userId ? message.toId : message.toId === userId ? message.fromId : undefined;
    if (!peerId || peerId === userId || blockedIds.has(peerId) || (message.participantIds && !message.participantIds.includes(userId))) continue;
    records.set(message.id, message);
  }
  return [...records.values()].sort((a, b) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
/** Conversation identity comes from message snapshots, never private professional fields. */
export function directParticipantSnapshot(messages: DirectSnapshot[], userId: string, peerId: string): { id: string; name: string; initials: string } | undefined {
  const rows = messages.filter(message => isDirectConversation(message, userId, peerId) && (!message.participantIds || message.participantIds.includes(userId))).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  for (const row of rows) {
    const name = row.fromId === peerId ? row.fromName : row.toName;
    const initials = row.fromId === peerId ? row.fromInitials : row.toInitials;
    if (typeof name === "string" && name.trim()) return { id: peerId, name: name.trim().slice(0, 200), initials: typeof initials === "string" ? initials.trim().slice(0, 8) : "" };
  }
  return undefined;
}
