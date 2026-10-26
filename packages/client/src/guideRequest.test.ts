import test from "node:test";
import assert from "node:assert/strict";
import type { GuideEventsResult } from "@theloop/core";
import { GuideRequests, type GuideRequestState } from "./guideRequest";

const result = (count: number): GuideEventsResult => ({ events: [], count, limit: 50, bounded: false, skipped: 0 });
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));
test("new Guide filters abort old work and stale completions cannot replace current public results", async () => {
  const calls: { signal?: AbortSignal; resolve(value: GuideEventsResult): void; reject(error: unknown): void }[] = [];
  const requests = new GuideRequests((_filters, options) => new Promise((resolve, reject) => { calls.push({ signal: options?.signal, resolve, reject }); }));
  const updates: GuideRequestState[] = [];
  const cleanupOld = requests.start({ q: "old" }, state => updates.push(state));
  const cleanupNew = requests.start({ q: "new" }, state => updates.push(state));
  assert.equal(calls[0].signal?.aborted, true);
  calls[1].resolve(result(2)); await tick();
  calls[0].resolve(result(1)); await tick();
  assert.equal(updates.at(-1)?.count, 2);
  assert.equal(updates.at(-1)?.loading, false);
  cleanupOld();
  assert.equal(calls[1].signal?.aborted, false);
  cleanupNew();
});

test("disabled or unmounted Guide scope ignores late errors and leaves no pending request", async () => {
  let fail: (error: unknown) => void = () => {};
  const requests = new GuideRequests(() => new Promise((_resolve, reject) => { fail = reject; }));
  const updates: GuideRequestState[] = [];
  requests.start({}, state => updates.push(state));
  requests.cancel();
  fail(new Error("late private-looking error")); await tick();
  assert.equal(updates.length, 1);
  requests.cancel();
});

test("failed current Guide requests clear prior results and expose retryable error", async () => {
  const requests = new GuideRequests(async () => { throw new Error("Public service unavailable"); });
  const updates: GuideRequestState[] = [];
  const cleanup = requests.start({ limit: 20 }, state => updates.push(state));
  await tick();
  assert.deepEqual(updates.at(-1)?.events, []);
  assert.equal(updates.at(-1)?.limit, 20);
  assert.equal(updates.at(-1)?.error, "Public service unavailable");
  cleanup();
});
