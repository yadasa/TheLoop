import test from "node:test";
import assert from "node:assert/strict";
import { directConversationId, directParticipantSnapshot, isDirectConversation, mergeDirectMessages, type DirectSnapshot } from "./directData";

const message = (id: string, fromId = "alice", toId = "bob"): DirectSnapshot => ({ id, fromId, toId, createdAt: "2026-10-26T00:00:00.000Z", body: id, read: false, participantIds: [fromId, toId] });
test("direct pair IDs match server canonical ordering in either direction", () => {
  assert.equal(directConversationId("bob", "alice"), "alice~bob");
  assert.equal(directConversationId("alice", "bob"), "alice~bob");
  for (const [a, b] of [["alice", "alice"], ["", "bob"], ["alice", "not/a/member"]]) assert.throws(() => directConversationId(a, b));
});
test("direct history merges previews without duplicates and removes blocked or other-account records", () => {
  const old = message("old"), edited = { ...old, body: "edited" };
  const other = message("other", "carol", "dave"), forged = { ...message("forged"), participantIds: ["carol", "dave"] };
  assert.deepEqual(mergeDirectMessages([[old, other, forged], [edited]], "alice", new Set()), [edited]);
  assert.deepEqual(mergeDirectMessages([[old]], "alice", new Set(["bob"])), []);
  assert.deepEqual(mergeDirectMessages([[old]], "carol", new Set()), []);
  assert.ok(isDirectConversation(old, "bob", "alice"));
  assert.ok(!isDirectConversation(old, "alice", "carol"));
});
test("direct identity snapshots cover sent-only conversations without granting professional profile access", () => {
  const ownSent = { ...message("sent"), fromName: "Alice", fromInitials: "AL", toName: "Bob", toInitials: "BO", company: "Never expose professional fields" };
  assert.deepEqual(directParticipantSnapshot([ownSent], "alice", "bob"), { id: "bob", name: "Bob", initials: "BO" });
  assert.deepEqual(directParticipantSnapshot([{ ...message("received", "bob", "alice"), fromName: "Bob", fromInitials: "BO" }], "alice", "bob"), { id: "bob", name: "Bob", initials: "BO" });
  assert.equal(directParticipantSnapshot([message("legacy")], "alice", "bob"), undefined);
  assert.equal(directParticipantSnapshot([ownSent], "alice", "carol"), undefined);
  assert.equal(directParticipantSnapshot([{ ...ownSent, participantIds: ["other", "bob"] }], "alice", "bob"), undefined);
});
