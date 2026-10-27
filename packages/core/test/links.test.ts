import test from "node:test";
import assert from "node:assert/strict";
import { parseSharedTarget, sharedTargetPath } from "../src/links";

test("shared web and native links resolve the same records", () => {
  for (const kind of [
    "post",
    "event",
    "profile",
    "channel",
    "community",
    "squad",
    "conference",
  ] as const) {
    const target = { kind, id: "older-record_123" };
    assert.deepEqual(
      parseSharedTarget(`https://preview.example/${sharedTargetPath(target)}`),
      target,
    );
    assert.deepEqual(
      parseSharedTarget(`theloop://${kind}/${target.id}`),
      target,
    );
    assert.deepEqual(
      parseSharedTarget(`https://preview.example/?${kind}=${target.id}`),
      target,
    );
  }
});
test("malformed and unsafe target identifiers do not become routes", () => {
  for (const value of [
    "javascript:post/p1",
    "#/constructor/p1",
    "#/__proto__/p1",
    "#/post/%2Fsecret",
    "#/post/%00bad",
    "#/post/%ZZ",
    "#/post/a/b",
    "#/post/..",
    "#/post/" + "a".repeat(129),
  ]) {
    assert.equal(parseSharedTarget(value), null, value);
  }
  assert.equal(
    parseSharedTarget("https://example.com/#/calendar/event_1?from=calendar")
      ?.id,
    "event_1",
  );
  const topic = {
    kind: "channel" as const,
    id: "career-moves",
    topic: "Warm intros & referrals",
  };
  assert.deepEqual(
    parseSharedTarget(`https://example.com/${sharedTargetPath(topic)}`),
    topic,
  );
  assert.deepEqual(parseSharedTarget("exp://10.0.0.35:8097/--/post/p1"), {
    kind: "post",
    id: "p1",
  });
});
