import test from "node:test";
import assert from "node:assert/strict";
import { parseSharedTarget } from "@theloop/core";
import { resolveShareTarget } from "../apps/mobile/src/sharedLinks";

test("conference and topic share links round-trip across app and configured web deployments", () => {
  for (const target of [
    { kind: "conference" as const, id: "afrotech" },
    {
      kind: "channel" as const,
      id: "afrotech-general",
      topic: "Jobs & referrals",
    },
  ]) {
    const native = resolveShareTarget(target);
    assert.equal(native.requiresApp, true);
    assert.deepEqual(parseSharedTarget(native.url), target);
    const web = resolveShareTarget(
      target,
      "https://community.example/app/?old=value#/post/old",
    );
    assert.equal(web.requiresApp, false);
    assert.ok(web.url.startsWith("https://community.example/app/#/"));
    assert.ok(!web.url.includes("old=value"));
    assert.deepEqual(parseSharedTarget(web.url), target);
  }
});

test("invalid or credential-bearing share bases fall back to app links without exposing credentials", () => {
  const target = { kind: "conference" as const, id: "afrotech" };
  for (const base of [
    undefined,
    "not a url",
    "javascript:alert(1)",
    "https://secret:password@example.com/",
    "file:///private",
  ]) {
    assert.deepEqual(resolveShareTarget(target, base), {
      url: "theloop://conference/afrotech",
      requiresApp: true,
    });
  }
  assert.throws(
    () => resolveShareTarget({ kind: "channel", id: "../private" }),
    /cannot be linked/,
  );
});
