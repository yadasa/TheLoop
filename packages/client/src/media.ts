import type { ImageAttachment, LoopState, MediaTarget } from "@theloop/core";

export type ImageUploadInput = { data: Blob | Uint8Array | ArrayBuffer; contentType: "image/jpeg" | "image/png" | "image/webp"; width?: number; height?: number };
export type ImageDataResult = { image: ImageAttachment; dataUrl: string };
export class MediaScopeChanged extends Error { readonly code = "media/scope-changed"; constructor() { super("This image view changed. Open it again."); } }
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const maximumImage = 1024 * 1024;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
export const safeMediaId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 200 && !/[\s/\\\u0000-\u001F\u007F]/.test(value);

/** No Buffer, atob, btoa, or TextEncoder globals are required by the native client. */
export function encodeImageBase64(bytes: Uint8Array): string {
  const parts: string[] = []; let part = "";
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const a = bytes[offset], b = bytes[offset + 1], c = bytes[offset + 2];
    part += alphabet[a >> 2] + alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)] + (b === undefined ? "=" : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)]) + (c === undefined ? "=" : alphabet[c & 63]);
    if (part.length >= 16384) { parts.push(part); part = ""; }
  }
  if (part) parts.push(part);
  return parts.join("");
}

export function decodeImageBase64(value: unknown, maximum = maximumImage): Uint8Array {
  if (typeof value !== "string" || !value.length || value.length % 4 || value.length > Math.ceil(maximum / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error("The image data is invalid.");
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const size = value.length / 4 * 3 - padding;
  if (!size || size > maximum) throw new Error("The image is too large.");
  const bytes = new Uint8Array(size); let position = 0;
  for (let offset = 0; offset < value.length; offset += 4) {
    const a = alphabet.indexOf(value[offset]), b = alphabet.indexOf(value[offset + 1]), c = alphabet.indexOf(value[offset + 2]), d = alphabet.indexOf(value[offset + 3]);
    if (offset === value.length - 4 && ((padding === 2 && (b & 15) !== 0) || (padding === 1 && (c & 3) !== 0))) throw new Error("The image encoding is invalid.");
    bytes[position++] = (a << 2) | (b >> 4);
    if (position < size) bytes[position++] = ((b & 15) << 4) | (c >> 2);
    if (position < size) bytes[position++] = ((c & 3) << 6) | d;
  }
  return bytes;
}

export function webPDimensions(bytes: Uint8Array, sanitized = false): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 26 || tag(0) !== "RIFF" || tag(8) !== "WEBP" || view.getUint32(4, true) + 8 !== bytes.length) throw new Error("Choose a processed WebP image.");
  let dimensions: { width: number; height: number } | undefined, payload = false;
  const found = (width: number, height: number) => {
    if (width < 1 || height < 1 || width > 2048 || height > 2048 || (dimensions && (dimensions.width !== width || dimensions.height !== height))) throw new Error("Image dimensions must fit within 2,048 × 2,048 pixels.");
    dimensions = { width, height };
  };
  let offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error("The WebP image is incomplete.");
    const kind = tag(offset), size = view.getUint32(offset + 4, true), start = offset + 8, end = start + size;
    if (end > bytes.length || end + (size % 2) > bytes.length || kind === "ANIM" || kind === "ANMF" || (sanitized && !["VP8 ", "VP8L", "VP8X", "ALPH"].includes(kind))) throw new Error("Choose a still WebP image without embedded metadata.");
    if (kind === "VP8X") {
      if (size < 10 || (bytes[start] & 2)) throw new Error("Animated images are unavailable.");
      found(1 + bytes[start + 4] + (bytes[start + 5] << 8) + (bytes[start + 6] << 16), 1 + bytes[start + 7] + (bytes[start + 8] << 8) + (bytes[start + 9] << 16));
    } else if (kind === "VP8L") {
      if (size < 5 || bytes[start] !== 0x2f) throw new Error("The WebP image is invalid.");
      const bits = view.getUint32(start + 1, true);
      if (bits >>> 29) throw new Error("The WebP image is invalid.");
      found(1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff)); payload = true;
    } else if (kind === "VP8 ") {
      if (size < 10 || (bytes[start] & 1) || bytes[start + 3] !== 0x9d || bytes[start + 4] !== 1 || bytes[start + 5] !== 0x2a) throw new Error("The WebP image is invalid.");
      found(view.getUint16(start + 6, true) & 0x3fff, view.getUint16(start + 8, true) & 0x3fff); payload = true;
    }
    offset = end + size % 2;
  }
  if (!dimensions || !payload) throw new Error("The WebP image has no picture data.");
  return dimensions;
}

