import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState, type Message } from "@theloop/core";
import { ConversationDrafts } from "../apps/mobile/src/conversationDrafts";

const channel = { kind: "channel" as const, id: "room" };
function fixture() {
  const state = emptyState("me");
  state.channels = [
    {
      id: "room",
      conferenceId: "conference",
      name: "Room",
      description: "",
      icon: "#",
      members: 1,
      topics: ["General"],
      visibility: "private",
      memberIds: ["me"],
    },
  ];
  return state;
}
const reply: Message = {
  id: "message",
  channelId: "room",
  topic: "General",
  authorId: "peer",
  body: "Original",
  createdAt: "2026-10-27T12:00:00Z",
  reactions: {},
};
test("draft text, topic and quote survive navigation copies; clearing never restores sent text", () => {
  const state = fixture(),
    drafts = new ConversationDrafts("me");
  const original = {
    body: "Unfinished",
    topic: "General",
    reply: { ...reply },
  };
  drafts.remember(channel, original, state);
  original.reply.body = "Changed outside";
  assert.equal(drafts.read(channel, state)?.reply?.body, "Original");
  const restored = drafts.read(channel, state)!;
  restored.body = "Changed by caller";
  assert.equal(drafts.read(channel, state)?.body, "Unfinished");
  drafts.remember(channel, { body: "", topic: "General" }, state);
  assert.equal(drafts.read(channel, state), undefined);
});
test("switching accounts or losing private membership removes drafts", () => {
  const state = fixture(),
    drafts = new ConversationDrafts("me");
  drafts.remember(channel, { body: "Private draft" }, state);
  state.channels[0].memberIds = [];
  assert.equal(drafts.read(channel, state), undefined);
  state.channels[0].memberIds = ["me"];
  drafts.remember(channel, { body: "Private draft" }, state);
  state.currentUserId = "other";
  assert.equal(drafts.read(channel, state), undefined);
  state.currentUserId = "me";
  assert.equal(drafts.read(channel, state), undefined);
});
test("blocking drops private drafts and quoted content while preserving your own channel text", () => {
  const state = fixture(),
    drafts = new ConversationDrafts("me");
  const dm = { kind: "dm" as const, id: "peer" };
  drafts.remember(dm, { body: "Private unfinished message" }, state);
  drafts.remember(channel, { body: "My channel draft", reply }, state);
  state.preferences.blockedIds = ["peer"];
  assert.equal(drafts.read(dm, state), undefined);
  assert.equal(drafts.read(channel, state)?.body, "My channel draft");
  assert.equal(drafts.read(channel, state)?.reply, null);
});
test("cross-room quotes are removed and memory retains only the latest bounded conversations", () => {
  const state = fixture(),
    drafts = new ConversationDrafts("me", 2);
  drafts.remember(
    channel,
    { body: "Text", reply: { ...reply, channelId: "another-room" } },
    state,
  );
  assert.equal(drafts.read(channel, state)?.reply, null);
  drafts.remember({ kind: "dm", id: "one" }, { body: "One" }, state);
  drafts.remember({ kind: "dm", id: "two" }, { body: "Two" }, state);
  assert.equal(drafts.read(channel, state), undefined);
  assert.equal(drafts.read({ kind: "dm", id: "two" }, state)?.body, "Two");
  drafts.clear();
  assert.equal(drafts.read({ kind: "dm", id: "two" }, state), undefined);
});

test("topic drafts stay separate and explicit topic navigation never restores another topic's text", () => {
  const state = fixture(),
    drafts = new ConversationDrafts("me");
  drafts.remember(
    channel,
    { body: "General thought", topic: "General" },
    state,
  );
  drafts.remember(channel, { body: "Travel plan", topic: "Travel" }, state);
  assert.equal(
    drafts.read({ ...channel, topic: "General" }, state)?.body,
    "General thought",
  );
  assert.equal(
    drafts.read({ ...channel, topic: "New topic" }, state),
    undefined,
  );
  assert.equal(drafts.read(channel, state)?.topic, "Travel");
  drafts.remember(channel, { body: "", topic: "Travel" }, state);
  assert.equal(drafts.read(channel, state)?.topic, "General");
});

test("draft inbox returns isolated copies, discards only the selected topic, and excludes revoked conversations", () => {
  const state = fixture(),
    drafts = new ConversationDrafts("me");
  drafts.remember(channel, { body: "General draft", topic: "General" }, state);
  drafts.remember(channel, { body: "Travel draft", topic: "Travel" }, state);
  const listing = drafts.list(state);
  assert.deepEqual(
    listing.map((entry) => entry.target.topic),
    ["Travel", "General"],
  );
  listing[0].target.topic = "Changed";
  listing[0].value.body = "Changed";
  assert.equal(
    drafts.read({ ...channel, topic: "Travel" }, state)?.body,
    "Travel draft",
  );
  drafts.remove({ ...channel, topic: "Travel" });
  assert.equal(drafts.list(state).length, 1);
  assert.equal(drafts.list(state)[0].value.body, "General draft");
  state.channels[0].memberIds = [];
  assert.deepEqual(drafts.list(state), []);
});
