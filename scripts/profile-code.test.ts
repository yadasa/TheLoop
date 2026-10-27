import test from "node:test";
import assert from "node:assert/strict";
import jsQR from "jsqr";
import { profileCode } from "../apps/mobile/src/profileCode";

function decode(code: ReturnType<typeof profileCode>) {
  const scale = 6, width = code.size * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  const rectangles = [...code.path.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)];
  assert.ok(rectangles.length > 0);
  assert.equal(rectangles.map(match => match[0]).join(""), code.path);
  for (const [, x, y, length, back] of rectangles) {
    assert.equal(length, back);
    assert.ok(+x >= 4 && +y >= 4 && +x + +length <= code.size - 4 && +y < code.size - 4);
    for (let row = +y * scale; row < (+y + 1) * scale; row++)
      for (let col = +x * scale; col < (+x + +length) * scale; col++) {
        const offset = (row * width + col) * 4;
        data[offset] = data[offset + 1] = data[offset + 2] = 0;
      }
  }
  return jsQR(data, width, width)?.data;
}

test("profile QR paths independently decode to the exact installed-app or configured web link", () => {
  const native = profileCode("member-123");
  assert.equal(decode(native), "theloop://profile/member-123");
  assert.equal(native.requiresApp, true);
  const web = profileCode("member-123", "https://example.test/community?discard=secret#old");
  assert.equal(decode(web), "https://example.test/community#/profile/member-123");
  assert.equal(web.requiresApp, false);
  assert.ok(!web.url.includes("secret"));
});
test("profile QR rejects malformed targets and oversized links before encoding", () => {
  assert.throws(() => profileCode("../private"), /unavailable/);
  assert.throws(() => profileCode("member", `https://example.test/${"x".repeat(1100)}`), /link instead/);
  assert.equal(decode(profileCode("member", "javascript:alert(1)")), "theloop://profile/member");
});
