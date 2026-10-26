import test from "node:test";
import assert from "node:assert/strict";
import { initialState, type LoopState } from "@theloop/core";
import { restorePreview } from "./index";

test("saved previews from before Squads restore with empty private collections", () => {
  const legacy = structuredClone(initialState()) as unknown as Record<string, unknown>;
  delete legacy.squads;
  delete legacy.squadInvites;
  delete legacy.squadMessages;
  delete (legacy.preferences as Record<string, unknown>).squadReadAt;
  const restored = restorePreview(legacy as unknown as LoopState);
  assert.deepEqual(restored.squads, []);
  assert.deepEqual(restored.squadInvites, []);
  assert.deepEqual(restored.squadMessages, []);
  assert.deepEqual(restored.preferences.squadReadAt, {});
  assert.equal(restored.posts.length, (legacy.posts as unknown[]).length);
});

test("saved Squad data rejects malformed private memberships, audiences and read markers", () => {
  assert.throws(() => restorePreview({ ...initialState(), squads: [{ id: "bad", name: "Bad", memberIds: "everyone" }] } as unknown as LoopState), /Invalid saved squad/);
  assert.throws(() => restorePreview({ ...initialState(), squadMessages: [{ id: "bad", body: "private", audienceIds: "everyone", createdAt: new Date().toISOString(), reactions: {} }] } as unknown as LoopState), /Invalid saved squad/);
  const state = initialState();
  assert.throws(() => restorePreview({ ...state, preferences: { ...state.preferences, squadReadAt: { crew: 123 } } } as unknown as LoopState), /Invalid saved squad read/);
});
