import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, type DirectConversation, type DirectMessage, type Profile } from "@theloop/core";
import { deriveDirectCatalog, mergeDirectWatermark, newerDirectCatalogProgress, normalizeDirectConversation, normalizeDirectRead, parseDirectCatalogProgress, parseDirectConversation } from "./directCatalog";

const conversation = (): DirectConversation => ({ id: "alice~bob", participantIds: ["alice", "bob"], memberNames: { alice: "Alice", bob: "Bob" }, memberInitials: { alice: "AL", bob: "BO" }, createdAt: "2020-01-01T00:00:00.000Z", lastAt: "2026-10-26T00:00:00.000Z", sequence: 1205, readThrough: { alice: 1205 }, readAt: { alice: "2026-10-26T00:00:00.000Z" }, unreadCounts: { alice: 0 } });
const message = (overrides: Partial<DirectMessage> = {}): DirectMessage => ({ id: "message", fromId: "bob", toId: "alice", body: "Hello", createdAt: "2026-10-25T00:00:00.000Z", read: false, ...overrides });
test("catalog progress remains provisional until a valid explicit completion", () => {
  assert.equal(parseDirectCatalogProgress(undefined), null);
  assert.equal(parseDirectCatalogProgress({ complete: true, processed: 50, cursor: "more", updatedAt: new Date().toISOString() }), null);
  assert.equal(parseDirectCatalogProgress({ complete: true, processed: -1, cursor: null, updatedAt: new Date().toISOString() }), null);
  const partial = { complete: false, processed: 50, cursor: "message-50", updatedAt: "2026-10-26T00:00:00.000Z" };
  assert.deepEqual(parseDirectCatalogProgress(partial), partial);
  const complete = { ...partial, complete: true, processed: 75, cursor: null };
  assert.deepEqual(newerDirectCatalogProgress(complete, partial), complete);
  assert.deepEqual(newerDirectCatalogProgress(complete, null), complete);
  assert.deepEqual(newerDirectCatalogProgress(partial, complete), complete);
});
test("catalog parsing requires own canonical pair and exposes only minimal participant fields", () => {
  const source = { ...conversation(), company: "Secret professional data", memberNames: { ...conversation().memberNames, outsider: "Do not include" } };
  const result = parseDirectConversation(source, "alice~bob", "alice")!;
  assert.equal(result.memberNames.outsider, undefined);
  assert.ok(!("company" in result));
  assert.equal(parseDirectConversation(source, "other-pair", "alice"), undefined);
  assert.equal(parseDirectConversation(source, "alice~bob", "outsider"), undefined);
});
test("a deleted latest-message summary stays empty instead of falling back to stale raw previews", () => {
  const result = parseDirectConversation(conversation(), "alice~bob", "alice")!;
  assert.equal(result.lastMessage, undefined);
});
test("read watermarks normalize1205+ messages with legacy cutoff and preserve raw source flags", () => {
  const summary = conversation(), messages = [message({ sequence: 1205 }), message({ id: "future-sequence", sequence: 1206 }), message({ id: "legacy" }), message({ id: "new-legacy", createdAt: "2026-10-27T00:00:00.000Z" })];
  const rows = normalizeDirectRead(messages, new Map([[summary.id, summary]]));
  assert.deepEqual(rows.map(row => row.read), [true, false, true, false]);
  assert.ok(messages.every(row => row.read === false));
});

test("older page callbacks cannot lower a selected conversation's read watermark", () => {
  const newer = conversation(), older = { ...conversation(), readThrough: { alice: 200 }, readAt: { alice: "2020-01-01T00:00:00.000Z" } };
  const watermark = mergeDirectWatermark(older, newer);
  assert.equal(watermark.readThrough.alice, 1205);
  assert.equal(watermark.readAt.alice, newer.readAt.alice);
  assert.ok(normalizeDirectRead([message({ sequence: 1205 }), message()], new Map([[newer.id, watermark]])).every(row => row.read));
  assert.equal(older.readThrough.alice, 200);
  const staleSummary = { ...older, unreadCounts: { alice: 1005 } };
  const visible = normalizeDirectConversation(staleSummary, watermark);
  assert.equal(visible.unreadCounts.alice, 0);
  assert.equal(visible.readThrough.alice, 1205);
  assert.equal(staleSummary.unreadCounts.alice, 1005);
});
test("demo catalog derives private participants without granting professional profile access", () => {
  const state = emptyState("alice");
  state.profiles = [{ id: "bob", name: "Private name", initials: "PN", visibility: "connections", company: "Secret" } as Profile];
  state.directMessages = [message()];
  let rows = deriveDirectCatalog(state);
  assert.equal(rows[0].memberNames.bob, "Loop member");
  state.directMessages[0].fromName = "Previously shared name";
  rows = deriveDirectCatalog(state);
  assert.equal(rows[0].memberNames.bob, "Previously shared name");
  assert.equal(rows[0].unreadCounts.alice, 1);
  assert.ok(!("company" in rows[0]));
  state.preferences.blockedIds = ["bob"];
  assert.deepEqual(deriveDirectCatalog(state), []);
});
