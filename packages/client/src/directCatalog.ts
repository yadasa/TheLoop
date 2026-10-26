import { effectiveDirectRead, type DirectCatalogProgress, type DirectConversation, type DirectMessage, type LoopState } from "@theloop/core";
import { directConversationId, mergeDirectMessages } from "./directData";

export type DirectCatalogState = { results: DirectConversation[]; loading: boolean; hasMore: boolean; progress: DirectCatalogProgress | null; syncing: boolean; error: string | null };
export type DirectWatermark = Pick<DirectConversation, "participantIds" | "readThrough" | "readAt">;
export const emptyDirectCatalog = (): DirectCatalogState => ({ results: [], loading: false, hasMore: false, progress: null, syncing: false, error: null });
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const instant = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function parseDirectCatalogProgress(value: unknown): DirectCatalogProgress | null {
  if (!object(value) || typeof value.complete !== "boolean" || !count(value.processed) || !instant(value.updatedAt) || (value.cursor !== null && (typeof value.cursor !== "string" || !value.cursor || value.cursor.length > 1500)) || (value.complete && value.cursor !== null)) return null;
  return { complete: value.complete, processed: value.processed, cursor: value.cursor as string | null, updatedAt: value.updatedAt };
}
export function newerDirectCatalogProgress(current: DirectCatalogProgress | null, incoming: DirectCatalogProgress | null): DirectCatalogProgress | null {
  if (!incoming) return current;
  if (!current) return incoming;
  if (incoming.processed < current.processed || Date.parse(incoming.updatedAt) < Date.parse(current.updatedAt) || (current.complete && !incoming.complete)) return current;
  return incoming;
}

export function parseDirectConversation(value: unknown, id: string, userId: string): DirectConversation | undefined {
  if (!object(value) || !Array.isArray(value.participantIds) || value.participantIds.length !== 2 || value.participantIds.some(participant => typeof participant !== "string") || !value.participantIds.includes(userId) || !count(value.sequence) || !instant(value.createdAt) || !instant(value.lastAt)) return undefined;
  const participants = value.participantIds as string[];
  try { if (directConversationId(participants[0], participants[1]) !== id) return undefined; } catch { return undefined; }
  const memberNames: Record<string, string> = {}, memberInitials: Record<string, string> = {}, readThrough: Record<string, number> = {}, readAt: Record<string, string> = {}, unreadCounts: Record<string, number> = {};
  for (const participant of participants) {
    const name = object(value.memberNames) ? value.memberNames[participant] : undefined, initials = object(value.memberInitials) ? value.memberInitials[participant] : undefined;
    memberNames[participant] = typeof name === "string" && name.trim() ? name.trim().slice(0, 200) : "Loop member";
    memberInitials[participant] = typeof initials === "string" ? initials.trim().slice(0, 8) : "";
    const watermark = object(value.readThrough) ? value.readThrough[participant] : undefined, unread = object(value.unreadCounts) ? value.unreadCounts[participant] : undefined;
    readThrough[participant] = count(watermark) ? Math.min(watermark, value.sequence) : 0;
    unreadCounts[participant] = count(unread) ? Math.min(unread, value.sequence) : 0;
    const timestamp = object(value.readAt) ? value.readAt[participant] : undefined;
    if (instant(timestamp)) readAt[participant] = timestamp;
  }
  const result: DirectConversation = { id, participantIds: [...participants], memberNames, memberInitials, createdAt: value.createdAt, lastAt: value.lastAt, sequence: value.sequence, readThrough, readAt, unreadCounts };
  const last = value.lastMessage;
  if (object(last) && typeof last.id === "string" && typeof last.fromId === "string" && participants.includes(last.fromId) && typeof last.body === "string" && instant(last.createdAt) && typeof last.hasImage === "boolean") result.lastMessage = { id: last.id, fromId: last.fromId, body: last.body.slice(0, 180), createdAt: last.createdAt, hasImage: last.hasImage, ...(instant(last.editedAt) ? { editedAt: last.editedAt } : {}) };
  return result;
}

