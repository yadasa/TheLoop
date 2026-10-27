import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "@theloop/core";
import { searchDestinations } from "../apps/mobile/src/searchDestinations";

test("search finds conferences, chat names and matching topics with case/accent normalization", () => {
  const state = initialState();
  const room = state.channels[0];
  room.name = "Café circle";
  room.topics = ["Introductions", "Travel plans"];
  const byName = searchDestinations(state, " CAFE ");
  assert.equal(byName.chats[0].channel.id, room.id);
  assert.deepEqual(searchDestinations(state, "travel plans").chats[0].topics, [
    "Travel plans",
  ]);
  assert.ok(searchDestinations(state, "afrotech").conferences.length);
});

test("search excludes hidden topics, hidden chats and private chats after membership is revoked", () => {
  const state = initialState();
  const room = state.channels[0];
  room.name = "Unique room";
  room.topics = ["Unique topic"];
  state.preferences.subscriptions[`${room.id}:Unique topic`] = "hidden";
  assert.equal(searchDestinations(state, "Unique topic").chats.length, 0);
  assert.equal(searchDestinations(state, "Unique room").chats.length, 1);
  state.preferences.subscriptions[room.id] = "hidden";
  assert.equal(searchDestinations(state, "Unique room").chats.length, 0);
  state.preferences.subscriptions[room.id] = "following";
  room.visibility = "private";
  room.memberIds = [state.currentUserId];
  assert.equal(searchDestinations(state, "Unique room").chats.length, 1);
  room.memberIds = [];
  assert.equal(searchDestinations(state, "Unique room").chats.length, 0);
});

test("hidden conferences/communities and signed-out catalogs stay out of destination results", () => {
  const state = initialState();
  state.preferences.subscriptions[state.conferences[0].id] = "hidden";
  assert.equal(
    searchDestinations(state, state.conferences[0].name).conferences.length,
    0,
  );
  const community = state.communities[0];
  community.name = "Unique community";
  assert.equal(
    searchDestinations(state, "Unique community").communities.length,
    1,
  );
  state.preferences.subscriptions[community.id] = "hidden";
  assert.equal(
    searchDestinations(state, "Unique community").communities.length,
    0,
  );
  state.currentUserId = "";
  assert.deepEqual(searchDestinations(state, "a"), {
    conferences: [],
    chats: [],
    communities: [],
  });
});
