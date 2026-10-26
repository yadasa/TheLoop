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
