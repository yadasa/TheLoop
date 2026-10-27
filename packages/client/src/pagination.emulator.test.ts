import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import { collection, connectFirestoreEmulator, doc, getFirestore, getDoc, getDocs, getDocsFromServer, onSnapshot, query, where, type Firestore } from "firebase/firestore";
import type { Message } from "@theloop/core";
import { directoryFields } from "../../../functions/src/directory";
import { messageCursor } from "./data";
import { HistorySearch, emptyHistorySearch, matchesMessageSearch } from "./historySearch";
import { pinnedMessageQuery, directoryPageQuery, messagePageQuery, squadIncomingInvitesQuery, squadMembershipQuery, squadMessagePageQuery, squadOwnerInvitesQuery, squadParticipantInvitesQuery, type DirectoryCursor } from "./queries";

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
const squadId = `${uid}-crew`, friendId = `${uid}-friend`, recipientId = `${uid}-recipient`, ownerInviteId = `${uid}-owner-invite`;
let db: Firestore;
let recipientDb: Firestore;
const apps: FirebaseApp[] = [];

before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  const endpoint = /^(127\.0\.0\.1|localhost):([0-9]{1,5})$/.exec(address ?? "");
  const port = Number(endpoint?.[2]);
  if (!endpoint || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Set FIRESTORE_EMULATOR_HOST to an explicit loopback host and valid port, such as 127.0.0.1:8080.");
  const host = endpoint[1];
  env = await initializeTestEnvironment({ projectId: "demo-theloop-pagination", firestore: { host, port, rules: readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8") } });
  await env.withSecurityRulesDisabled(async context => {
    const fixture: [string, Record<string, unknown>][] = [[`users/${uid}`, { id: uid, preferences: {} }], [`channels/${privateRoom}`, { visibility: "private", memberIds: [uid] }], [`messages/${uid}-private`, { channelId: privateRoom, topic: "private", createdAt: "2026-10-26T00:00:00.000Z" }]];
    fixture.push([`users/${friendId}`, { id: friendId, preferences: {} }], [`users/${recipientId}`, { id: recipientId, preferences: {} }]);
    fixture.push([`squads/${squadId}`, { id: squadId, name: "Private crew", ownerId: uid, memberIds: [uid, friendId], archived: false, updatedAt: "2026-10-26T00:00:00.000Z" }]);
    fixture.push([`squads/${uid}-other-crew`, { id: `${uid}-other-crew`, name: "Other private crew", ownerId: friendId, memberIds: [friendId], archived: false, updatedAt: "2026-10-26T00:00:00.000Z" }]);
    fixture.push([`squadInvites/${ownerInviteId}`, { squadId, fromId: friendId, toId: recipientId, participantIds: [friendId, recipientId], status: "pending", createdAt: "2026-10-26T00:00:00.000Z", expiresAt: "2026-11-02T00:00:00.000Z" }]);
    fixture.push([`squadInvites/${uid}-incoming`, { squadId: `${uid}-other-crew`, fromId: friendId, toId: uid, participantIds: [friendId, uid], status: "pending", createdAt: "2026-10-26T00:00:00.000Z", expiresAt: "2026-11-02T00:00:00.000Z" }]);
    for (let index = 0; index < 301; index++) fixture.push([`squadMessages/${uid}-visible-${index.toString().padStart(4, "0")}`, { squadId, audienceIds: [uid, friendId], createdAt: "2020-01-01T00:00:00.000Z", body: `Visible ${index}` }]);
    for (let index = 0; index < 110; index++) fixture.push([`squadMessages/${uid}-before-join-${index.toString().padStart(4, "0")}`, { squadId, audienceIds: [friendId], createdAt: "2026-10-26T00:00:00.000Z", body: `Before joining ${index}` }]);
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
  const client = (id: string) => {
    const app = initializeApp({ projectId: "demo-theloop-pagination", apiKey: "fake-emulator-key", appId: "pagination-emulator" }, id);
    apps.push(app);
    const db = getFirestore(app);
    connectFirestoreEmulator(db, host, port, { mockUserToken: { sub: id, user_id: id } });
    return db;
  };
  db = client(uid);
  recipientDb = client(recipientId);
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
  await Promise.all(apps.map(app => deleteApp(app)));
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

test("progressive search finds an archive match beyond the newest 300 and preserves private-room rules", async () => {
  let state = emptyHistorySearch();
  const search = new HistorySearch({
    readPage: async request => {
      const page = await getDocsFromServer(messagePageQuery(db, request.channelId, request.topic, request.cursor));
      const rows = page.docs.map(record => ({ ...record.data(), id: record.id }) as Message);
      assert.ok(rows.length <= 100);
      return { matches: rows.filter(message => typeof message.body === "string" && matchesMessageSearch(message, request.query)),
        scanned: rows.length, cursor: messageCursor(rows), hasMore: rows.length === 100 };
    }, publish: next => state = next, errorText: String,
  });
  await search.start({ channelId: room, query: "Archive 0" });
  assert.equal(state.scanned, 300); assert.equal(state.hasMore, true); assert.equal(state.matches.length, 0);
  await search.more();
  assert.equal(state.scanned, 411); assert.equal(state.hasMore, false); assert.equal(state.error, null);
  assert.deepEqual(state.matches.map(message => message.id), [`${uid}-archive-0000`]);
  await assert.rejects(getDocsFromServer(messagePageQuery(recipientDb, privateRoom)), error => (error as { code?: string }).code === "permission-denied");
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

test("pinned lookup reads older selected records and enforces room boundaries", async () => {
  const page = await getDocsFromServer(pinnedMessageQuery(db, room, [`${uid}-archive-0000`, `${uid}-private`]));
  assert.deepEqual(page.docs.map(record => record.id), [`${uid}-archive-0000`]);
  assert.equal((await getDocsFromServer(pinnedMessageQuery(db, privateRoom, [`${uid}-private`]))).size, 1);
  await assert.rejects(getDocsFromServer(pinnedMessageQuery(recipientDb, privateRoom, [`${uid}-private`])), error => (error as { code?: string }).code === "permission-denied");
});

test("private room pagination is denied after membership revocation", async () => {
  assert.equal((await getDocs(messagePageQuery(db, privateRoom, "private"))).size, 1);
  await env.withSecurityRulesDisabled(async context => { await adminSdk.updateDoc(adminSdk.doc(context.firestore(), "channels", privateRoom), { memberIds: [] }); });
  await assert.rejects(getDocs(messagePageQuery(db, privateRoom, "private")), error => (error as { code?: string }).code === "permission-denied");
  await assert.rejects(getDocsFromServer(pinnedMessageQuery(db, privateRoom, [`${uid}-private`])), error => (error as { code?: string }).code === "permission-denied");
  assert.equal((await getDocs(query(collection(db, "channels"), where("visibility", "==", "public")))).docs.filter(record => record.id.startsWith(uid)).length, 35);
});

test("Squad history pages301 equal-time records while excluding pre-join audiences", async () => {
  assert.ok((await getDocs(squadMembershipQuery(db, uid))).docs.some(record => record.id === squadId));
  const ids: string[] = [];
  let cursor: ReturnType<typeof messageCursor>;
  do {
    const page = await getDocs(squadMessagePageQuery(db, squadId, uid, cursor));
    const rows = page.docs.map(record => ({ ...record.data(), id: record.id }) as Message);
    ids.push(...rows.map(row => row.id));
    cursor = page.size === 100 ? messageCursor(rows) : undefined;
  } while (cursor);
  assert.equal(ids.length, 301);
  assert.equal(new Set(ids).size, 301);
  assert.ok(ids.every(id => id.includes("-visible-")));
});

test("pending invitation consent does not grant private Squad or history access", async () => {
  assert.ok((await getDocs(squadIncomingInvitesQuery(recipientDb, recipientId))).docs.some(record => record.id === ownerInviteId));
  assert.ok((await getDocs(squadParticipantInvitesQuery(db, uid))).docs.some(record => record.id === `${uid}-incoming`));
  assert.ok((await getDocs(squadOwnerInvitesQuery(db, squadId))).docs.some(record => record.id === ownerInviteId));
  await assert.rejects(getDoc(doc(recipientDb, "squads", squadId)), error => (error as { code?: string }).code === "permission-denied");
  await assert.rejects(getDocs(squadMessagePageQuery(recipientDb, squadId, recipientId)), error => (error as { code?: string }).code === "permission-denied");
  const path = `squadMessages/${uid}-after-consent`;
  paths.push(path);
  await env.withSecurityRulesDisabled(async context => {
    await adminSdk.updateDoc(adminSdk.doc(context.firestore(), "squads", squadId), { memberIds: [uid, friendId, recipientId] });
    await adminSdk.setDoc(adminSdk.doc(context.firestore(), path), { squadId, audienceIds: [uid, friendId, recipientId], createdAt: "2026-10-26T01:00:00.000Z", body: "After consent" });
  });
  const afterJoin = await getDocs(squadMessagePageQuery(recipientDb, squadId, recipientId));
  assert.deepEqual(afterJoin.docs.map(record => record.id), [`${uid}-after-consent`]);
});

test("transferred ownership revokes nonparticipant pending invite access", async () => {
  await env.withSecurityRulesDisabled(async context => { await adminSdk.updateDoc(adminSdk.doc(context.firestore(), "squads", squadId), { ownerId: friendId }); });
  await assert.rejects(getDocs(squadOwnerInvitesQuery(db, squadId)), error => (error as { code?: string }).code === "permission-denied");
  assert.equal((await getDocs(squadIncomingInvitesQuery(db, uid))).size, 1);
});

test("removing Squad membership denies captured-audience history and removes catalog entry", async () => {
  await env.withSecurityRulesDisabled(async context => { await adminSdk.updateDoc(adminSdk.doc(context.firestore(), "squads", squadId), { memberIds: [friendId, recipientId] }); });
  await assert.rejects(getDocs(squadMessagePageQuery(db, squadId, uid)), error => (error as { code?: string }).code === "permission-denied");
  assert.ok(!(await getDocs(squadMembershipQuery(db, uid))).docs.some(record => record.id === squadId));
});