/** Used after a platform codec has applied orientation and re-encoded the pixels.
 * ICC/EXIF/XMP and unknown chunks cannot remain in persisted demo images. */
export function stripWebPMetadata(bytes: Uint8Array): Uint8Array {
  webPDimensions(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), chunks: Uint8Array[] = [];
  for (let offset = 12; offset < bytes.length;) {
    const size = view.getUint32(offset + 4, true), end = offset + 8 + size + size % 2;
    const kind = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    if (["VP8X", "ALPH", "VP8 ", "VP8L"].includes(kind)) {
      const chunk = Uint8Array.from(bytes.subarray(offset, end));
      if (kind === "VP8X") { chunk[8] &= 0x10; chunk[9] = 0; chunk[10] = 0; chunk[11] = 0; }
      chunks.push(chunk);
    }
    offset = end;
  }
  const result = new Uint8Array(12 + chunks.reduce((size, chunk) => size + chunk.length, 0));
  result.set(bytes.subarray(0, 12));
  new DataView(result.buffer).setUint32(4, result.length - 8, true);
  let offset = 12;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  webPDimensions(result, true);
  return result;
}

export function imageMetadata(value: unknown, expectedId?: string): ImageAttachment {
  if (!object(value) || !safeMediaId(value.id) || (expectedId && value.id !== expectedId) || value.mimeType !== "image/webp" || !Number.isInteger(value.width) || !Number.isInteger(value.height) || !Number.isInteger(value.size) || (value.width as number) < 1 || (value.width as number) > 2048 || (value.height as number) < 1 || (value.height as number) > 2048 || (value.size as number) < 1 || (value.size as number) > maximumImage) throw new Error("The image metadata is invalid.");
  return { id: value.id, mimeType: "image/webp", width: value.width as number, height: value.height as number, size: value.size as number };
}

export function imageData(value: unknown, expectedId: string): ImageDataResult {
  if (!object(value)) throw new Error("The image response is invalid.");
  const image = imageMetadata(value.image, expectedId), bytes = decodeImageBase64(value.base64);
  const dimensions = webPDimensions(bytes);
  if (bytes.length !== image.size || dimensions.width !== image.width || dimensions.height !== image.height) throw new Error("The image dimensions do not match its metadata.");
  return { image, dataUrl: `data:image/webp;base64,${value.base64 as string}` };
}

export async function imageUploadBytes(input: ImageUploadInput, demo = false): Promise<Uint8Array> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(input.contentType)) throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (typeof Blob !== "undefined" && input.data instanceof Blob && input.data.size > 5 * maximumImage) throw new Error("Choose an image smaller than 5 MB.");
  let bytes = input.data instanceof Uint8Array ? input.data : input.data instanceof ArrayBuffer ? new Uint8Array(input.data) : new Uint8Array(await input.data.arrayBuffer());
  if (!bytes.length || bytes.length > (demo ? maximumImage : 5 * maximumImage)) throw new Error(demo ? "The preview image must be smaller than 1 MB." : "Choose an image smaller than 5 MB.");
  const signature = input.contentType === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : input.contentType === "image/png" ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) : bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
  if (!signature) throw new Error("The selected file does not match its image type.");
  if (demo) {
    if (input.contentType !== "image/webp") throw new Error("Prepare the preview image as WebP first.");
    bytes = stripWebPMetadata(bytes);
    const dimensions = webPDimensions(bytes, true);
    if (dimensions.width !== input.width || dimensions.height !== input.height) throw new Error("The preview image dimensions are invalid.");
  }
  return bytes;
}

