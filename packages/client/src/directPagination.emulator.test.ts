import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import { collection, connectFirestoreEmulator, documentId, getDocs, getFirestore, limit, onSnapshot, orderBy, query, where, type Firestore } from "firebase/firestore";
import { messageCursor } from "./data";
import { directConversationId, type DirectSnapshot } from "./directData";
import { directMessagePageQuery } from "./directQueries";
import { MessagePages } from "./messagePages";

const backend = createRequire(new URL("../../../functions/package.json", import.meta.url));
const { initializeTestEnvironment } = backend("@firebase/rules-unit-testing"), admin = backend("firebase/firestore");
type Context = { firestore(): Firestore };
let env: { withSecurityRulesDisabled(work: (context: Context) => Promise<void>): Promise<void>; cleanup(): Promise<void> };
const uid = `dm-${Math.random().toString(36).slice(2, 10)}`, peer = `${uid}-peer`, busy = `${uid}-busy`, outsider = `${uid}-outsider`;
const paths: string[] = [], apps: FirebaseApp[] = [];
let db: Firestore, outsiderDb: Firestore;

before(async () => {
  const endpoint = /^(127\.0\.0\.1|localhost):([0-9]{1,5})$/.exec(process.env.FIRESTORE_EMULATOR_HOST ?? ""), port = Number(endpoint?.[2]);
  if (!endpoint || port < 1 || port > 65535) throw new Error("Set an explicit loopback FIRESTORE_EMULATOR_HOST for this isolated suite.");
  const host = endpoint[1], projectId = "demo-theloop-direct-pagination";
  env = await initializeTestEnvironment({ projectId, firestore: { host, port, rules: readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8") } });
  await env.withSecurityRulesDisabled(async context => {
    const rows: [string, Record<string, unknown>][] = [uid, peer, busy, outsider].map(id => [`users/${id}`, { id, preferences: {} }]);
    for (let index = 0; index < 301; index++) rows.push([`directMessages/${uid}-old-${index.toString().padStart(4, "0")}`, { fromId: peer, toId: uid, fromName: "Private conversation partner", fromInitials: "PC", toName: "Current member", toInitials: "CM", participantIds: [uid, peer], conversationId: directConversationId(uid, peer), createdAt: "2020-01-01T00:00:00.000Z", body: `Old ${index}`, read: false, unreadRecipientId: uid }]);
    for (let index = 0; index < 250; index++) rows.push([`directMessages/${uid}-busy-${index.toString().padStart(4, "0")}`, { fromId: busy, toId: uid, participantIds: [uid, busy], conversationId: directConversationId(uid, busy), createdAt: "2026-10-26T00:00:00.000Z", body: `Busy ${index}`, read: false, unreadRecipientId: uid }]);
    paths.push(...rows.map(([path]) => path));
    for (let offset = 0; offset < rows.length; offset += 400) {
      const batch = admin.writeBatch(context.firestore());
      for (const [path, value] of rows.slice(offset, offset + 400)) batch.set(admin.doc(context.firestore(), path), value);
      await batch.commit();
    }
  });
  const client = (id: string) => {
    const app = initializeApp({ projectId, apiKey: "fake-emulator-key", appId: "direct-pagination" }, id); apps.push(app);
    const db = getFirestore(app); connectFirestoreEmulator(db, host, port, { mockUserToken: { sub: id, user_id: id } }); return db;
  };
  db = client(uid); outsiderDb = client(outsider);
});
after(async () => {
  if (!env) return;
  await env.withSecurityRulesDisabled(async context => {
    for (let offset = 0; offset < paths.length; offset += 400) {
      const batch = admin.writeBatch(context.firestore());
      for (const path of paths.slice(offset, offset + 400)) batch.delete(admin.doc(context.firestore(), path));
      await batch.commit();
    }
  });
  await env.cleanup(); await Promise.all(apps.map(app => deleteApp(app)));
});

test("active direct history reaches301 equal-time records buried beyond global recent200", async () => {
  const preview = await getDocs(query(collection(db, "directMessages"), where("participantIds", "array-contains", uid), orderBy("createdAt", "desc"), orderBy(documentId(), "desc"), limit(200)));
  assert.equal(preview.size, 200);
  assert.ok(preview.docs.every(record => record.data().fromId === busy));
  const ids: string[] = []; let cursor: ReturnType<typeof messageCursor>;
  do {
    const page = await getDocs(directMessagePageQuery(db, uid, peer, cursor));
    const rows = page.docs.map(record => ({ ...record.data(), id: record.id }) as DirectSnapshot);
    ids.push(...rows.map(row => row.id));
    assert.ok(rows.every(row => row.fromId === peer && row.toId === uid));
    assert.ok(rows.every(row => row.fromName === "Private conversation partner"));
    cursor = page.size === 100 ? messageCursor(rows) : undefined;
  } while (cursor);
  assert.equal(ids.length, 301); assert.equal(new Set(ids).size, 301);
});
test("canonical direct query cannot grant another account participant access", async () => {
  await assert.rejects(getDocs(directMessagePageQuery(outsiderDb, uid, peer)), error => (error as { code?: string }).code === "permission-denied");
  assert.equal((await getDocs(directMessagePageQuery(outsiderDb, outsider, peer))).size, 0);
});

test("live direct history pages reflect edits and deletes while keeping equal-time cursors stable", async () => {
  const updates = new EventEmitter();
  let rows: DirectSnapshot[] = [], failure: unknown;
  const until = (predicate: () => boolean) => {
    if (failure) return Promise.reject(failure);
    if (predicate()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); updates.off("change", check); updates.off("failed", failed); };
      const check = () => { if (predicate()) { cleanup(); resolve(); } };
      const failed = (error: unknown) => { cleanup(); reject(error); };
      const timer = setTimeout(() => failed(new Error("Live direct history snapshot timed out.")), 15000);
      updates.on("change", check); updates.on("failed", failed);
    });
  };
  const pages = new MessagePages<DirectSnapshot>({
    subscribe: (cursor, success, error) => onSnapshot(directMessagePageQuery(db, uid, peer, cursor), snap => success(snap.docs.map(record => ({ ...record.data(), id: record.id }) as DirectSnapshot)), error),
    publish: next => { rows = next; updates.emit("change"); },
    failure: error => { failure = error; updates.emit("failed", error); },
  });
  pages.start();
  try {
    await until(() => rows.length === 100);
    await pages.loadMore();
    assert.equal(rows.length, 200);
    const id = `${uid}-old-0120`;
    await env.withSecurityRulesDisabled(async context => { await admin.updateDoc(admin.doc(context.firestore(), "directMessages", id), { body: "Edited live caption", editedAt: "2026-10-26T01:00:00.000Z" }); });
    await until(() => rows.some(row => row.id === id && row.body === "Edited live caption"));
    await env.withSecurityRulesDisabled(async context => { await admin.deleteDoc(admin.doc(context.firestore(), "directMessages", id)); });
    await until(() => !rows.some(row => row.id === id));
    assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  } finally { pages.stop(); }
  assert.deepEqual(rows, []);
});
