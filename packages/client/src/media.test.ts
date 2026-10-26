import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyState } from "@theloop/core";
import { decodeImageBase64, encodeImageBase64, imageData, imageMetadata, imageUploadBytes, ImageMemoryCache, MediaScopeChanged, mediaAuthority, mediaScope, previewImageData, stripWebPMetadata, webPDimensions } from "./media";

function webp(width = 1, height = 1) {
  const bytes = new Uint8Array(26), view = new DataView(bytes.buffer);
  bytes.set([82, 73, 70, 70], 0); view.setUint32(4, 18, true); bytes.set([87, 69, 66, 80, 86, 80, 56, 76], 8); view.setUint32(16, 5, true); bytes[20] = 0x2f;
  view.setUint32(21, (width - 1) | ((height - 1) << 14), true);
  return bytes;
}
const payload = (id = "image-a") => { const bytes = webp(); return { image: { id, mimeType: "image/webp" as const, width: 1, height: 1, size: bytes.length }, base64: encodeImageBase64(bytes) }; };

test("image base64 round trips without native Buffer/atob/btoa globals and rejects malformed padding", () => {
  for (const size of [1, 2, 3, 4, 256, 16385]) {
    const bytes = Uint8Array.from({ length: size }, (_, index) => index % 256);
    assert.deepEqual(decodeImageBase64(encodeImageBase64(bytes)), bytes);
  }
  for (const value of ["", "a", "Zm=8", "Zh==", "Zm9=", "data:image/webp;base64,AAAA", "AAAA\n"]) assert.throws(() => decodeImageBase64(value));
  assert.throws(() => decodeImageBase64("AAAA", 2));
});

test("processed image validation checks RIFF boundaries, pixel dimensions and declared metadata", () => {
  assert.deepEqual(webPDimensions(webp(2048, 2048), true), { width: 2048, height: 2048 });
  assert.throws(() => webPDimensions(webp(2049, 1)), /dimensions/);
  const broken = webp(); broken[4] = 0;
  assert.throws(() => webPDimensions(broken), /WebP/);
  const data = payload();
  assert.equal(imageData(data, "image-a").dataUrl, `data:image/webp;base64,${data.base64}`);
  assert.throws(() => imageData({ ...data, image: { ...data.image, width: 2 } }, "image-a"), /dimensions/);
  assert.throws(() => imageMetadata({ ...data.image, id: "other" }, "image-a"), /metadata/);
  assert.throws(() => imageMetadata({ ...data.image, mimeType: "image/svg+xml" }), /metadata/);
});

test("demo uploads require static sanitized WebP bytes matching provided dimensions", async () => {
  await imageUploadBytes({ data: webp(), contentType: "image/webp", width: 1, height: 1 }, true);
  await assert.rejects(imageUploadBytes({ data: webp(), contentType: "image/webp", width: 10, height: 1 }, true), /dimensions/);
  await assert.rejects(imageUploadBytes({ data: webp(), contentType: "image/png" }, true), /type/);
  const metadata = new Uint8Array(36); metadata.set(webp()); new DataView(metadata.buffer).setUint32(4, 28, true); metadata.set([69, 88, 73, 70, 2, 0, 0, 0], 26);
  assert.throws(() => webPDimensions(metadata, true), /metadata/);
  assert.deepEqual(stripWebPMetadata(metadata), webp());
  assert.deepEqual(await imageUploadBytes({ data: metadata, contentType: "image/webp", width: 1, height: 1 }, true), webp());
  const animation = new Uint8Array(44); animation.set(webp()); new DataView(animation.buffer).setUint32(4, 36, true); animation.set([86, 80, 56, 88, 10, 0, 0, 0, 2], 26);
  assert.throws(() => webPDimensions(animation, true), /Animated/);
  await assert.rejects(imageUploadBytes({ data: new Uint8Array(5 * 1024 * 1024 + 1), contentType: "image/png" }), /5 MB/);
});

