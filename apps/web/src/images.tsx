import React, { useEffect, useRef, useState } from "react";
import { ImagePlus, RefreshCw, X } from "lucide-react";
import { useLoop } from "@theloop/client";
import type { ImageAttachment, MediaTarget } from "@theloop/core";
import { ModalShell } from "./ui";

type Normalized = { blob: Blob; width: number; height: number };
function sourceDimensions(
  bytes: Uint8Array,
  type: string,
): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    ascii = (i: number, n: number) =>
      String.fromCharCode(...bytes.slice(i, i + n));
  if (
    type === "image/png" &&
    bytes.length >= 33 &&
    bytes[0] === 137 &&
    ascii(1, 3) === "PNG" &&
    ascii(12, 4) === "IHDR"
  ) {
    for (let i = 8; i + 12 <= bytes.length; ) {
      const length = view.getUint32(i),
        kind = ascii(i + 4, 4);
      if (length > bytes.length - i - 12)
        throw new Error("This photo contains an incomplete image chunk.");
      if (kind === "acTL")
        throw new Error("Choose a still photo rather than an animation.");
      i += length + 12;
      if (kind === "IEND") break;
    }
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216) {
    let i = 2;
    while (i + 4 < bytes.length) {
      if (bytes[i++] !== 255) break;
      while (bytes[i] === 255) i++;
      const marker = bytes[i++];
      if (marker === 218 || marker === 217) break;
      if (marker === 216 || marker === 1 || (marker >= 208 && marker <= 215))
        continue;
      const length = view.getUint16(i);
      if (length < 2 || i + length > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 8
      )
        return { height: view.getUint16(i + 3), width: view.getUint16(i + 5) };
      i += length;
    }
  }
  if (
    type === "image/webp" &&
    bytes.length >= 30 &&
    ascii(0, 4) === "RIFF" &&
    ascii(8, 4) === "WEBP"
  ) {
    const u24 = (i: number) =>
      bytes[i] + bytes[i + 1] * 256 + bytes[i + 2] * 65536;
    for (let i = 12; i + 8 <= bytes.length; ) {
      const kind = ascii(i, 4),
        size = view.getUint32(i + 4, true),
        p = i + 8;
      if (p + size > bytes.length) break;
      if (kind === "ANIM" || kind === "ANMF")
        throw new Error("Choose a still photo rather than an animation.");
      if (kind === "VP8X" && size >= 10) {
        if (bytes[p] & 2)
          throw new Error("Choose a still photo rather than an animation.");
        return { width: u24(p + 4) + 1, height: u24(p + 7) + 1 };
      }
      if (kind === "VP8L" && size >= 5 && bytes[p] === 47)
        return {
          width: (bytes[p + 1] | ((bytes[p + 2] & 63) << 8)) + 1,
          height:
            ((bytes[p + 2] >> 6) |
              (bytes[p + 3] << 2) |
              ((bytes[p + 4] & 15) << 10)) +
            1,
        };
      if (
        kind === "VP8 " &&
        size >= 10 &&
        bytes[p + 3] === 157 &&
        bytes[p + 4] === 1 &&
        bytes[p + 5] === 42
      )
        return {
          width: view.getUint16(p + 6, true) & 16383,
          height: view.getUint16(p + 8, true) & 16383,
        };
      i = p + size + (size % 2);
    }
  }
  throw new Error(
    "Choose a JPEG, PNG, or WebP photo that your browser can read.",
  );
}
async function normalizePhoto(file: File): Promise<Normalized> {
  if (!file.size || file.size > 5 * 1024 * 1024)
    throw new Error("Choose a JPEG, PNG, or WebP photo up to 5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime =
    bytes[0] === 255 && bytes[1] === 216
      ? "image/jpeg"
      : bytes[0] === 137 &&
          bytes[1] === 80 &&
          bytes[2] === 78 &&
          bytes[3] === 71
        ? "image/png"
        : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
          ? "image/webp"
          : "";
  if (!mime) throw new Error("Choose a JPEG, PNG, or WebP photo.");
  const dimensions = sourceDimensions(bytes, mime);
  if (
    !dimensions.width ||
    !dimensions.height ||
    dimensions.width * dimensions.height > 12000000
  )
    throw new Error(
      "Choose a photo up to 12 megapixels. A smaller copy works too.",
    );
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }), {
    imageOrientation: "from-image",
  });
  try {
    if (
      !bitmap.width ||
      !bitmap.height ||
      bitmap.width * bitmap.height > 12000000
    )
      throw new Error("This photo is too large. Choose a smaller copy.");
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("2d");
    if (!context)
      throw new Error("Photo processing is unavailable in this browser.");
    for (let attempt = 0; attempt < 5; attempt++) {
      const scale =
        Math.min(1, 2048 / bitmap.width, 2048 / bitmap.height) *
        Math.pow(0.75, attempt);
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error("The photo could not be prepared.")),
          "image/webp",
          attempt === 0 ? 0.86 : 0.75,
        ),
      );
      if (blob.type !== "image/webp")
        throw new Error(
          "This browser cannot prepare private photos. Try a current browser.",
        );
      if (blob.size <= 1024 * 1024)
        return { blob, width: canvas.width, height: canvas.height };
    }
    throw new Error("This photo needs a smaller copy before sharing.");
  } finally {
    bitmap.close();
  }
}

