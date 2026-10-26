import test from "node:test";
import assert from "node:assert/strict";
import {
  firstAfroTechCatalog,
  initializeFirstAfroTech,
  parseSeedOptions,
  type CatalogDocument,
  type CatalogTransaction,
  type OwnerIdentity,
} from "../scripts/liveCatalog";

const uid = "real-owner-uid";
const now = "2026-10-26T19:00:00.000Z";
const args = ["--project", "theloop-community-2026", "--owner", uid];
const options = { projectId: "theloop-community-2026", ownerId: uid, apply: true };
const auth: OwnerIdentity = { uid, email: "owner@example.test", emailVerified: true, disabled: false };
const owner = () => ({
  [`users/${uid}`]: { id: uid, preferences: { interests: ["Design"] }, createdAt: now },
  [`profiles/${uid}`]: { id: uid, name: "Actual owner" },
});
function database(initial: Record<string, CatalogDocument> = owner()) {
  const records = new Map(Object.entries(structuredClone(initial)));
  const writes: { path: string; value: CatalogDocument; kind: "create" | "update" }[] = [];
  const tx: CatalogTransaction = {
    get: async (path) => {
      assert.equal(writes.length, 0, "all reads must precede any write");
      return records.get(path);
    },
    create: (path, value) => {
      assert.equal(records.has(path), false, "an existing document must never be replaced");
      writes.push({ path, value: structuredClone(value), kind: "create" });
    },
    update: (path, value) => { writes.push({ path, value: structuredClone(value), kind: "update" }); },
  };
  return { records, writes, tx };
}

test("live initializer requires explicit project/owner and defaults to a no-write preview", () => {
  assert.deepEqual(parseSeedOptions(args, {}), { ...options, apply: false });
  assert.deepEqual(parseSeedOptions([...args, "--dry-run"], {}), { ...options, apply: false });
  assert.deepEqual(parseSeedOptions([...args, "--apply"], {}), options);
  for (const invalid of [
    [], ["--owner", uid], ["--project", "other-customer", "--owner", uid],
    ["--project", "theloop-x-", "--owner", uid], ["--project", "theloop-" + "x".repeat(30), "--owner", uid],
    ["--project", "theloop-community-2026", "--owner"], [...args, "--owner", "another"],
    [...args, "--dry-run", "--apply"], [...args, "--apply", "--apply"], [...args, "--force"],
    ["--project", "theloop-community-2026", "--owner", "../../other"],
  ]) assert.throws(() => parseSeedOptions(invalid, {}));
});

