import test from "node:test";
import assert from "node:assert/strict";
import type { Channel, Message, Profile } from "@theloop/core";
import { documentIdBatches, matchesDirectory, mergeMessages, messageCursor, normalizeDirectoryQuery, previewChannelIds } from "./data";

const message = (id: string, channelId: string, body = id): Message => ({ id, channelId, body, createdAt: "2026-10-26T12:00:00.000Z", authorId: "author", topic: "topic", reactions: {} });
test("active, preview and history records deduplicate and discard revoked room history", () => {
  const old = message("a", "private"), live = message("b", "public"), edited = { ...live, body: "edited" };
  const merged = mergeMessages([[old, live], [edited], [old]], new Set(["public"]));
  assert.deepEqual(merged, [edited]);
  assert.deepEqual(mergeMessages([[old]], new Set()), []);
});
test("history cursor includes document ID when many messages share an instant", () => {
  assert.deepEqual(messageCursor([message("z", "room"), message("b", "room"), message("a", "room")]), { createdAt: "2026-10-26T12:00:00.000Z", id: "a" });
  assert.deepEqual(mergeMessages([[message("z", "room"), message("a", "room")]], new Set(["room"])).map(row => row.id), ["a", "z"]);
  const records = Array.from({ length: 301 }, (_, index) => message(index.toString().padStart(4, "0"), "room"));
  const seen: string[] = [];
  let cursor: ReturnType<typeof messageCursor>;
  do {
    const page = [...records].reverse().filter(row => !cursor || row.createdAt < cursor.createdAt || (row.createdAt === cursor.createdAt && row.id < cursor.id)).slice(0, 100);
    seen.push(...page.map(row => row.id));
    cursor = messageCursor(page);
  } while (cursor);
  assert.equal(seen.length, 301);
  assert.equal(new Set(seen).size, 301);
});
test("preview subscriptions prefer followed rooms and keep the listener set bounded", () => {
  const channels = Array.from({ length: 80 }, (_, id) => ({ id: `${id}` } as Channel));
  const selected = previewChannelIds(channels, { "78": "following", "79": "hidden" });
  assert.equal(selected.size, 30);
  assert.ok(selected.has("78"));
  assert.ok(!selected.has("79"));
});
test("saved IDs split into legal unique Firestore in filters", () => {
  const batches = documentIdBatches([...Array.from({ length: 91 }, (_, index) => `${index}`), "0", ""]);
  assert.deepEqual(batches.map(batch => batch.length), [30, 30, 30, 1]);
  assert.equal(new Set(batches.flat()).size, 91);
});
test("demo directory searches professional fields and normalizes diacritics", () => {
  const profile = { name: "Élodie", headline: "Engineer", company: "Loop", location: "São Paulo", skills: ["TypeScript"], interests: ["Mentoring"] } as Profile;
  for (const term of ["elodie", "engineer", "loop", "sao", "typescript", "mentor"]) assert.ok(matchesDirectory(profile, term));
  assert.equal(normalizeDirectoryQuery("𠮷".repeat(50)).length, 64);
  assert.ok(!matchesDirectory(profile, "unmatched"));
  assert.ok(matchesDirectory({ ...profile, headline: `${"Senior ".repeat(20)}Quantum engineer` }, "quantum"));
});
