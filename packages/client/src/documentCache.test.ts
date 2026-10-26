import test from "node:test";
import assert from "node:assert/strict";
import { DocumentCache, updateEventBuckets } from "./documentCache";
type Row = { id: string; body: string };
const row = (id: string, body = "old"): Row => ({ id, body });
const update = (id: string, record: Row | undefined, fromCache = false) => ({ record, fromCache, status: { id, loading: false, notFound: !record && !fromCache, error: null } });

test("a pending saved fetch cannot resurrect deletion after the detail closes", () => {
  const cache = new DocumentCache<Row>(), saved = new Map([["post", row("post")], ["other", row("other")]]);
  const read = cache.beginRead(["post", "other"]);
  cache.select("post"); cache.apply(update("post", undefined)); saved.delete("post"); cache.select(null);
  cache.mergeRead(saved, read, [row("post"), row("other", "fresh")], true); cache.endRead(read);
  assert.equal(saved.has("post"), false);
  assert.equal(saved.get("other")?.body, "fresh");
  assert.deepEqual(cache.merge([[row("post")], [...saved.values()]]), [row("other", "fresh")]);
});
test("targeted server edits survive an older saved response and closing the detail", () => {
  const cache = new DocumentCache<Row>(), saved = new Map([["post", row("post")]]), read = cache.beginRead(["post"]);
  cache.select("post"); cache.apply(update("post", row("post", "edited"))); saved.set("post", row("post", "edited"));
  cache.mergeRead(saved, read, [row("post")], true); cache.select(null); cache.endRead(read);
  assert.equal(cache.merge([[...saved.values()]])[0].body, "edited");
});
test("cached positives cannot undo a confirmed deletion but a current server snapshot can", () => {
  const cache = new DocumentCache<Row>(); cache.select("post"); cache.apply(update("post", undefined));
  const stale = cache.apply(update("post", row("post"), true));
  assert.equal(stale.status.loading, true); assert.equal(stale.record, undefined);
  assert.deepEqual(cache.merge([[row("post")]]), []);
  cache.apply(update("post", row("post", "restored")));
  assert.equal(cache.merge([[row("post")]])[0].body, "restored");
});
test("offline saved misses preserve known records rather than invent deletion", () => {
  const cache = new DocumentCache<Row>(), saved = new Map([["post", row("post")]]), read = cache.beginRead(["post"]);
  cache.mergeRead(saved, read, [], false); cache.endRead(read);
  assert.equal(saved.has("post"), true); assert.equal(cache.isMissing("post"), false);
});
test("deletion invalidates in-flight records even after the bounded tombstone window advances", () => {
  const cache = new DocumentCache<Row>(2), saved = new Map<string, Row>(), read = cache.beginRead(["old-post"]);
  cache.markMissing("old-post"); cache.markMissing("second"); cache.markMissing("third");
  cache.mergeRead(saved, read, [row("old-post")], true); cache.endRead(read);
  assert.equal(saved.has("old-post"), false);
});
test("targeted overlay clears on selection while tombstones also protect event bucket duplicates", () => {
  const cache = new DocumentCache<Row>(); cache.select("event"); cache.apply(update("event", row("event", "fresh")));
  assert.deepEqual(cache.merge([[row("event", "past")], [row("event", "future")]]), [row("event", "fresh")]);
  cache.apply(update("event", undefined)); cache.select(null);
  assert.deepEqual(cache.merge([[row("event", "past")], [row("event", "future")]]), []);
  cache.clear(); assert.equal(cache.isMissing("event"), false);
});
test("a targeted event crossing the frozen boundary cannot retain an old opposite-side copy", () => {
  const event = { id: "event", endAt: "2026-10-25T00:00:00.000Z", title: "Old time" };
  const moved = { ...event, endAt: "2026-10-27T00:00:00.000Z", title: "New time" };
  const next = updateEventBuckets([moved], [event], moved, "2026-10-26T00:00:00.000Z");
  assert.deepEqual(next.future, [moved]); assert.deepEqual(next.past, []);
});
