import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import { collection, connectFirestoreEmulator, doc, documentId, getDoc, getDocs, getFirestore, limit, onSnapshot, orderBy, query, where, type Firestore } from "firebase/firestore";
import { DocumentWatch, type DocumentUpdate } from "./documentWatch";
import { DocumentCache } from "./documentCache";

const backend = createRequire(new URL("../../../functions/package.json", import.meta.url));
const { initializeTestEnvironment } = backend("@firebase/rules-unit-testing"), admin = backend("firebase/firestore");
type Context = { firestore(): Firestore };
type Row = { id: string; title: string; body?: string; endAt?: string };
let env: { withSecurityRulesDisabled(work: (context: Context) => Promise<void>): Promise<void>; cleanup(): Promise<void> };
const uid = `links-${Math.random().toString(36).slice(2, 10)}`, oldPost = `${uid}-old`, farEvent = `${uid}-future`, privateAuthor = `${uid}-author`;
const paths: string[] = [], apps: FirebaseApp[] = [];
let db: Firestore, inactiveDb: Firestore;
before(async () => {
  const endpoint = /^(127\.0\.0\.1|localhost):([0-9]{1,5})$/.exec(process.env.FIRESTORE_EMULATOR_HOST ?? ""), port = Number(endpoint?.[2]);
  if (!endpoint || port < 1 || port > 65535) throw new Error("Set an explicit loopback FIRESTORE_EMULATOR_HOST for this isolated suite.");
  const host = endpoint[1], projectId = "demo-theloop-target-links";
  env = await initializeTestEnvironment({ projectId, firestore: { host, port, rules: readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8") } });
  await env.withSecurityRulesDisabled(async context => {
    const rows: [string, Record<string, unknown>][] = [[`users/${uid}`, { id: uid, preferences: {} }], [`profiles/${privateAuthor}`, { id: privateAuthor, visibility: "connections", name: "Private professional profile" }], [`posts/${oldPost}`, { id: oldPost, title: "Older shared post", body: "Beyond the recent feed", authorId: privateAuthor, authorName: "Shared author name", createdAt: "2020-01-01T00:00:00.000Z" }], [`events/${farEvent}`, { id: farEvent, title: "Far future shared event", hostId: privateAuthor, startAt: "2040-01-01T00:00:00.000Z", endAt: "2040-01-01T01:00:00.000Z" }]];
    for (let index = 0; index < 110; index++) {
      rows.push([`posts/${uid}-recent-${index}`, { title: `Recent ${index}`, createdAt: "2026-10-26T00:00:00.000Z" }]);
      rows.push([`events/${uid}-near-${index}`, { title: `Near future ${index}`, startAt: "2027-01-01T00:00:00.000Z", endAt: "2027-01-01T01:00:00.000Z" }]);
    }
    paths.push(...rows.map(([path]) => path));
    const batch = admin.writeBatch(context.firestore());
    for (const [path, value] of rows) batch.set(admin.doc(context.firestore(), path), value);
    await batch.commit();
  });
  const client = (id: string) => {
    const app = initializeApp({ projectId, apiKey: "fake-emulator-key", appId: "target-links" }, id); apps.push(app);
    const db = getFirestore(app); connectFirestoreEmulator(db, host, port, { mockUserToken: { sub: id, user_id: id } }); return db;
  };
  db = client(uid); inactiveDb = client(`${uid}-inactive`);
});
after(async () => {
  if (!env) return;
  await env.withSecurityRulesDisabled(async context => {
    const batch = admin.writeBatch(context.firestore());
    for (const path of paths) batch.delete(admin.doc(context.firestore(), path));
    await batch.commit();
  });
  await env.cleanup(); await Promise.all(apps.map(app => deleteApp(app)));
});

function watcher(name: "posts" | "events", firestore = db) {
  const cache = new DocumentCache<Row>(), changes = new EventEmitter();
  let latest: DocumentUpdate<Row> = { record: undefined, fromCache: false, status: { id: null, loading: false, notFound: false, error: null } };
  const watch = new DocumentWatch<Row>({ current: () => true,
    subscribe: (id, success, error) => onSnapshot(doc(firestore, name, id), { includeMetadataChanges: true }, snap => success(snap.exists() ? { ...snap.data(), id: snap.id } as Row : undefined, snap.metadata.fromCache), error),
    publish: update => { latest = cache.apply(update); changes.emit("change"); },
  });
  const until = (predicate: (update: DocumentUpdate<Row>) => boolean) => {
    if (predicate(latest)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const check = () => { if (predicate(latest)) { clearTimeout(timer); changes.off("change", check); resolve(); } };
      const timer = setTimeout(() => { changes.off("change", check); reject(new Error("Targeted document snapshot timed out.")); }, 16000);
      changes.on("change", check);
    });
  };
  return { cache, until, latest: () => latest, start(id: string) { cache.select(id); watch.watch(id); }, stop() { cache.select(null); watch.stop(); } };
}

test("old shared post opens outside recent100 without granting private author profile access", async () => {
  const feed = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(100)));
  assert.ok(!feed.docs.some(record => record.id === oldPost));
  const target = watcher("posts"); target.start(oldPost);
  try {
    await target.until(update => !update.status.loading && update.record?.id === oldPost);
    assert.equal(target.latest().record?.body, "Beyond the recent feed");
    await assert.rejects(getDoc(doc(db, "profiles", privateAuthor)), error => (error as { code?: string }).code === "permission-denied");
    const oldSavedRead = target.cache.beginRead([oldPost]);
    const savedSnapshot = await getDocs(query(collection(db, "posts"), where(documentId(), "in", [oldPost])));
    const saved = new Map(savedSnapshot.docs.map(record => [record.id, { ...record.data(), id: record.id } as Row]));
    await env.withSecurityRulesDisabled(async context => { await admin.deleteDoc(admin.doc(context.firestore(), "posts", oldPost)); });
    await target.until(update => update.status.notFound);
    saved.delete(oldPost); target.stop();
    target.cache.mergeRead(saved, oldSavedRead, savedSnapshot.docs.map(record => ({ ...record.data(), id: record.id }) as Row), true);
    target.cache.endRead(oldSavedRead);
    assert.equal(saved.has(oldPost), false);
  } finally { target.stop(); }
});
test("shared event outside upcoming100 stays live when its time crosses the calendar boundary", async () => {
  const upcoming = await getDocs(query(collection(db, "events"), where("endAt", ">=", "2026-10-26T00:00:00.000Z"), orderBy("endAt"), limit(100)));
  assert.ok(!upcoming.docs.some(record => record.id === farEvent));
  const target = watcher("events"); target.start(farEvent);
  try {
    await target.until(update => !update.status.loading && update.record?.id === farEvent);
    await env.withSecurityRulesDisabled(async context => { await admin.updateDoc(admin.doc(context.firestore(), "events", farEvent), { title: "Rescheduled event", startAt: "2020-01-01T00:00:00.000Z", endAt: "2020-01-01T01:00:00.000Z" }); });
    await target.until(update => update.record?.title === "Rescheduled event");
    assert.equal(target.latest().record?.endAt, "2020-01-01T01:00:00.000Z");
    await env.withSecurityRulesDisabled(async context => { await admin.deleteDoc(admin.doc(context.firestore(), "events", farEvent)); });
    await target.until(update => update.status.notFound);
    assert.deepEqual(target.cache.merge([[{ id: farEvent, title: "Stale bucket" }]]), []);
  } finally { target.stop(); }
});
test("unauthorized shared document produces an error instead of a false404", async () => {
  const target = watcher("events", inactiveDb); target.start(`${uid}-near-0`);
  try {
    await target.until(update => Boolean(update.status.error));
    assert.equal(target.latest().status.notFound, false); assert.equal(target.latest().record, undefined);
  } finally { target.stop(); }
});
