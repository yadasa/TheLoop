import test from "node:test";
import assert from "node:assert/strict";
import { initialState, type LoopState } from "@theloop/core";
import { restorePreview } from "./index";
import { encodeImageBase64 } from "./media";

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

test("saved preview images preserve only validated local WebP payloads and target scopes", () => {
  const state = initialState(), id = "preview-image";
  const bytes = Uint8Array.from([82, 73, 70, 70, 18, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 76, 5, 0, 0, 0, 47, 0, 0, 0, 0, 0]);
  const entry = { image: { id, mimeType: "image/webp" as const, width: 1, height: 1, size: bytes.length }, dataUrl: `data:image/webp;base64,${encodeImageBase64(bytes)}`, target: { kind: "channel" as const, id: "room" }, ownerId: state.currentUserId, createdAt: "2026-10-26T00:00:00.000Z" };
  assert.equal(restorePreview({ ...state, previewImages: { [id]: entry } }).previewImages?.[id].dataUrl, entry.dataUrl);
  assert.throws(() => restorePreview({ ...state, previewImages: { [id]: { ...entry, dataUrl: "data:text/html;base64,AAAA" } } }), /image/);
  assert.throws(() => restorePreview({ ...state, previewImages: { [id]: { ...entry, target: { kind: "channel", id: "not/a/document" } } } }), /scope/);
  assert.throws(() => restorePreview({ ...state, previewImages: { "different-id": entry } }), /image ID/);
});
