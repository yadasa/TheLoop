import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, type Message } from "@theloop/core";
import {
  HistorySearch,
  canSearchChannel,
  emptyHistorySearch,
  filterHistoryResults,
  matchesMessageSearch,
  normalizeMessageSearch,
  validMessageSearch,
  type HistorySearchPage,
} from "./historySearch";
const message = (id: string, body = "Coffee meetup"): Message => ({
  id,
  channelId: "room",
  topic: "Plans",
  authorId: "member",
  body,
  reactions: {},
  createdAt: "2026-10-27T10:00:00.000Z",
});
const page = (
  id: string,
  matches: Message[] = [],
  hasMore = true,
): HistorySearchPage => ({
  matches,
  scanned: 100,
  cursor: { id, createdAt: "2026-10-27T10:00:00.000Z" },
  hasMore,
});
test("search normalizes accents, whitespace and Unicode without accepting empty queries", () => {
  assert.equal(normalizeMessageSearch(" CAFÉ\n chat "), "cafe chat");
  assert.ok(
    matchesMessageSearch(message("a", "Café  meetup tonight"), "CAFE meetup"),
  );
  for (const value of ["", " ", "a", "x".repeat(101)])
    assert.equal(validMessageSearch(value), false);
  assert.equal(matchesMessageSearch(message("a"), ""), false);
});
test("search reaches earlier pages, is bounded per action, and deduplicates", async () => {
  let calls = 0,
    state = emptyHistorySearch();
  const search = new HistorySearch({
    readPage: async () => {
      calls++;
      return page(
        String(calls),
        calls === 4 ? [message("found"), message("found")] : [],
        calls < 4,
      );
    },
    publish: (next) => (state = next),
    errorText: String,
  });
  await search.start({ channelId: "room", query: "coffee" });
  assert.equal(calls, 3);
  assert.equal(state.scanned, 300);
  assert.equal(state.hasMore, true);
  assert.deepEqual(state.matches, []);
  await search.more();
  assert.equal(calls, 4);
  assert.equal(state.matches.length, 1);
  assert.equal(state.hasMore, false);
  assert.equal(state.loading, false);
});
test("query changes discard in-flight results and never start their next page", async () => {
  let resolve!: (value: HistorySearchPage) => void;
  let state = emptyHistorySearch(),
    calls = 0;
  const search = new HistorySearch({
    readPage: async () => {
      calls++;
      return new Promise((r) => (resolve = r));
    },
    publish: (next) => (state = next),
    errorText: String,
  });
  const pending = search.start({ channelId: "room", query: "coffee" });
  search.reset();
  resolve(page("old", [message("private-result")]));
  await pending;
  assert.equal(calls, 1);
  assert.deepEqual(state, emptyHistorySearch());
});
test("concurrent requests collapse and failure retries from the last successful cursor", async () => {
  let state = emptyHistorySearch(),
    calls = 0;
  const cursors: (string | undefined)[] = [];
  const search = new HistorySearch({
    readPage: async (request) => {
      calls++;
      cursors.push(request.cursor?.id);
      if (calls === 2) throw new Error("offline");
      return page(String(calls), [], calls < 3);
    },
    publish: (next) => (state = next),
    errorText: String,
  });
  const first = search.start({ channelId: "room", query: "coffee" });
  await search.more();
  await first;
  assert.equal(calls, 2);
  assert.equal(state.scanned, 100);
  assert.match(state.error!, /offline/);
  await search.more();
  assert.deepEqual(cursors, [undefined, "1", "1"]);
  assert.equal(state.error, null);
  assert.equal(state.hasMore, false);
});
test("a repeated pagination cursor fails visibly instead of looping", async () => {
  let state = emptyHistorySearch(),
    calls = 0;
  const search = new HistorySearch({
    readPage: async () => {
      calls++;
      return page("same");
    },
    publish: (next) => (state = next),
    errorText: String,
  });
  await search.start({ channelId: "room", query: "coffee" });
  assert.equal(calls, 2);
  assert.match(state.error!, /advance/);
  assert.equal(state.loading, false);
});
test("history filtering respects private membership, blocks, hidden topics and explicit topic selection", () => {
  const state = initialState();
  const room = state.channels[0];
  const visible = message("v");
  visible.channelId = room.id;
  const blocked = { ...visible, id: "blocked", authorId: "blocked" };
  const hidden = { ...visible, id: "hidden", topic: "Hidden" };
  state.preferences.blockedIds = ["blocked"];
  state.preferences.subscriptions[`${room.id}:Hidden`] = "hidden";
  const request = { channelId: room.id, query: "coffee" };
  const rows = [
    visible,
    blocked,
    hidden,
    { ...visible, id: "other-room", channelId: "private" },
  ];
  assert.deepEqual(
    filterHistoryResults(rows, request, state).map((row) => row.id),
    ["v"],
  );
  assert.deepEqual(
    filterHistoryResults(rows, { ...request, topic: "Hidden" }, state).map(
      (row) => row.id,
    ),
    ["hidden"],
  );
  room.visibility = "private";
  room.memberIds = ["someone-else"];
  assert.equal(canSearchChannel(state, room.id), false);
  assert.deepEqual(filterHistoryResults(rows, request, state), []);
  room.memberIds = [state.currentUserId];
  assert.equal(canSearchChannel(state, room.id), true);
  state.currentUserId = "";
  assert.equal(canSearchChannel(state, room.id), false);
});
test("pausing keeps completed results but ignores a late page", async () => {
  let state = emptyHistorySearch(),
    resolve!: (page: HistorySearchPage) => void;
  let calls = 0;
  const search = new HistorySearch({
    readPage: async () =>
      ++calls === 1
        ? page("first", [message("keep")])
        : new Promise((r) => (resolve = r)),
    publish: (next) => (state = next),
    errorText: String,
  });
  const pending = search.start({ channelId: "room", query: "coffee" });
  await Promise.resolve();
  await Promise.resolve();
  search.pause();
  resolve(page("late", [message("discard")]));
  await pending;
  assert.deepEqual(
    state.matches.map((message) => message.id),
    ["keep"],
  );
  assert.equal(state.loading, false);
  assert.equal(state.hasMore, true);
});
