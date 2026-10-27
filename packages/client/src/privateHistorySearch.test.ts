import test from "node:test";
import assert from "node:assert/strict";
import { initialState, type DirectMessage, type SquadMessage } from "@theloop/core";
import { canSearchPrivate, privateHistoryHits, type PrivateHistoryRequest, type PrivateSearchHit } from "./privateHistorySearch";
import { emptyHistorySearch, HistorySearch, type HistorySearchPage } from "./historySearch";

const dm: DirectMessage = { id: "dm", fromId: "peer", toId: "me", body: "Café plans", createdAt: "2026-10-27T12:00:00.000Z", read: false, fromName: "Peer name" };
test("private search binds DMs to both participants and drops blocked peers", () => {
  const state = initialState();
  const request: PrivateHistoryRequest = { kind: "dm", id: "peer", query: "cafe" };
  const rows = [dm, { ...dm, id: "sent", fromId: "me", toId: "peer" }, { ...dm, id: "foreign", toId: "other" }, { ...dm, id: "inconsistent", participantIds: ["peer", "other"] }];
  assert.deepEqual(privateHistoryHits(rows, request, state).map(row => row.id), ["dm", "sent"]);
  assert.equal(privateHistoryHits(rows, request, state)[0].authorName, "Peer name");
  state.preferences.blockedIds = ["peer"];
  assert.equal(canSearchPrivate(state, request), false);
  assert.deepEqual(privateHistoryHits(rows, request, state), []);
  state.preferences.blockedIds = [];
  state.currentUserId = "other";
  assert.deepEqual(privateHistoryHits([dm], request, state), []);
});

test("Squad search requires current membership plus the historical audience", () => {
  const state = initialState();
  state.squads = [{ id: "crew", name: "Crew", description: "", ownerId: "me", memberIds: ["me", "peer"], memberProfiles: {}, pendingInviteeIds: [], createdAt: dm.createdAt, updatedAt: dm.createdAt, archived: false }];
  const message: SquadMessage = { id: "sq", squadId: "crew", authorId: "peer", authorName: "Peer", authorInitials: "P", audienceIds: ["me", "peer"], body: dm.body, createdAt: dm.createdAt, reactions: {} };
  const request: PrivateHistoryRequest = { kind: "squad", id: "crew", query: "cafe" };
  const rows = [message, { ...message, id: "before-join", audienceIds: ["peer"] }, { ...message, id: "other-squad", squadId: "elsewhere" }, { ...message, id: "blocked", authorId: "blocked" }];
  state.preferences.blockedIds = ["blocked"];
  assert.deepEqual(privateHistoryHits(rows, request, state).map(row => row.id), ["sq"]);
  state.squads[0].memberIds = ["peer"];
  assert.deepEqual(privateHistoryHits(rows, request, state), []);
  state.squads[0].memberIds.push("me");
  state.squads[0].archived = true;
  assert.deepEqual(privateHistoryHits(rows, request, state), []);
});

test("private requests keep their target through pagination and discard results after reset", async () => {
  let state = emptyHistorySearch<PrivateSearchHit>();
  let resolve!: (value: HistorySearchPage<PrivateSearchHit>) => void;
  const requests: PrivateHistoryRequest[] = [];
  const search = new HistorySearch<PrivateHistoryRequest, PrivateSearchHit>({
    readPage: async request => { requests.push(request); return new Promise<HistorySearchPage<PrivateSearchHit>>(done => { resolve = done; }); },
    publish: next => { state = next; }, errorText: String,
  });
  const pending = search.start({ kind: "squad", id: "crew", query: "CAFE" });
  search.reset();
  resolve({ matches: [{ id: "secret", body: "cafe", createdAt: dm.createdAt, authorId: "peer" }], hasMore: false, scanned: 1 });
  await pending;
  assert.deepEqual(requests, [{ kind: "squad", id: "crew", query: "cafe", cursor: undefined }]);
  assert.deepEqual(state, emptyHistorySearch<PrivateSearchHit>());
});
