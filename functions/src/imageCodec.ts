import { assert, Doc } from "./policy";
import { MAX_IMAGE_BYTES, MAX_SOURCE_BYTES } from "./media";

export function imageSignature(bytes: Buffer): string | undefined {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return "image/jpeg";
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
}
export async function sanitizeImage(
  bytes: Buffer,
  declaredType: string,
  mediaId: string,
  avatar = false,
): Promise<{ bytes: Buffer; image: Doc }> {
  assert(
    bytes.length > 0 &&
      bytes.length <= MAX_SOURCE_BYTES &&
      imageSignature(bytes) === declaredType,
    "invalid-argument",
    "The uploaded bytes are not the selected image format.",
  );
  // Reject animation chunks even when a decoder would silently select its first frame.
  if (declaredType === "image/png") {
    for (let offset = 8; offset + 12 <= bytes.length; ) {
      const length = bytes.readUInt32BE(offset),
        type = bytes.toString("ascii", offset + 4, offset + 8);
      assert(
        type !== "acTL",
        "invalid-argument",
        "Animated images are not supported.",
      );
      assert(
        length <= bytes.length - offset - 12,
        "invalid-argument",
        "This image contains a malformed chunk.",
      );
      offset += length + 12;
      if (type === "IEND") break;
    }
  }
  if (declaredType === "image/webp") {
    for (let offset = 12; offset + 8 <= bytes.length; ) {
      const length = bytes.readUInt32LE(offset + 4),
        type = bytes.toString("ascii", offset, offset + 4);
      assert(
        !["ANIM", "ANMF"].includes(type) &&
          !(type === "VP8X" && bytes[offset + 8] & 2),
        "invalid-argument",
        "Animated images are not supported.",
      );
      assert(
        length <= bytes.length - offset - 8,
        "invalid-argument",
        "This image contains a malformed chunk.",
      );
      offset += 8 + length + (length & 1);
    }
  }
  // Native decoding is loaded only for image completion, not every chat callable.
  const sharp = (await import("sharp")).default;
  sharp.cache(false);
  sharp.concurrency(1);
  try {
    const options = {
      failOn: "warning" as const,
      limitInputPixels: 12000000,
      limitInputChannels: 4,
      animated: false,
    };
    const metadata = await sharp(bytes, options).metadata();
    assert(
      ["jpeg", "png", "webp"].includes(metadata.format || "") &&
        metadata.width &&
        metadata.height &&
        metadata.width * metadata.height <= 12000000 &&
        (!metadata.pages || metadata.pages === 1) &&
        !metadata.delay &&
        metadata.loop === undefined,
      "invalid-argument",
      "Choose a still image of at most 12 million pixels.",
    );
    for (const [size, quality] of avatar
      ? [
          [512, 80],
          [320, 70],
          [256, 60],
        ]
      : [
          [2048, 80],
          [1536, 70],
          [1024, 60],
        ]) {
      const result = await sharp(bytes, options)
        .rotate()
        .resize(size, size, {
          fit: avatar ? "cover" : "inside",
          withoutEnlargement: true,
        })
        .webp({ quality, effort: 4 })
        .timeout({ seconds: 15 })
        .toBuffer({ resolveWithObject: true });
      if (result.data.length <= (avatar ? 128 * 1024 : MAX_IMAGE_BYTES))
        return {
          bytes: result.data,
          image: {
            id: mediaId,
            mimeType: "image/webp",
            width: result.info.width,
            height: result.info.height,
            size: result.data.length,
          },
        };
    }
    assert(
      false,
      "invalid-argument",
      "This image could not be reduced safely. Choose a smaller image.",
    );
  } catch (error) {
    // Decoder diagnostics can contain private metadata; never return them to clients.
    if (
      error instanceof Error &&
      "code" in error &&
      (error as Doc).code === "invalid-argument"
    )
      throw error;
    assert(
      false,
      "invalid-argument",
      "This image could not be decoded safely. Choose a different still image.",
    );
  }
}
