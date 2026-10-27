import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCommand,
  initialState,
  savedMessages,
  visibleSavedMessage,
} from "../src/index";
const ctx = { id: "save", now: "2026-10-27T12:00:00Z" };
test("saving a message is private, idempotent and removable after its source disappears", () => {
  const state = initialState(),
    message = state.messages[0];
  const next = applyCommand(
    state,
    { type: "message.save", messageId: message.id, saved: true },
    ctx,
  );
  assert.deepEqual(savedMessages(next), [
    { messageId: message.id, channelId: message.channelId, savedAt: ctx.now },
  ]);
  assert.deepEqual(next.messages, state.messages);
  const duplicate = applyCommand(
    next,
    { type: "message.save", messageId: message.id, saved: true },
    ctx,
  );
  assert.equal(savedMessages(duplicate).length, 1);
  duplicate.messages = [];
  assert.equal(
    savedMessages(
      applyCommand(
        duplicate,
        { type: "message.save", messageId: message.id, saved: false },
        ctx,
      ),
    ).length,
    0,
  );
});
test("saved message visibility follows access, blocks and hidden topics without overriding mutes", () => {
  const state = initialState(),
    message = state.messages[0],
    channel = state.channels.find((c) => c.id === message.channelId)!;
  state.preferences.subscriptions[channel.id] = "muted";
  assert.equal(visibleSavedMessage(state, channel, message), true);
  state.preferences.subscriptions[`${channel.id}:${message.topic}`] = "hidden";
  assert.equal(visibleSavedMessage(state, channel, message), false);
  assert.throws(
    () =>
      applyCommand(
        state,
        { type: "message.save", messageId: message.id, saved: true },
        ctx,
      ),
    /unavailable/,
  );
  delete state.preferences.subscriptions[`${channel.id}:${message.topic}`];
  channel.visibility = "private";
  channel.memberIds = [];
  assert.equal(visibleSavedMessage(state, channel, message), false);
});
