import test from "node:test";
import assert from "node:assert/strict";
import { DocumentWatch, type DocumentUpdate } from "./documentWatch";
type Row = { id: string; body: string };
function harness() {
  let active = true;
  const calls: { id: string; success(record: Row | undefined, fromCache: boolean): void; failure(error: unknown): void; stopped: boolean }[] = [];
  const updates: DocumentUpdate<Row>[] = [];
  const watch = new DocumentWatch<Row>({ current: () => active, subscribe(id, success, failure) { const call = { id, success, failure, stopped: false }; calls.push(call); return () => { call.stopped = true; }; }, publish(update) { updates.push(update); } });
  return { calls, updates, watch, deactivate() { active = false; } };
}
test("cache-only misses keep deep links loading until server confirms missing or present", () => {
  const h = harness(); h.watch.watch("old-link");
  h.calls[0].success(undefined, true);
  assert.deepEqual(h.updates.at(-1)?.status, { id: "old-link", loading: true, notFound: false, error: null });
  h.calls[0].success({ id: "old-link", body: "Cached" }, true);
  assert.equal(h.updates.at(-1)?.status.loading, true);
  h.calls[0].success({ id: "old-link", body: "Older than the bounded feed" }, false);
  assert.equal(h.updates.at(-1)?.record?.body, "Older than the bounded feed");
  h.calls[0].success({ id: "old-link", body: "Still available offline after confirmation" }, true);
  assert.equal(h.updates.at(-1)?.status.loading, false);
  h.calls[0].success(undefined, false);
  assert.equal(h.updates.at(-1)?.status.notFound, true);
});
test("changing a deep link cancels old success and error callbacks", () => {
  const h = harness(); h.watch.watch("first"); h.watch.watch("second");
  assert.equal(h.calls[0].stopped, true);
  h.calls[1].success({ id: "second", body: "Current" }, false);
  h.calls[0].success({ id: "first", body: "Stale" }, false); h.calls[0].failure(new Error("Stale failure"));
  assert.equal(h.updates.at(-1)?.record?.id, "second");
});
test("permission and network failures are retryable errors, never false not-found status", () => {
  const h = harness(); h.watch.watch("item"); h.calls[0].failure(new Error("Permission denied"));
  assert.equal(h.updates.at(-1)?.status.notFound, false);
  assert.equal(h.updates.at(-1)?.status.error, "Permission denied");
  h.calls[0].success({ id: "item", body: "Callback after terminal failure" }, false);
  assert.equal(h.updates.at(-1)?.record, undefined);
  h.watch.watch("item"); assert.equal(h.calls.length, 2);
  h.calls[1].success({ id: "item", body: "Retry succeeded" }, false);
  assert.equal(h.updates.at(-1)?.status.error, null);
});
test("invalid transport paths surface an error instead of crashing the caller", () => {
  const updates: DocumentUpdate<Row>[] = [];
  const watch = new DocumentWatch<Row>({ current: () => true, subscribe() { throw new Error("Invalid document path"); }, publish(update) { updates.push(update); } });
  assert.doesNotThrow(() => watch.watch("bad/path"));
  assert.equal(updates.at(-1)?.status.error, "Invalid document path");
  assert.equal(updates.at(-1)?.status.notFound, false);
});
test("stopping or changing auth scope cannot republish records or register orphan listeners", () => {
  const h = harness(); h.watch.watch("item"); h.deactivate(); h.watch.stop();
  const count = h.updates.length;
  h.calls[0].success({ id: "item", body: "Old account" }, false);
  h.watch.watch("other");
  assert.equal(h.updates.length, count); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].stopped, true);
});
test("metadata updates do not recreate an unchanged listener and null clears selection", () => {
  const h = harness(); h.watch.watch("item"); h.watch.watch("item"); assert.equal(h.calls.length, 1);
  h.watch.watch(null);
  assert.deepEqual(h.updates.at(-1)?.status, { id: null, loading: false, notFound: false, error: null });
  assert.equal(h.calls[0].stopped, true);
});
test("unconfirmed deep links time out with a retryable error instead of an invented404", async () => {
  const updates: DocumentUpdate<Row>[] = [];
  const watch = new DocumentWatch<Row>({ timeoutMs: 1, current: () => true, subscribe() { return () => {}; }, publish(update) { updates.push(update); } });
  watch.watch("unknown");
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(updates.at(-1)?.status.loading, false);
  assert.equal(updates.at(-1)?.status.notFound, false);
  assert.match(updates.at(-1)?.status.error ?? "", /Check your connection/);
  watch.stop();
});