type Draft = Normalized & { url: string; image?: ImageAttachment };
export function useImageDraft(target: MediaTarget | null) {
  const { uploadImage, state } = useLoop();
  const [draft, setDraft] = useState<Draft | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0),
    operating = useRef(false),
    draftRef = useRef<Draft | null>(null),
    key = `${state.currentUserId}:${target?.kind ?? ""}:${target?.id ?? ""}`;
  const clear = () => {
    generation.current++;
    operating.current = false;
    if (draftRef.current) URL.revokeObjectURL(draftRef.current.url);
    draftRef.current = null;
    setDraft(null);
    setBusy(false);
    setError("");
  };
  useEffect(() => {
    clear();
    return () => {
      generation.current++;
      if (draftRef.current) URL.revokeObjectURL(draftRef.current.url);
      draftRef.current = null;
    };
  }, [key]);
  const choose = async (file: File) => {
    const request = ++generation.current;
    operating.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await normalizePhoto(file);
      if (request !== generation.current) return;
      const next = { ...value, url: URL.createObjectURL(value.blob) };
      if (draftRef.current) URL.revokeObjectURL(draftRef.current.url);
      draftRef.current = next;
      setDraft(next);
    } catch (error) {
      if (request === generation.current)
        setError(
          error instanceof Error
            ? error.message
            : "This photo could not be prepared.",
        );
    } finally {
      if (request === generation.current) {
        operating.current = false;
        setBusy(false);
      }
    }
  };
  const prepare = async (): Promise<
    { ok: true; imageId?: string } | { ok: false }
  > => {
    if (operating.current) return { ok: false };
    const selected = draftRef.current;
    if (!selected) return { ok: true };
    if (!target) return { ok: false };
    if (selected.image) return { ok: true, imageId: selected.image.id };
    const request = generation.current;
    operating.current = true;
    setBusy(true);
    setError("");
    try {
      const image = await uploadImage(target, {
        data: selected.blob,
        contentType: "image/webp",
        width: selected.width,
        height: selected.height,
      });
      if (request !== generation.current) return { ok: false };
      const next = { ...selected, image };
      draftRef.current = next;
      setDraft(next);
      return { ok: true, imageId: image.id };
    } catch (error) {
      if (request === generation.current)
        setError(
          error instanceof Error
            ? error.message
            : "Your photo could not be uploaded. Try again.",
        );
      return { ok: false };
    } finally {
      if (request === generation.current) {
        operating.current = false;
        setBusy(false);
      }
    }
  };
  return { draft, busy, error, choose, clear, prepare };
}
export function ImageComposer({
  value,
  disabled = false,
}: {
  value: ReturnType<typeof useImageDraft>;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="image-composer">
      <input
        type="file"
        ref={input}
        accept="image/jpeg,image/png,image/webp"
        hidden
        disabled={disabled || value.busy}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) void value.choose(file);
        }}
      />
      {value.draft ? (
        <div className="image-draft">
          <img src={value.draft.url} alt="Photo selected for this message" />
          <button
            type="button"
            className="icon-button"
            aria-label="Remove selected photo"
            disabled={disabled || value.busy}
            onClick={value.clear}
          >
            <X size={16} />
          </button>
          <span>
            {value.busy
              ? "Preparing your photo…"
              : "Ready to share with your words"}
          </span>
        </div>
      ) : (
        <button
          type="button"
          className="image-add"
          disabled={disabled || value.busy}
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={17} />
          {value.busy ? "Preparing photo…" : "Add a photo"}
        </button>
      )}
      {value.error && (
        <p className="image-error" role="alert">
          {value.error}
        </p>
      )}
    </div>
  );
}
export function ProtectedImage({
  image,
  alt = "Photo shared in this conversation",
  reportId,
}: {
  image: ImageAttachment;
  alt?: string;
  reportId?: string;
}) {
  const { getImage, mediaRevision } = useLoop();
  const frame = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [attempt, setAttempt] = useState(0),
    [result, setResult] = useState<{
      key: string;
      url?: string;
      error?: string;
    }>({ key: "" }),
    [expanded, setExpanded] = useState(false);
  const key = `${mediaRevision}:${image.id}:${reportId ?? ""}:${attempt}`;
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setNear(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: "450px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setExpanded(false), [key]);
  const needed = near || expanded;
  useEffect(() => {
    let active = true;
    if (!needed) {
      setResult({ key: "" });
      return;
    }
    void getImage(image.id, reportId)
      .then((value) => {
        if (active) setResult({ key, url: value.dataUrl });
      })
      .catch(() => {
        if (active)
          setResult({ key, error: "This photo is no longer available." });
      });
    return () => {
      active = false;
    };
  }, [key, getImage, image.id, reportId, needed]);
  const current = needed && result.key === key ? result : undefined;
  return (
    <div ref={frame} className="protected-image-frame">
      {current?.error ? (
        <div className="image-unavailable">
          <span>{current.error}</span>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            aria-label="Try loading photo again"
          >
            <RefreshCw size={13} />
            Try again
          </button>
        </div>
      ) : !current?.url ? (
        <div
          className="image-loading"
          style={{ aspectRatio: `${image.width}/${image.height}` }}
          role="status"
        >
          {near ? "Loading photo…" : "Photo"}
        </div>
      ) : (
        <>
          <button
            type="button"
            className="protected-image"
            aria-label="Open shared photo"
            onClick={() => setExpanded(true)}
          >
            <img
              src={current.url}
              width={image.width}
              height={image.height}
              alt={alt.slice(0, 180)}
              loading="lazy"
            />
          </button>
          {expanded && (
            <ModalShell
              title="A little moment, shared."
              close={() => setExpanded(false)}
              wide
            >
              <div className="photo-view">
                <img src={current.url} alt={alt.slice(0, 180)} />
              </div>
            </ModalShell>
          )}
        </>
      )}
    </div>
  );
}