test("live initializer refuses every emulator setting before connecting", () => {
  for (const key of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST", "FUNCTIONS_EMULATOR"])
    assert.throws(() => parseSeedOptions(args, { [key]: "127.0.0.1:8080" }), /refuses emulator/);
});

test("first live catalog contains only one real AfroTech hub and one chat, without fabricated activity", () => {
  const catalog = firstAfroTechCatalog(uid, now);
  assert.deepEqual(Object.keys(catalog), ["conferences/afrotech", "channels/afrotech-general"]);
  const conference = catalog["conferences/afrotech"];
  const channel = catalog["channels/afrotech-general"];
  assert.equal(conference.name, "AfroTech 2026");
  assert.equal(conference.startDate, "2026-11-02");
  assert.equal(conference.endDate, "2026-11-06");
  assert.equal(conference.city, "Houston, TX");
  assert.match(String(conference.description), /George R\. Brown Convention Center/);
  assert.equal(channel.name, "AfroTech group chat");
  assert.equal(channel.conferenceId, conference.id);
  assert.equal(channel.visibility, "public");
  assert.deepEqual(channel.topics, ["General", "Introductions", "Jobs & referrals", "Side events", "Travel"]);
  assert.equal(conference.members, 0);
  assert.equal(channel.members, 0);
  assert.equal(channel.memberIds, undefined);
  assert.deepEqual(conference.organizerIds, [uid]);
  assert.deepEqual(channel.moderatorIds, [uid]);
  assert.equal(channel.creatorId, uid);
});

test("dry run reports catalog and admin grant without any writes", async () => {
  const db = database();
  const result = await initializeFirstAfroTech(db.tx, { ...options, apply: false }, auth, now);
  assert.deepEqual(result.created, ["conferences/afrotech", "channels/afrotech-general"]);
  assert.equal(result.grantAdmin, true);
  assert.deepEqual(db.writes, []);
  assert.deepEqual(Object.fromEntries(db.records), owner());
});

test("apply stages exactly two create-only records and the explicit owner admin grant", async () => {
  const db = database({ ...owner(), "posts/keep-existing": { title: "Member content" } });
  const result = await initializeFirstAfroTech(db.tx, options, auth, now);
  assert.equal(result.created.length, 2);
  assert.deepEqual(db.writes.map(({ path, kind }) => [path, kind]), [
    ["conferences/afrotech", "create"], ["channels/afrotech-general", "create"], [`users/${uid}`, "update"],
  ]);
  assert.deepEqual(db.writes[2].value, { role: "admin" });
  assert.deepEqual(db.records.get("posts/keep-existing"), { title: "Member content" });
  assert.deepEqual(db.records.get(`users/${uid}`)?.preferences, { interests: ["Design"] });
});

test("same-owner reruns verify and skip existing docs without resetting counts or timestamps", async () => {
  const catalog = firstAfroTechCatalog(uid, "2026-10-25T00:00:00.000Z");
  catalog["conferences/afrotech"].members = 23;
  catalog["channels/afrotech-general"].members = 12;
  catalog["channels/afrotech-general"].moderatorIds = [uid, "additional-moderator"];
  const db = database({ ...owner(), ...catalog, [`users/${uid}`]: { ...owner()[`users/${uid}`], role: "admin" } });
  const result = await initializeFirstAfroTech(db.tx, options, auth, now);
  assert.deepEqual(result, { created: [], skipped: Object.keys(catalog), grantAdmin: false });
  assert.deepEqual(db.writes, []);
  assert.equal(db.records.get("channels/afrotech-general")?.members, 12);
  assert.equal(db.records.get("conferences/afrotech")?.createdAt, "2026-10-25T00:00:00.000Z");
});

test("an interrupted prior initialization creates only the missing matching record", async () => {
  const catalog = firstAfroTechCatalog(uid, now);
  const db = database({ ...owner(), "conferences/afrotech": catalog["conferences/afrotech"] });
  const result = await initializeFirstAfroTech(db.tx, options, auth, now);
  assert.deepEqual(result.created, ["channels/afrotech-general"]);
  assert.deepEqual(result.skipped, ["conferences/afrotech"]);
  assert.equal(db.writes.filter((write) => write.kind === "create").length, 1);
});

test("metadata, scope and ownership conflicts abort before creating either record or granting admin", async () => {
  for (const [path, patch] of [
    ["conferences/afrotech", { organizerIds: ["another-owner"] }],
    ["conferences/afrotech", { startDate: "2026-01-01" }],
    ["channels/afrotech-general", { name: "Existing community name" }],
    ["channels/afrotech-general", { creatorId: "another-owner" }],
    ["channels/afrotech-general", { visibility: "private" }],
    ["channels/afrotech-general", { topics: ["Existing topic"] }],
    ["channels/afrotech-general", { communityId: "another-community" }],
    ["channels/afrotech-general", { members: -1 }],
  ] as [string, CatalogDocument][]) {
    const db = database({ ...owner(), [path]: { ...firstAfroTechCatalog(uid, now)[path], ...patch } });
    await assert.rejects(initializeFirstAfroTech(db.tx, options, auth, now), /Catalog conflict/);
    assert.deepEqual(db.writes, []);
  }
});

test("unverified/disabled Auth and incomplete, mismatched or deleting owner records cannot initialize", async () => {
  for (const invalidAuth of [
    { ...auth, uid: "wrong-uid" }, { ...auth, emailVerified: false },
    { ...auth, disabled: true }, { ...auth, email: undefined },
  ]) {
    const db = database();
    await assert.rejects(initializeFirstAfroTech(db.tx, options, invalidAuth, now), /active, email-verified/);
    assert.deepEqual(db.writes, []);
  }
  const invalidRecords: Record<string, CatalogDocument>[] = [
    {}, { [`users/${uid}`]: owner()[`users/${uid}`] },
    { ...owner(), [`profiles/${uid}`]: { id: "wrong-uid" } },
    { ...owner(), [`users/${uid}`]: { id: uid } },
    { ...owner(), [`users/${uid}`]: { id: uid, preferences: [] } },
    { ...owner(), [`users/${uid}`]: { ...owner()[`users/${uid}`], disabled: true } },
    { ...owner(), [`users/${uid}`]: { ...owner()[`users/${uid}`], deletionPending: true } },
  ];
  for (const records of invalidRecords) {
    const db = database(records);
    await assert.rejects(initializeFirstAfroTech(db.tx, options, auth, now), /bootstrap|disabled|deletion/);
    assert.deepEqual(db.writes, []);
  }
});
