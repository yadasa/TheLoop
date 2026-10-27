import test from "node:test";
import assert from "node:assert/strict";
import { emptyState } from "@theloop/core";
import { ImageDrafts, type ImageChoice } from "../apps/mobile/src/imageDrafts";

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
      topics: ["General", "Travel"],
      visibility: "private",
      memberIds: ["me"],
    },
  ];
  return state;
}
const general = { kind: "channel" as const, id: "room", topic: "General" };
const travel = { ...general, topic: "Travel" };
const photo = (uri: string, size = 10): ImageChoice => ({
  uri,
  width: 10,
  height: 10,
  bytes: new Uint8Array(size),
});

test("photo drafts are isolated by account, conversation and topic, and survive screen readers", () => {
  const state = fixture(),
    disposed: string[] = [];
  const book = new ImageDrafts("me", (value) => disposed.push(value.uri));
  book.remember(general, photo("general-photo"), state);
  book.remember(travel, photo("travel-photo"), state);
  assert.equal(book.read(general, state)?.uri, "general-photo");
  assert.equal(book.read(travel, state)?.uri, "travel-photo");
  assert.equal(book.read({ kind: "channel", id: "room" }, state), null);
  assert.equal(book.latestTopic("room", state), "Travel");
  book.remove(travel);
  assert.equal(book.latestTopic("room", state), "General");
  assert.deepEqual(disposed, ["travel-photo"]);
  state.currentUserId = "other";
  assert.equal(book.read(general, state), null);
  book.prune(state);
  state.currentUserId = "me";
  assert.equal(book.read(general, state), null);
  assert.deepEqual(disposed, ["travel-photo", "general-photo"]);
});

test("replacement releases only the old app-created photo and capacity failure preserves drafts", () => {
  const state = fixture(),
    disposed: string[] = [];
  const book = new ImageDrafts(
    "me",
    (value) => disposed.push(value.uri),
    1,
    20,
  );
  book.remember(general, photo("first"), state);
  book.remember(general, photo("replacement", 20), state);
  assert.deepEqual(disposed, ["first"]);
  assert.throws(
    () => book.remember(general, photo("too-big", 21), state),
    /photos waiting/,
  );
  assert.throws(
    () => book.remember(travel, photo("other"), state),
    /photos waiting/,
  );
  assert.equal(book.read(general, state)?.uri, "replacement");
  book.clear();
  book.clear();
  assert.deepEqual(disposed, ["first", "replacement"]);
});

test("membership loss and blocked DM prune files, and do not accept a late selection", () => {
  const state = fixture(),
    disposed: string[] = [];
  const book = new ImageDrafts("me", (value) => disposed.push(value.uri));
  const dm = { kind: "dm" as const, id: "peer" };
  book.remember(general, photo("private-room"), state);
  book.remember(dm, photo("private-dm"), state);
  state.channels[0].memberIds = [];
  state.preferences.blockedIds = ["peer"];
  assert.equal(book.read(general, state), null);
  assert.equal(book.read(dm, state), null);
  book.prune(state);
  assert.throws(
    () => book.remember(general, photo("late"), state),
    /no longer available/,
  );
  assert.throws(
    () => book.remember(dm, photo("late-dm"), state),
    /no longer available/,
  );
  assert.deepEqual(disposed.sort(), ["private-dm", "private-room"]);
});
