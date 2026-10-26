import { assert, Doc, pairId } from "./policy";
import type { TransactionStore } from "./service";
import { participationIdentity } from "./identity";

export function directMessageRead(message: Doc, conversation?: Doc): boolean {
  if (message.read) return true;
  if (!conversation) return false;
  if (Number.isSafeInteger(message.sequence) && message.sequence > 0)
    return (
      message.sequence <= Number(conversation.readThrough?.[message.toId] || 0)
    );
  const cutoff = Date.parse(conversation.readAt?.[message.toId] || "");
  const created = Date.parse(message.createdAt);
  return (
    Number.isFinite(cutoff) && Number.isFinite(created) && created <= cutoff
  );
}

function initialConversation(message: Doc): Doc {
  const participantIds = [message.fromId, message.toId].sort();
  return {
    id: pairId(message.fromId, message.toId),
    participantIds,
    memberNames: {},
    memberInitials: {},
    createdAt: message.createdAt,
    lastAt: message.createdAt,
    sequence: 0,
    readThrough: {},
    readAt: {},
    unreadCounts: {},
  };
}

/** The caller must reread the source and active participant records in this transaction. */
export async function catalogDirectMessage(
  store: TransactionStore,
  message: Doc,
  legacy = false,
): Promise<Doc> {
  assert(
    message.fromId !== message.toId && typeof message.createdAt === "string",
    "invalid-argument",
    "Invalid private message.",
  );
  const conversationId = pairId(message.fromId, message.toId);
  const path = `directConversations/${conversationId}`;
  const conversation = (await store.get(path)) || initialConversation(message);
  // A resumed migration never assigns a second sequence or increments unread twice.
  if (legacy && Number.isSafeInteger(message.sequence) && message.sequence > 0)
    return message;
  const sequence = Number(conversation.sequence || 0) + 1;
  assert(
    Number.isSafeInteger(sequence),
    "resource-exhausted",
    "Conversation history limit reached.",
  );
  const read =
    Boolean(message.read) ||
    (legacy && directMessageRead(message, conversation));
  const updated: Doc = {
    ...message,
    conversationId,
    participantIds: conversation.participantIds,
    sequence,
    read,
    unreadRecipientId: read ? "" : message.toId,
  };
  const from = participationIdentity({
    name: message.fromName || "Loop member",
  });
  const to = participationIdentity({ name: message.toName || "Loop member" });
  const memberNames = {
    ...conversation.memberNames,
    [message.fromId]: from.name,
    [message.toId]: to.name,
  };
  const memberInitials = {
    ...conversation.memberInitials,
    [message.fromId]: from.initials,
    [message.toId]: to.initials,
  };
  const unreadCounts = { ...conversation.unreadCounts };
  if (!read)
    unreadCounts[message.toId] = Number(unreadCounts[message.toId] || 0) + 1;
  const last = conversation.lastMessage;
  const newest =
    message.createdAt > conversation.lastAt ||
    (message.createdAt === conversation.lastAt &&
      (!last || message.id > last.id));
  store.set(path, {
    ...conversation,
    sequence,
    memberNames,
    memberInitials,
    unreadCounts,
    createdAt:
      message.createdAt < conversation.createdAt
        ? message.createdAt
        : conversation.createdAt,
    ...(newest
      ? { lastAt: message.createdAt, lastMessage: preview(updated) }
      : {}),
  });
  store.set(`directMessages/${message.id}`, updated);
  return updated;
}

function preview(message: Doc): Doc {
  return {
    id: message.id,
    fromId: message.fromId,
    body: String(message.body || "").slice(0, 180),
    createdAt: message.createdAt,
    hasImage: Boolean(message.image),
    ...(message.editedAt ? { editedAt: message.editedAt } : {}),
  };
}

export async function updateDirectPreview(
  store: TransactionStore,
  message: Doc,
  deleted = false,
): Promise<void> {
  const path = `directConversations/${pairId(message.fromId, message.toId)}`;
  const conversation = await store.get(path);
  if (!conversation) return;
  const updated: Doc = {
    ...conversation,
    unreadCounts: { ...conversation.unreadCounts },
  };
  if (
    deleted &&
    Number.isSafeInteger(message.sequence) &&
    !directMessageRead(message, conversation)
  )
    updated.unreadCounts[message.toId] = Math.max(
      0,
      Number(updated.unreadCounts[message.toId] || 0) - 1,
    );
  if (conversation.lastMessage?.id === message.id) {
    if (deleted) delete updated.lastMessage;
    else updated.lastMessage = preview(message);
  }
  store.set(path, updated);
}

export async function readDirectConversation(
  store: TransactionStore,
  actorId: string,
  peerId: string,
  now: string,
): Promise<Doc> {
  const path = `directConversations/${pairId(actorId, peerId)}`;
  let conversation = await store.get(path);
  if (!conversation) {
    const history = await store.find(
      "directMessages",
      "conversationId",
      pairId(actorId, peerId),
      1,
    );
    if (!history.length)
      return { marked: 0, hasMore: false, readAt: now, readThrough: 0 };
    await migrateDirectMessage(store, actorId, history[0].id);
    conversation = await store.get(path);
  }
  assert(
    conversation &&
      conversation.participantIds?.includes(actorId) &&
      conversation.participantIds.includes(peerId),
    "permission-denied",
    "This conversation is private.",
  );
  const marked = Number(conversation.unreadCounts?.[actorId] || 0);
  const readThrough = Number(conversation.sequence || 0);
  const readAt =
    conversation.readAt?.[actorId] > now ? conversation.readAt[actorId] : now;
  store.set(path, {
    ...conversation,
    readThrough: { ...conversation.readThrough, [actorId]: readThrough },
    readAt: { ...conversation.readAt, [actorId]: readAt },
    unreadCounts: { ...conversation.unreadCounts, [actorId]: 0 },
  });
  return { marked, hasMore: false, readThrough, readAt };
}

/** Idempotent migration: reread both identities and source after the paged discovery query. */
export async function migrateDirectMessage(
  store: TransactionStore,
  actorId: string,
  messageId: string,
): Promise<void> {
  const user = await store.get(`users/${actorId}`);
  assert(
    user && !user.disabled && !user.deletionPending,
    "failed-precondition",
    "This account is unavailable.",
  );
  const message = await store.get(`directMessages/${messageId}`);
  if (
    !message ||
    !message.participantIds?.includes(actorId) ||
    ![message.fromId, message.toId].includes(actorId)
  )
    return;
  if (Number.isSafeInteger(message.sequence) && message.sequence > 0) return;
  const peerId = message.fromId === actorId ? message.toId : message.fromId;
  const peer = await store.get(`users/${peerId}`);
  if (!peer || peer.disabled || peer.deletionPending) return;
  const from = message.fromName
    ? { name: message.fromName }
    : (await store.get(`profiles/${message.fromId}`)) || {};
  const to = message.toName
    ? { name: message.toName }
    : (await store.get(`profiles/${message.toId}`)) || {};
  const sender = participationIdentity(from),
    recipient = participationIdentity(to);
  await catalogDirectMessage(
    store,
    {
      ...message,
      fromName: sender.name,
      fromInitials: sender.initials,
      toName: recipient.name,
      toInitials: recipient.initials,
    },
    true,
  );
}
