import test from "node:test";
import assert from "node:assert/strict";
import { DirectReadIncomplete, drainDirectRead } from "./directRead";

test("direct read drains a205-message conversation using fresh logical request IDs", async () => {
  const ids: string[] = []; let sequence = 0;
  await drainDirectRead({ requestId: () => `read-${++sequence}`, current: () => true, send: async id => {
    ids.push(id); return ids.length === 1 ? { marked: 200, hasMore: true } : { marked: 5, hasMore: false };
  } });
  assert.deepEqual(ids, ["read-1", "read-2"]);
});
test("direct read never follows a completed batch into another auth or selected-peer scope", async () => {
  let current = true, calls = 0;
  await drainDirectRead({ requestId: () => `${calls}`, current: () => current, send: async () => { calls++; current = false; return { marked: 200, hasMore: true }; } });
  assert.equal(calls, 1);
});
test("direct read bounds work and reports actual partial progress instead of claiming completion", async () => {
  let calls = 0;
  await assert.rejects(drainDirectRead({ requestId: () => `${calls}`, current: () => true, send: async () => { calls++; return { marked: 200, hasMore: true }; } }), error => error instanceof DirectReadIncomplete && error.marked === 1000 && /Earlier unread messages remain/.test(error.message));
  assert.equal(calls, 5);
});
test("zero-progress read markers do not loop indefinitely", async () => {
  let calls = 0;
  await assert.rejects(drainDirectRead({ requestId: () => `${calls}`, current: () => true, send: async () => { calls++; return { marked: 0, hasMore: true }; } }), DirectReadIncomplete);
  assert.equal(calls, 1);
});
