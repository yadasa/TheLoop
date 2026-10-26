import { collection, documentId, limit, orderBy, query, startAfter, where, type Firestore } from "firebase/firestore";
import type { MessageCursor } from "./data";
import { directConversationId } from "./directData";

export function directMessagePageQuery(db: Firestore, userId: string, peerId: string, cursor?: MessageCursor) {
  return query(collection(db, "directMessages"), where("participantIds", "array-contains", userId), where("conversationId", "==", directConversationId(userId, peerId)), orderBy("createdAt", "desc"), orderBy(documentId(), "desc"), ...(cursor ? [startAfter(cursor.createdAt, cursor.id)] : []), limit(100));
}

export function directCatalogPageQuery(db: Firestore, userId: string, cursor?: MessageCursor) {
  return query(collection(db, "directConversations"), where("participantIds", "array-contains", userId), orderBy("lastAt", "desc"), orderBy(documentId(), "desc"), ...(cursor ? [startAfter(cursor.createdAt, cursor.id)] : []), limit(50));
}
