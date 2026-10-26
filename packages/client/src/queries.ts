import { collection, documentId, limit, orderBy, query, startAfter, where, type Firestore } from "firebase/firestore";
import { normalizeDirectoryQuery, type MessageCursor } from "./data";

export type DirectoryCursor = { nameKey: string; id: string };

export function directoryPageQuery(db: Firestore, text: string, cursor?: DirectoryCursor) {
  const term = normalizeDirectoryQuery(text);
  return query(collection(db, "profiles"), where("visibility", "==", "public"), ...(term ? [where("searchKeys", "array-contains", term)] : []), orderBy("nameKey", "asc"), orderBy(documentId(), "asc"), ...(cursor ? [startAfter(cursor.nameKey, cursor.id)] : []), limit(50));
}

export function messagePageQuery(db: Firestore, channelId: string, topic?: string, cursor?: MessageCursor) {
  return query(collection(db, "messages"), where("channelId", "==", channelId), ...(topic !== undefined ? [where("topic", "==", topic)] : []), orderBy("createdAt", "desc"), orderBy(documentId(), "desc"), ...(cursor ? [startAfter(cursor.createdAt, cursor.id)] : []), limit(100));
}

export function squadMessagePageQuery(db: Firestore, squadId: string, userId: string, cursor?: MessageCursor) {
  return query(collection(db, "squadMessages"), where("squadId", "==", squadId), where("audienceIds", "array-contains", userId), orderBy("createdAt", "desc"), orderBy(documentId(), "desc"), ...(cursor ? [startAfter(cursor.createdAt, cursor.id)] : []), limit(100));
}

export function squadMembershipQuery(db: Firestore, userId: string) {
  return query(collection(db, "squads"), where("memberIds", "array-contains", userId), orderBy("updatedAt", "desc"), limit(50));
}
export function squadParticipantInvitesQuery(db: Firestore, userId: string) {
  return query(collection(db, "squadInvites"), where("participantIds", "array-contains", userId), orderBy("createdAt", "desc"), limit(100));
}
export function squadIncomingInvitesQuery(db: Firestore, userId: string) {
  return query(collection(db, "squadInvites"), where("toId", "==", userId), where("status", "==", "pending"), orderBy("createdAt", "desc"), limit(100));
}
export function squadOwnerInvitesQuery(db: Firestore, squadId: string) {
  return query(collection(db, "squadInvites"), where("squadId", "==", squadId), where("status", "==", "pending"), orderBy("createdAt", "desc"), limit(12));
}
