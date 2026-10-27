import test from "node:test";
import assert from "node:assert/strict";
import { initialState, type DirectConversation } from "@theloop/core";
import { inboxRows } from "../apps/mobile/src/directInboxPresentation";
const conversation = (
  id: string,
  peer: string,
  unread: number,
): DirectConversation => ({
  id,
  participantIds: ["me", peer],
  memberNames: { [peer]: "Renée" },
  memberInitials: {},
  createdAt: "2026-10-26T12:00:00Z",
  lastAt: "2026-10-27T12:00:00Z",
  sequence: 1,
  readThrough: {},
  readAt: {},
  unreadCounts: { me: unread },
});
test("inbox filters keep muted unread conversations while excluding blocked and other-account rows", () => {
  const state = initialState();
  state.preferences.dmMutedIds = ["peer"];
  state.preferences.blockedIds = ["blocked"];
  const rows = [
    conversation("a", "peer", 3),
    conversation("b", "read", 0),
    conversation("c", "blocked", 1),
    {
      ...conversation("d", "stranger", 3),
      participantIds: ["someone", "stranger"],
    },
  ];
  assert.deepEqual(
    inboxRows(rows, state, "all").map((row) => row.conversation.id),
    ["a", "b"],
  );
  assert.deepEqual(
    inboxRows(rows, state, "unread").map((row) => row.conversation.id),
    ["a"],
  );
  assert.deepEqual(
    inboxRows(rows, state, "muted").map((row) => row.conversation.id),
    ["a"],
  );
  assert.equal(inboxRows(rows, state, "muted", "Renee").length, 1);
  assert.equal(inboxRows(rows, state, "muted", "no match").length, 0);
  assert.equal(
    inboxRows(rows, { ...state, currentUserId: "" }, "all").length,
    0,
  );
  assert.equal(rows[0].unreadCounts.me, 3);
});
