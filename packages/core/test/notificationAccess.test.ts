import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  notificationAccessible,
  type Notification,
} from "../src/index";
test("notification previews lose private chat access immediately and respect hidden topics and blocked legacy senders", () => {
  const state = initialState(),
    channel = state.channels[0];
  channel.visibility = "private";
  channel.memberIds = [state.currentUserId];
  const notice: Notification = {
    id: "reply",
    userId: state.currentUserId,
    kind: "message",
    targetId: channel.id,
    topic: channel.topics[0],
    title: "Reply",
    body: "Private",
    createdAt: "2026-10-27T12:00:00Z",
    read: false,
  };
  assert.equal(notificationAccessible(state, notice), true);
  state.preferences.subscriptions[`${channel.id}:${notice.topic}`] = "hidden";
  assert.equal(notificationAccessible(state, notice), false);
  state.preferences.subscriptions[`${channel.id}:${notice.topic}`] = "muted";
  assert.equal(notificationAccessible(state, notice), true);
  channel.memberIds = [];
  assert.equal(notificationAccessible(state, notice), false);
  assert.equal(
    notificationAccessible(state, { ...notice, targetId: "unknown" }),
    false,
  );
  assert.equal(
    notificationAccessible(state, { ...notice, userId: "another" }),
    false,
  );
  state.preferences.blockedIds = ["peer"];
  assert.equal(
    notificationAccessible(state, {
      ...notice,
      id: "legacy_dm",
      targetId: "peer",
    }),
    false,
  );
});
