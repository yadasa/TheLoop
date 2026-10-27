import test from "node:test";
import assert from "node:assert/strict";
import { initialState, type Notification } from "@theloop/core";
import {
  filterNotifications,
  notificationDay,
  notificationDestination,
  visibleNotifications,
} from "../apps/mobile/src/notificationPresentation";

const notice = (change: Partial<Notification> = {}): Notification => ({
  id: "update",
  userId: "me",
  title: "An update",
  body: "Details",
  kind: "message",
  targetId: "the-lobby",
  read: false,
  createdAt: "2026-10-27T12:00:00Z",
  ...change,
});

test("notification inbox filters account, blocks and categories without mutating source rows", () => {
  const state = initialState();
  state.preferences.blockedIds = ["nia"];
  state.notifications = [
    notice(),
    notice({
      id: "older",
      kind: "event",
      read: true,
      createdAt: "2026-10-26T12:00:00Z",
    }),
    notice({ id: "private", userId: "someone-else" }),
    notice({ id: "blocked", actorId: "nia" }),
    notice({ id: "legacy_dm", targetId: "nia" }),
    notice({ id: "legacy_connection", kind: "connection", targetId: "nia" }),
    notice({ id: "squad", kind: "squad" }),
  ];
  const visible = visibleNotifications(state);
  assert.deepEqual(
    visible.map((n) => n.id),
    ["update", "squad", "older"],
  );
  assert.equal(filterNotifications(visible, "unread").length, 2);
  assert.equal(filterNotifications(visible, "message").length, 2);
  assert.deepEqual(
    filterNotifications(visible, "event").map((n) => n.id),
    ["older"],
  );
  assert.equal(state.notifications.length, 7);
  assert.equal(state.notifications[0].id, "update");
});

test("reply notifications open the topic and missing group chats never become DMs", () => {
  const state = initialState();
  const channel = state.channels[0];
  const n = notice({ targetId: channel.id, topic: channel.topics[0] });
  assert.deepEqual(notificationDestination(state, n).route, {
    kind: "channel",
    id: channel.id,
    topic: channel.topics[0],
  });
  assert.deepEqual(
    notificationDestination(state, { ...n, topic: "Removed topic" }).route,
    { kind: "channel", id: channel.id },
  );
  channel.visibility = "private";
  channel.memberIds = [];
  assert.equal(notificationDestination(state, n).tab, "Chat");
  assert.equal(
    notificationDestination(state, notice({ targetId: "deleted-chat" })).tab,
    "Chat",
  );
  assert.deepEqual(
    notificationDestination(
      state,
      notice({ id: "request_dm", targetId: "nia" }),
    ).route,
    { kind: "dm", id: "nia" },
  );
  state.preferences.blockedIds = ["nia"];
  assert.equal(
    notificationDestination(
      state,
      notice({ dmSenderId: "nia", targetId: "nia" }),
    ).route,
    undefined,
  );
});

test("older post notifications can open outside the feed window while digests open Home", () => {
  const state = initialState();
  assert.deepEqual(
    notificationDestination(
      state,
      notice({ kind: "community", targetId: "older-post" }),
    ).route,
    { kind: "post", id: "older-post" },
  );
  assert.equal(
    notificationDestination(
      state,
      notice({ kind: "community", targetId: "feed" }),
    ).tab,
    "Home",
  );
  assert.deepEqual(
    notificationDestination(state, notice({ kind: "squad", targetId: "gone" }))
      .route,
    { kind: "squads" },
  );
});

test("notification dates group by local calendar days rather than elapsed hours", () => {
  const now = new Date(2026, 9, 27, 0, 15);
  assert.equal(
    notificationDay(new Date(2026, 9, 27, 0, 1).toISOString(), now),
    "Today",
  );
  assert.equal(
    notificationDay(new Date(2026, 9, 26, 23, 55).toISOString(), now),
    "Yesterday",
  );
  assert.notEqual(
    notificationDay(new Date(2026, 9, 25, 23, 55).toISOString(), now),
    "Yesterday",
  );
  assert.equal(notificationDay("invalid", now), "Earlier");
});