test("actual Chrome Canvas WebP preserves pixels while removing ICC metadata before demo storage", async () => {
  const original = readFileSync(new URL("./fixtures/chrome-canvas.webp", import.meta.url));
  const dimensions = webPDimensions(original);
  assert.deepEqual(dimensions, { width: 1265, height: 712 });
  assert.throws(() => webPDimensions(original, true), /metadata/);
  const before = Uint8Array.from(original);
  const canonical = stripWebPMetadata(original);
  assert.deepEqual(Uint8Array.from(original), before);
  assert.equal(canonical.length, 42816);
  assert.deepEqual(webPDimensions(canonical, true), dimensions);
  const pixels = (bytes: Uint8Array) => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), chunks: Uint8Array[] = [];
    for (let offset = 12; offset < bytes.length;) {
      const size = view.getUint32(offset + 4, true), kind = String.fromCharCode(...bytes.subarray(offset, offset + 4));
      if (["VP8 ", "VP8L", "ALPH"].includes(kind)) chunks.push(Uint8Array.from(bytes.subarray(offset, offset + 8 + size)));
      offset += 8 + size + size % 2;
    }
    return chunks;
  };
  assert.deepEqual(pixels(canonical), pixels(original));
  assert.deepEqual(await imageUploadBytes({ data: original, contentType: "image/webp", ...dimensions }, true), canonical);
});

test("saved preview image data cannot substitute HTML URLs or mismatched images", () => {
  const data = payload();
  assert.equal(previewImageData({ image: data.image, dataUrl: `data:image/webp;base64,${data.base64}` }).image.id, "image-a");
  assert.throws(() => previewImageData({ image: data.image, dataUrl: "https://public.example/file" }));
  assert.throws(() => previewImageData({ image: data.image, dataUrl: "data:text/html;base64,AAAA" }));
});

test("auth and permission scope changes purge images and reject late private responses", async () => {
  const cache = new ImageMemoryCache(); cache.setContext("account-a-private-room");
  let finish: (value: unknown) => void = () => {};
  const old = cache.get("image-a", undefined, () => new Promise(resolve => { finish = resolve; }));
  cache.setContext("account-b-other-room"); finish(payload());
  await assert.rejects(old, MediaScopeChanged);
  let reads = 0;
  await cache.get("image-a", undefined, async () => { reads++; return payload(); });
  await cache.get("image-a", undefined, async () => { reads++; return payload(); });
  assert.equal(reads, 1);
  cache.clear();
  await cache.get("image-a", undefined, async () => { reads++; return payload(); });
  assert.equal(reads, 2);
});

test("report images never reuse completed bytes and memory cache obeys byte budget", async () => {
  const cache = new ImageMemoryCache(60); cache.setContext("moderator");
  let reads = 0;
  for (let index = 0; index < 2; index++) await cache.get("image-a", "report-a", async () => { reads++; return payload(); });
  assert.equal(reads, 2);
  for (const id of ["image-a", "image-b", "image-c"]) await cache.get(id, undefined, async () => payload(id));
  await cache.get("image-a", undefined, async () => { reads++; return payload(); });
  assert.equal(reads, 3);
});

test("media context changes for membership, blocks and deleted sources, not ordinary text edits", () => {
  const state = emptyState("alice"), options = { mode: "live", role: "member", conversation: "room", squad: null };
  state.messages = [{ id: "message", channelId: "room", image: payload().image, body: "before" }] as typeof state.messages;
  const scope = mediaScope(state, options);
  assert.equal(mediaScope({ ...state, messages: [{ ...state.messages[0], body: "edited" }] }, options), scope);
  assert.notEqual(mediaScope({ ...state, messages: [] }, options), scope);
  assert.notEqual(mediaScope({ ...state, preferences: { ...state.preferences, blockedIds: ["other"] } }, options), scope);
  assert.notEqual(mediaScope(state, { ...options, conversation: "other-room" }), scope);
  assert.notEqual(mediaScope(state, { ...options, direct: "private-peer" }), scope);
  const added = { ...state, messages: [...state.messages, { ...state.messages[0], id: "new-message", image: { ...payload().image, id: "new-image" } }] };
  assert.equal(mediaAuthority(state, options), mediaAuthority(added, options));
  const cache = new ImageMemoryCache(); cache.setContext(scope);
  const revision = cache.revision;
  assert.equal(cache.setContext(mediaScope(added, options)), false);
  assert.equal(cache.revision, revision);
  assert.equal(cache.setContext(mediaScope({ ...state, messages: [] }, options)), true);
  const squadState = { ...state, squadMessages: [{ id: "squad-message", image: payload().image, audienceIds: ["alice", "bob"] }] as typeof state.squadMessages };
  assert.notEqual(mediaScope(squadState, options), mediaScope({ ...squadState, squadMessages: [{ ...squadState.squadMessages[0], audienceIds: ["bob"] }] }, options));
});