export function normalizeDirectRead<T extends DirectMessage>(messages: T[], conversations: ReadonlyMap<string, DirectWatermark>): T[] {
  return messages.map(message => {
    let conversation: DirectWatermark | undefined;
    try { conversation = conversations.get(directConversationId(message.fromId, message.toId)); } catch { return message; }
    const read = effectiveDirectRead(message, conversation);
    return read === message.read ? message : { ...message, read };
  });
}

/** Page and point listeners may deliver the same summary at different moments. */
export function mergeDirectWatermark(incoming: DirectWatermark, previous?: DirectWatermark): DirectWatermark {
  const participantIds = [...incoming.participantIds], readThrough: Record<string, number> = {}, readAt: Record<string, string> = {};
  for (const participant of participantIds) {
    const prior = previous?.participantIds.includes(participant) ? previous : undefined;
    readThrough[participant] = Math.max(incoming.readThrough[participant] ?? 0, prior?.readThrough[participant] ?? 0);
    const currentAt = incoming.readAt[participant], previousAt = prior?.readAt[participant];
    const timestamp = previousAt && (!currentAt || Date.parse(previousAt) > Date.parse(currentAt)) ? previousAt : currentAt;
    if (timestamp) readAt[participant] = timestamp;
  }
  return { participantIds, readThrough, readAt };
}

export function normalizeDirectConversation(conversation: DirectConversation, previous?: DirectWatermark): DirectConversation {
  const watermark = mergeDirectWatermark(conversation, previous), unreadCounts = { ...conversation.unreadCounts };
  for (const participant of conversation.participantIds) unreadCounts[participant] = Math.min(unreadCounts[participant] ?? 0, Math.max(0, conversation.sequence - (watermark.readThrough[participant] ?? 0)));
  return { ...conversation, ...watermark, unreadCounts };
}

/** Fictional preview history is fully local; no remote identity or profile reads occur. */
export function deriveDirectCatalog(state: LoopState): DirectConversation[] {
  const uid = state.currentUserId, groups = new Map<string, DirectMessage[]>();
  for (const message of mergeDirectMessages([state.directMessages], uid, new Set(state.preferences.blockedIds))) {
    const id = directConversationId(message.fromId, message.toId), rows = groups.get(id) ?? []; rows.push(message); groups.set(id, rows);
  }
  const result: DirectConversation[] = [];
  for (const [id, messages] of groups) {
    const first = messages[0], last = messages.at(-1)!, participants = [first.fromId, first.toId].sort();
    const memberNames: Record<string, string> = {}, memberInitials: Record<string, string> = {}, unreadCounts: Record<string, number> = {};
    for (const message of messages) {
      if (message.fromName) { memberNames[message.fromId] = message.fromName; memberInitials[message.fromId] = message.fromInitials ?? ""; }
      if (message.toName) { memberNames[message.toId] = message.toName; memberInitials[message.toId] = message.toInitials ?? ""; }
      if (!message.read) unreadCounts[message.toId] = (unreadCounts[message.toId] ?? 0) + 1;
    }
    for (const participant of participants) if (!memberNames[participant]) {
      const profile = state.profiles.find(profile => profile.id === participant);
      const connected = state.connections.some(connection => connection.status === "accepted" && [connection.fromId, connection.toId].includes(uid) && [connection.fromId, connection.toId].includes(participant));
      const visible = profile && (profile.visibility === "public" || participant === uid || connected);
      memberNames[participant] = visible ? profile.name : "Loop member"; memberInitials[participant] = visible ? profile.initials : "";
    }
    result.push({ id, participantIds: participants, memberNames, memberInitials, createdAt: first.createdAt, lastAt: last.createdAt, sequence: messages.reduce((maximum, message) => Math.max(maximum, message.sequence ?? 0), messages.length), readThrough: {}, readAt: {}, unreadCounts, lastMessage: { id: last.id, fromId: last.fromId, body: last.body.slice(0, 180), createdAt: last.createdAt, hasImage: Boolean(last.image), ...(last.editedAt ? { editedAt: last.editedAt } : {}) } });
  }
  return result.sort((a, b) => b.lastAt.localeCompare(a.lastAt) || b.id.localeCompare(a.id));
}