type MediaContext = { mode: string; role: string; conversation: string | null; squad: string | null; direct?: string | null };
export function mediaAuthority(state: LoopState, options: MediaContext): string {
  const members = [...state.channels.filter(channel => channel.visibility === "private").map(channel => JSON.stringify([channel.id, (channel.memberIds ?? []).slice().sort()])), ...state.squads.map(squad => JSON.stringify([squad.id, squad.ownerId, squad.archived, squad.memberIds.slice().sort()]))].sort();
  return JSON.stringify([state.currentUserId, options.mode, options.role, options.conversation, options.squad, options.direct ?? null, state.preferences.blockedIds.slice().sort(), members]);
}
/** Permission-relevant context only; ordinary text edits do not discard image bytes. */
export function mediaScope(state: LoopState, options: MediaContext): string {
  const records = [...state.messages, ...state.posts, ...state.directMessages, ...state.squadMessages].filter(record => record.image).map(record => JSON.stringify([record.id, record.image!.id, "audienceIds" in record ? record.audienceIds.slice().sort() : undefined, "fromId" in record ? [record.fromId, record.toId] : undefined, "channelId" in record ? record.channelId : undefined, "communityId" in record ? record.communityId : undefined, "authorId" in record ? record.authorId : undefined])).sort();
  records.push(...state.profiles.filter(profile => profile.image).map(profile => JSON.stringify(["profile", profile.id, profile.image!.id, profile.visibility, state.connections.filter(connection => connection.status === "accepted" && [connection.fromId, connection.toId].includes(profile.id) && [connection.fromId, connection.toId].includes(state.currentUserId)).map(connection => connection.id).sort()])));
  records.sort();
  return JSON.stringify([mediaAuthority(state, options), records, state.reports.filter(report => report.snapshot?.image).map(report => JSON.stringify([report.id, report.snapshot!.image!.id])).sort()]);
}
function onlyAddsSources(previous: string, next: string): boolean {
  try {
    const a = JSON.parse(previous), b = JSON.parse(next);
    return Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && Array.isArray(a[1]) && Array.isArray(a[2]) && Array.isArray(b[1]) && Array.isArray(b[2]) && a[1].every((key: unknown) => b[1].includes(key)) && a[2].every((key: unknown) => b[2].includes(key));
  } catch { return false; }
}

export class ImageMemoryCache {
  private context = "";
  private generation = 0;
  private values = new Map<string, ImageDataResult>();
  private pending = new Map<string, Promise<ImageDataResult>>();
  constructor(private byteBudget = 4 * maximumImage, private entryBudget = 64) {}
  get revision(): number { return this.generation; }
  setContext(context: string): boolean { if (context === this.context) return false; const compatible = onlyAddsSources(this.context, context); this.context = context; if (compatible) return false; this.clear(); return true; }
  clear(): void { this.generation++; this.values.clear(); this.pending.clear(); }
  current(revision: number): boolean { return revision === this.generation; }

  async get(id: string, reportId: string | undefined, load: () => Promise<unknown>): Promise<ImageDataResult> {
    if (!safeMediaId(id) || (reportId !== undefined && !safeMediaId(reportId))) throw new Error("Choose a valid image.");
    const key = `${id}\u0000${reportId ?? ""}`, generation = this.generation;
    const cached = reportId ? undefined : this.values.get(key);
    if (cached) { this.values.delete(key); this.values.set(key, cached); return cached; }
    const pending = this.pending.get(key);
    if (pending) return pending;
    const request = (async () => {
      try {
        const value = await load();
        if (generation !== this.generation) throw new MediaScopeChanged();
        const result = imageData(value, id);
        if (!reportId) {
          this.values.set(key, result);
          while (this.values.size > this.entryBudget || [...this.values.values()].reduce((sum, entry) => sum + entry.image.size, 0) > this.byteBudget) this.values.delete(this.values.keys().next().value!);
        }
        return result;
      } catch (error) { if (generation !== this.generation) throw new MediaScopeChanged(); throw error; }
    })();
    this.pending.set(key, request);
    try { return await request; }
    finally { if (this.pending.get(key) === request) this.pending.delete(key); }
  }
}

export function previewImageData(value: unknown): ImageDataResult {
  if (!object(value) || !object(value.image) || typeof value.dataUrl !== "string" || !value.dataUrl.startsWith("data:image/webp;base64,")) throw new Error("The saved image is invalid.");
  const result = imageData({ image: value.image, base64: value.dataUrl.slice("data:image/webp;base64,".length) }, value.image.id as string);
  webPDimensions(decodeImageBase64(value.dataUrl.slice("data:image/webp;base64,".length)), true);
  return result;
}
