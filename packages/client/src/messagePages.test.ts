import test from "node:test";
import assert from "node:assert/strict";
import { MessagePages } from "./messagePages";
import type { MessageCursor } from "./data";

type Row = { id: string; createdAt: string; body: string };
const row = (id: number, body = `${id}`): Row => ({ id: `${id}`.padStart(3, "0"), createdAt: "2026-10-26T00:00:00.000Z", body });
function harness() {
  const calls: { cursor?: MessageCursor; success(rows: Row[]): void; failure(error: unknown): void; stopped: boolean }[] = [];
  let rows: Row[] = [], history = { loading: false, hasMore: false };
  const errors: unknown[] = [];
  const pages = new MessagePages<Row>({ pageSize: 2, subscribe(cursor, success, failure) { const call = { cursor, success, failure, stopped: false }; calls.push(call); return () => { call.stopped = true; }; }, publish(nextRows, nextHistory) { rows = nextRows; history = nextHistory; }, failure(error) { errors.push(error); } });
  return { pages, calls, errors, rows: () => rows, history: () => history };
}

test("cancelled history requests settle and old auth/selection callbacks cannot republish private records", async () => {
  const h = harness();
  h.pages.start();
  h.calls[0].success([row(4), row(3)]);
  const pending = h.pages.loadMore();
  assert.equal(h.history().loading, true);
  h.pages.stop();
  await pending;
  assert.deepEqual(h.rows(), []);
  h.pages.start();
  h.calls[2].success([row(8, "new account")]);
  h.calls[0].success([row(4, "old private account")]);
  h.calls[1].success([row(2, "old private history"), row(1)]);
  h.calls[1].failure(new Error("cancelled failure"));
  assert.deepEqual(h.rows().map(record => record.body), ["new account"]);
  assert.deepEqual(h.errors, []);
});

test("a moving live boundary rebuilds history and ignores the replaced page callback", async () => {
  const h = harness();
  h.pages.start();
  h.calls[0].success([row(4), row(3)]);
  const pending = h.pages.loadMore();
  h.calls[1].success([row(2), row(1)]);
  await pending;
  h.calls[0].success([row(5), row(4)]);
  assert.equal(h.calls[1].stopped, true);
  assert.deepEqual(h.calls[2].cursor, { createdAt: row(4).createdAt, id: row(4).id });
  h.calls[2].success([row(3), row(2)]);
  h.calls[1].success([row(2, "stale edit"), row(1)]);
  assert.deepEqual(h.rows().map(record => record.id), ["002", "003", "004", "005"]);
  assert.equal(h.history().loading, false);
});

test("latest snapshots cannot unlock another history request while its page is pending", async () => {
  const h = harness();
  h.pages.start();
  h.calls[0].success([row(4), row(3)]);
  const pending = h.pages.loadMore();
  h.calls[0].success([row(4, "edited"), row(3)]);
  await h.pages.loadMore();
  assert.equal(h.calls.length, 2);
  assert.equal(h.history().loading, true);
  h.calls[1].success([row(2)]);
  await pending;
  assert.equal(h.history().hasMore, false);
});

test("failed history can be retried and rejected requests never remain pending", async () => {
  const h = harness();
  h.pages.start();
  h.calls[0].success([row(4), row(3)]);
  const first = h.pages.loadMore();
  h.calls[1].failure(new Error("network"));
  await assert.rejects(first, /network/);
  const retry = h.pages.loadMore();
  h.calls[2].success([row(2)]);
  await retry;
  assert.equal(h.rows().length, 3);
  h.pages.stop();
});

test("deletions that exhaust the live window settle an invalidated pending history request", async () => {
  const h = harness();
  h.pages.start();
  h.calls[0].success([row(4), row(3)]);
  const pending = h.pages.loadMore();
  h.calls[0].success([row(4)]);
  await pending;
  assert.equal(h.calls[1].stopped, true);
  assert.deepEqual(h.history(), { loading: false, hasMore: false });
  h.calls[1].success([row(2), row(1)]);
  assert.deepEqual(h.rows().map(record => record.id), ["004"]);
});
test("catalog pages use last activity for cursors and keep paging when blocked rows fill a page", async () => {
  type Conversation = Row & { lastAt: string };
  const calls: { cursor?: MessageCursor; success(rows: Conversation[]): void }[] = [];
  let rows: Conversation[] = [], history = { loading: false, hasMore: false };
  const pages = new MessagePages<Conversation>({ pageSize: 2, sortAt: row => row.lastAt, filter: row => row.body !== "blocked", subscribe(cursor, success) { calls.push({ cursor, success }); return () => {}; }, publish(next, status) { rows = next; history = status; }, failure(error) { throw error; } });
  pages.start();
  calls[0].success([{ ...row(2, "blocked"), lastAt: "2026-10-26T00:00:00Z" }, { ...row(1, "blocked"), lastAt: "2026-10-25T00:00:00Z" }]);
  assert.equal(rows.length, 0); assert.equal(history.hasMore, true);
  const pending = pages.loadMore();
  assert.deepEqual(calls[1].cursor, { createdAt: "2026-10-25T00:00:00Z", id: "001" });
  calls[1].success([{ ...row(3, "visible"), lastAt: "2026-10-24T00:00:00Z" }]);
  await pending;
  assert.equal(rows[0].body, "visible"); assert.equal(history.hasMore, false);
  pages.stop();
});

test("a permission failure can stop all loaded pages without republishing surviving private rows", async () => {
  const calls: { success(rows: Row[]): void; failure(error: unknown): void; stopped: boolean }[] = [];
  let rows: Row[] = [];
  const pages = new MessagePages<Row>({ pageSize: 2, subscribe(_cursor, success, failure) { const call = { success, failure, stopped: false }; calls.push(call); return () => { call.stopped = true; }; }, publish(next) { rows = next; }, failure() { pages.stop(); } });
  pages.start(); calls[0].success([row(4), row(3)]);
  const pending = pages.loadMore(); calls[1].success([row(2)]); await pending;
  calls[1].failure(new Error("permission-denied"));
  assert.equal(rows.length, 0); assert.ok(calls.every(call => call.stopped));
  calls[0].success([row(4, "late private record")]);
  assert.equal(rows.length, 0);
});
