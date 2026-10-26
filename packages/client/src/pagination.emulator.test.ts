import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import { collection, connectFirestoreEmulator, getFirestore, getDocs, onSnapshot, query, where, type Firestore } from "firebase/firestore";
import type { Message } from "@theloop/core";
import { directoryFields } from "../../../functions/src/directory";
import { messageCursor } from "./data";
import { directoryPageQuery, messagePageQuery, type DirectoryCursor } from "./queries";

// Explicit opt-in emulator suite; it never points at the deployed TheLoop project.
const requireBackend = createRequire(new URL("../../../functions/package.json", import.meta.url));
const { initializeTestEnvironment } = requireBackend("@firebase/rules-unit-testing");
// Rules-test contexts use the CJS SDK. Use its matching write helpers for privileged
// fixture work, and the real client ESM SDK for all queries under test.
const adminSdk = requireBackend("firebase/firestore");
type TestContext = { firestore(): Firestore };
let env: { authenticatedContext(uid: string): TestContext; withSecurityRulesDisabled(work: (context: TestContext) => Promise<void>): Promise<void>; cleanup(): Promise<void> };
const nonce = Math.random().toString(36).slice(2, 9), uid = `pagination-${nonce}`, room = `${uid}-room-34`, privateRoom = `${uid}-private`;
const name = `Élodie ${nonce}`, paths: string[] = [];
let db: Firestore;
let app: FirebaseApp | undefined;

before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  const endpoint = /^(127\.0\.0\.1|localhost):([0-9]{1,5})$/.exec(address ?? "");
  const port = Number(endpoint?.[2]);
  if (!endpoint || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Set FIRESTORE_EMULATOR_HOST to an explicit loopback host and valid port, such as 127.0.0.1:8080.");
  const host = endpoint[1];
  env = await initializeTestEnvironment({ projectId: "demo-theloop-pagination", firestore: { host, port, rules: readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8") } });
  await env.withSecurityRulesDisabled(async context => {
    const fixture: [string, Record<string, unknown>][] = [[`users/${uid}`, { id: uid, preferences: {} }], [`channels/${privateRoom}`, { visibility: "private", memberIds: [uid] }], [`messages/${uid}-private`, { channelId: privateRoom, topic: "private", createdAt: "2026-10-26T00:00:00.000Z" }]];
    for (let index = 0; index < 35; index++) fixture.push([`channels/${uid}-room-${index}`, { visibility: "public", memberIds: [] }]);
    for (let index = 0; index < 301; index++) fixture.push([`messages/${uid}-archive-${index.toString().padStart(4, "0")}`, { channelId: room, topic: "archive", createdAt: "2020-01-01T00:00:00.000Z", body: `Archive ${index}` }]);
    for (let index = 0; index < 110; index++) fixture.push([`messages/${uid}-new-${index.toString().padStart(4, "0")}`, { channelId: room, topic: "new", createdAt: "2026-10-26T00:00:00.000Z" }]);
    for (let index = 0; index < 111; index++) fixture.push([`profiles/${uid}-profile-${index.toString().padStart(4, "0")}`, { name, visibility: "public", ...directoryFields({ name, headline: "Data Engineer", location: "São Paulo" }) }]);
    fixture.push([`profiles/${uid}-private-profile`, { name, visibility: "connections", ...directoryFields({ name }) }]);
    paths.push(...fixture.map(([path]) => path));
    for (let offset = 0; offset < fixture.length; offset += 400) {
      const batch = adminSdk.writeBatch(context.firestore());
      for (const [path, value] of fixture.slice(offset, offset + 400)) batch.set(adminSdk.doc(context.firestore(), path), value);
      await batch.commit();
    }
  });
  app = initializeApp({ projectId: "demo-theloop-pagination", apiKey: "fake-emulator-key", appId: "pagination-emulator" }, uid);
  db = getFirestore(app);
  connectFirestoreEmulator(db, host, port, { mockUserToken: { sub: uid, user_id: uid } });
});

after(async () => {
  if (!env) return;
  await env.withSecurityRulesDisabled(async context => {
    for (let offset = 0; offset < paths.length; offset += 400) {
      const batch = adminSdk.writeBatch(context.firestore());
      for (const path of paths.slice(offset, offset + 400)) batch.delete(adminSdk.doc(context.firestore(), path));
      await batch.commit();
    }
  });
  await env.cleanup();
  if (app) await deleteApp(app);
});

test("actual active/topic query reaches old records beyond preview rooms and last100", async () => {
  const recent = await getDocs(messagePageQuery(db, room));
  assert.equal(recent.size, 100);
  assert.ok(recent.docs.every(record => record.data().topic === "new"));
  const ids: string[] = [];
  let cursor: ReturnType<typeof messageCursor>;
  do {
    const page = await getDocs(messagePageQuery(db, room, "archive", cursor));
    const rows = page.docs.map(record => ({ ...record.data(), id: record.id }) as Message);
    ids.push(...rows.map(row => row.id));
    cursor = page.size === 100 ? messageCursor(rows) : undefined;
  } while (cursor);
  assert.equal(ids.length, 301);
  assert.equal(new Set(ids).size, 301);
  assert.ok(ids.every(id => id.includes("-archive-")));
});

test("actual normalized public directory pages all equal-name records in groups of50", async () => {
  const ids: string[] = [];
  const sizes: number[] = [];
  let cursor: DirectoryCursor | undefined;
  do {
    const page = await getDocs(directoryPageQuery(db, name, cursor));
    sizes.push(page.size);
    ids.push(...page.docs.map(record => record.id));
    const last = page.docs.at(-1);
    cursor = page.size === 50 && last ? { nameKey: last.data().nameKey as string, id: last.id } : undefined;
  } while (cursor);
  assert.deepEqual(sizes, [50, 50, 11]);
  assert.equal(ids.length, 111);
  assert.equal(new Set(ids).size, 111);
  assert.ok(!ids.some(id => id.endsWith("private-profile")));
});

test("live directory removes visibility-revoked public profile", async () => {
  const id = `${uid}-profile-0000`;
  await new Promise<void>((resolve, reject) => {
    let sawPublic = false;
    const timer = setTimeout(() => { unsubscribe(); reject(new Error("Directory revocation snapshot timed out.")); }, 10000);
    const unsubscribe = onSnapshot(directoryPageQuery(db, name), async snap => {
      if (!sawPublic && snap.docs.some(record => record.id === id)) {
        sawPublic = true;
        try { await env.withSecurityRulesDisabled(async context => { await adminSdk.updateDoc(adminSdk.doc(context.firestore(), "profiles", id), { visibility: "connections" }); }); }
        catch (error) { clearTimeout(timer); unsubscribe(); reject(error); }
      } else if (sawPublic && !snap.docs.some(record => record.id === id)) {
        clearTimeout(timer); unsubscribe(); resolve();
      }
    }, error => { clearTimeout(timer); unsubscribe(); reject(error); });
  });
});

test("private room pagination is denied after membership revocation", async () => {
  assert.equal((await getDocs(messagePageQuery(db, privateRoom, "private"))).size, 1);
  await env.withSecurityRulesDisabled(async context => { await adminSdk.updateDoc(adminSdk.doc(context.firestore(), "channels", privateRoom), { memberIds: [] }); });
  await assert.rejects(getDocs(messagePageQuery(db, privateRoom, "private")), error => (error as { code?: string }).code === "permission-denied");
  assert.equal((await getDocs(query(collection(db, "channels"), where("visibility", "==", "public")))).docs.filter(record => record.id.startsWith(uid)).length, 35);
});
