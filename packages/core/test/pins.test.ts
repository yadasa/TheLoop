import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, initialState, canManagePins, pinnedIds, visiblePinnedMessages } from "../src/index";

test("sample pins enforce moderator authority, deduplicate and follow deletion", () => {
  const state = initialState(), channel = state.channels.find(value => value.id === "the-lobby")!;
  const message = state.messages.find(value => value.channelId === channel.id)!;
  const command = { type: "message.pin" as const, channelId: channel.id, messageId: message.id, pinned: true };
  const context = { id: "pin", now: "2026-10-27T12:00:00Z" };
  let next = applyCommand(state, command, context);
  next = applyCommand(next, command, context);
  assert.deepEqual(pinnedIds(next.channels.find(value => value.id === channel.id)!), [message.id]);
  next.currentUserId = message.authorId;
  next = applyCommand(next, { type: "message.delete", messageId: message.id }, context);
  assert.deepEqual(pinnedIds(next.channels.find(value => value.id === channel.id)!), []);
  state.currentUserId = "outsider";
  assert.throws(() => applyCommand(state, command, context), /moderator/);
});
test("pins preserve order while excluding hidden topics, blocked authors and foreign messages", () => {
  const state = initialState(), channel = state.channels.find(value => value.id === "the-lobby")!;
  const rows = state.messages.filter(value => value.channelId === channel.id);
  channel.pinnedMessageIds = rows.map(value => value.id).reverse();
  assert.deepEqual(visiblePinnedMessages(state, channel, rows).map(value => value.id), channel.pinnedMessageIds);
  state.preferences.blockedIds = [rows[0].authorId];
  state.preferences.subscriptions[`${channel.id}:${rows[1].topic}`] = "hidden";
  assert.ok(visiblePinnedMessages(state, channel, rows).every(value => value.authorId !== rows[0].authorId && value.topic !== rows[1].topic));
  channel.visibility = "private";
  channel.memberIds = [];
  assert.deepEqual(visiblePinnedMessages(state, channel, rows), []);
  assert.equal(canManagePins(state, channel, "admin"), false);
});
