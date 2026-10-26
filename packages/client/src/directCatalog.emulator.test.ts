import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import { connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, onSnapshot, type Firestore } from "firebase/firestore";
import type { DirectConversation, DirectMessage } from "@theloop/core";
import { directConversationId } from "./directData";
import { directCatalogPageQuery, directMessagePageQuery } from "./directQueries";
import { normalizeDirectRead, parseDirectCatalogProgress, parseDirectConversation } from "./directCatalog";
import { messageCursor } from "./data";
import { MessagePages } from "./messagePages";
import { DocumentWatch } from "./documentWatch";

const backend = createRequire(new URL("../../../functions/package.json", import.meta.url));
const { initializeTestEnvironment } = backend("@firebase/rules-unit-testing"), admin = backend("firebase/firestore");
type Context = { firestore(): Firestore };
let env: { withSecurityRulesDisabled(work: (context: Context) => Promise<void>): Promise<void>; cleanup(): Promise<void> };
const uid = `catalog-${Math.random().toString(36).slice(2, 9)}`, outsider = `${uid}-outsider`, peer = (index: number) => `${uid}-peer-${index.toString().padStart(4, "0")}`;
const activeId = directConversationId(uid, peer(0)), paths: string[] = [], apps: FirebaseApp[] = [];
let db: Firestore, outsiderDb: Firestore;
before(async () => {
  const endpoint = /^(127\.0\.0\.1|localhost):([0-9]{1,5})$/.exec(process.env.FIRESTORE_EMULATOR_HOST ?? ""), port = Number(endpoint?.[2]);
  if (!endpoint || port < 1 || port > 65535) throw new Error("Set an explicit loopback FIRESTORE_EMULATOR_HOST for this isolated suite.");
  const host = endpoint[1], projectId = "demo-theloop-direct-catalog";
  env = await initializeTestEnvironment({ projectId, firestore: { host, port, rules: readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8") } });
  await env.withSecurityRulesDisabled(async context => {
    const rows: [string, Record<string, unknown>][] = [[`users/${uid}`, { id: uid, preferences: {}, directCatalog: { complete: false, processed: 50, cursor: "legacy-page", updatedAt: "2026-10-26T00:00:00.000Z" } }], [`users/${outsider}`, { id: outsider }], [`profiles/${peer(0)}`, { name: "Private professional name", visibility: "connections", company: "Private company" }]];
    for (let index = 0; index < 112; index++) {
      const other = peer(index), id = directConversationId(uid, other);
      rows.push([`directConversations/${id}`, { id, participantIds: [uid, other], memberNames: { [uid]: "Current member", [other]: `Shared peer ${index}` }, memberInitials: { [uid]: "CM", [other]: "SP" }, createdAt: "2020-01-01T00:00:00.000Z", lastAt: "2026-10-26T00:00:00.000Z", sequence: 1206, readThrough: { [uid]: 1205 }, readAt: { [uid]: "2026-10-26T00:00:00.000Z" }, unreadCounts: { [uid]: 1 }, lastMessage: { id: `${uid}-message-1206`, fromId: other, body: "Latest caption", createdAt: "2026-10-26T00:00:00.000Z", hasImage: false } }]);
    }
    for (let index = 1; index <= 1206; index++) rows.push([`directMessages/${uid}-message-${index.toString().padStart(4, "0")}`, { fromId: peer(0), toId: uid, participantIds: [uid, peer(0)], conversationId: activeId, sequence: index, body: `Caption ${index}`, createdAt: "2020-01-01T00:00:00.000Z", read: false }]);
    paths.push(...rows.map(([path]) => path));
    for (let offset = 0; offset < rows.length; offset += 400) {
      const batch = admin.writeBatch(context.firestore());
      for (const [path, value] of rows.slice(offset, offset + 400)) batch.set(admin.doc(context.firestore(), path), value);
      await batch.commit();
    }
  });
  const client = (id: string) => { const app = initializeApp({ projectId, apiKey: "fake-emulator-key", appId: "direct-catalog" }, id); apps.push(app); const db = getFirestore(app); connectFirestoreEmulator(db, host, port, { mockUserToken: { sub: id, user_id: id } }); return db; };
  db = client(uid); outsiderDb = client(outsider);
});
after(async () => {
  if (!env) return;
  await env.withSecurityRulesDisabled(async context => {
    for (let offset = 0; offset < paths.length; offset += 400) {
      const batch = admin.writeBatch(context.firestore()); for (const path of paths.slice(offset, offset + 400)) batch.delete(admin.doc(context.firestore(), path)); await batch.commit();
    }
  });
  await env.cleanup(); await Promise.all(apps.map(app => deleteApp(app)));
});

test("catalog pages112 same-activity conversations in50/50/12 without private profile grants", async () => {
  const ids: string[] = [], sizes: number[] = []; let cursor: ReturnType<typeof messageCursor>;
  do {
    const page = await getDocs(directCatalogPageQuery(db, uid, cursor)); sizes.push(page.size);
    const rows = page.docs.map(record => parseDirectConversation(record.data(), record.id, uid)!);
    ids.push(...rows.map(row => row.id));
    cursor = page.size === 50 ? messageCursor(rows.map(row => ({ id: row.id, createdAt: row.lastAt }))) : undefined;
  } while (cursor);
  assert.deepEqual(sizes, [50, 50, 12]); assert.equal(new Set(ids).size, 112);
  await assert.rejects(getDoc(doc(db, "profiles", peer(0))), error => (error as { code?: string }).code === "permission-denied");
  await assert.rejects(getDoc(doc(outsiderDb, "directConversations", activeId)), error => (error as { code?: string }).code === "permission-denied");
  assert.equal(parseDirectCatalogProgress((await getDoc(doc(db, "users", uid))).data()?.directCatalog)?.complete, false);
});
test("selected summary outside first50 normalizes1205 unread raw flags and receives watermark updates", async () => {
  const first = await getDocs(directCatalogPageQuery(db, uid)); assert.ok(!first.docs.some(record => record.id === activeId));
  const changes = new EventEmitter(); let active: DirectConversation | undefined;
  const wait = (predicate: () => boolean) => predicate() ? Promise.resolve() : new Promise<void>((resolve, reject) => {
    const listener = () => { if (predicate()) { clearTimeout(timer); changes.off("change", listener); resolve(); } };
    const timer = setTimeout(() => { changes.off("change", listener); reject(new Error("Active watermark timed out.")); }, 15000); changes.on("change", listener);
  });
  const watch = new DocumentWatch<DirectConversation>({ current: () => true, subscribe: (id, success, error) => onSnapshot(doc(db, "directConversations", id), { includeMetadataChanges: true }, snap => success(snap.exists() ? parseDirectConversation(snap.data(), snap.id, uid) : undefined, snap.metadata.fromCache), error), publish(update) { active = update.record; changes.emit("change"); } });
  watch.watch(activeId);
  try {
    await wait(() => Boolean(active));
    const raw: DirectMessage[] = []; let cursor: ReturnType<typeof messageCursor>;
    do {
      const page = await getDocs(directMessagePageQuery(db, uid, peer(0), cursor));
      const rows = page.docs.map(record => ({ ...record.data(), id: record.id }) as DirectMessage); raw.push(...rows); cursor = page.size === 100 ? messageCursor(rows) : undefined;
    } while (cursor);
    assert.equal(raw.length, 1206); assert.ok(raw.every(message => !message.read));
    assert.equal(normalizeDirectRead(raw, new Map([[activeId, active!]])).filter(message => message.read).length, 1205);
    await env.withSecurityRulesDisabled(async context => { await admin.updateDoc(admin.doc(context.firestore(), "directConversations", activeId), { readThrough: { [uid]: 1206 }, unreadCounts: { [uid]: 0 } }); });
    await wait(() => active?.readThrough[uid] === 1206);
    assert.ok(normalizeDirectRead(raw, new Map([[activeId, active!]])).every(message => message.read));
    assert.equal((await getDoc(doc(db, "directMessages", `${uid}-message-1206`))).data()?.read, false);
  } finally { watch.stop(); }
});
test("live catalog pagination advances beyond a fully blocked first page", async () => {
  const blocked = new Set(Array.from({ length: 50 }, (_, index) => peer(62 + index))), changes = new EventEmitter();
  let rows: DirectConversation[] = [], status = { loading: false, hasMore: false }, error: unknown;
  const wait = (predicate: () => boolean) => {
    if (error) return Promise.reject(error); if (predicate()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const listener = () => { if (error || predicate()) { clearTimeout(timer); changes.off("change", listener); error ? reject(error) : resolve(); } };
      const timer = setTimeout(() => { changes.off("change", listener); reject(new Error("Catalog page timed out.")); }, 15000); changes.on("change", listener);
    });
  };
  const pages = new MessagePages<DirectConversation>({ pageSize: 50, sortAt: row => row.lastAt, filter: row => !row.participantIds.some(id => blocked.has(id)), subscribe: (cursor, success, fail) => onSnapshot(directCatalogPageQuery(db, uid, cursor), snap => success(snap.docs.map(record => parseDirectConversation(record.data(), record.id, uid)!)), fail), publish(next, history) { rows = next; status = history; changes.emit("change"); }, failure(value) { error = value; changes.emit("change"); } });
  pages.start();
  try {
    await wait(() => !status.loading && status.hasMore); assert.equal(rows.length, 0);
    await pages.loadMore(); await pages.loadMore(); assert.equal(rows.length, 62); assert.equal(status.hasMore, false);
    blocked.clear(); pages.restart(); await wait(() => !status.loading && rows.length === 112);
    assert.equal(new Set(rows.map(row => row.id)).size, 112);
  } finally { pages.stop(); }
});
