import test from "node:test";
import assert from "node:assert/strict";
import type { Message } from "@theloop/core";
import { ReplyThread, emptyReplyThread } from "./replyThread";
const message = (id: string, overrides: Partial<Message> = {}): Message => ({
  id,
  channelId: "room",
  topic: "General",
  authorId: "peer",
  body: id,
  reactions: {},
  createdAt: "2026-10-27T12:00:00Z",
  ...overrides,
});
function harness() {
  let parent!: (value: Message | null) => void,
    rows!: (value: Message[]) => void,
    fail!: (error: unknown) => void;
  let value = emptyReplyThread(),
    stopped = 0,
    publishes = 0;
  const errors: unknown[] = [];
  const thread = new ReplyThread({
    channelId: "room",
    messageId: "root",
    subscribeParent: (next, error) => {
      parent = next;
      fail = error;
      return () => stopped++;
    },
    subscribeReplies: (_, next) => {
      rows = next;
      return () => stopped++;
    },
    visible: (row) => row.authorId !== "blocked",
    publish: (next) => {
      value = next;
      publishes++;
    },
    failure: (error) => errors.push(error),
  });
  thread.start();
  return {
    thread,
    parent: (next: Message | null) => parent(next),
    rows: (next: Message[]) => rows(next),
    fail: (error: unknown) => fail(error),
    value: () => value,
    stopped: () => stopped,
    publishes: () => publishes,
    errors,
  };
}
test("replies require an available parent and exclude other topics, branches, channels and blocked members", () => {
  const h = harness();
  const reply = message("reply", { replyTo: "root" });
  h.rows([
    reply,
    message("wrong-topic", { replyTo: "root", topic: "Other" }),
    message("wrong-branch", { replyTo: "another" }),
    message("wrong-room", { replyTo: "root", channelId: "another" }),
    message("blocked", { replyTo: "root", authorId: "blocked" }),
  ]);
  assert.deepEqual(h.value().replies, []);
  h.parent(message("root"));
  assert.deepEqual(h.value().replies, [reply]);
  h.parent(null);
  assert.equal(h.value().parentLoaded, true);
  assert.deepEqual(h.value().replies, []);
  h.parent(message("root", { authorId: "blocked" }));
  assert.equal(h.value().parent, null);
  h.thread.close();
});
test("closing a reply branch detaches listeners and ignores late private content", () => {
  const h = harness();
  h.parent(message("root"));
  h.thread.close();
  const published = h.publishes();
  h.parent(message("root", { body: "late private" }));
  h.rows([message("late", { replyTo: "root" })]);
  h.fail(new Error("late error"));
  assert.equal(h.publishes(), published);
  assert.equal(h.stopped(), 2);
  assert.deepEqual(h.errors, []);
});
test("permission failure closes both listeners before surfacing the error", () => {
  const h = harness();
  h.fail(new Error("permission-denied"));
  assert.equal(h.stopped(), 2);
  assert.equal(h.errors.length, 1);
  const published = h.publishes();
  h.rows([message("late", { replyTo: "root" })]);
  assert.equal(h.publishes(), published);
});
test("synchronous parent failure releases its returned unsubscribe without starting reply listeners", () => {
  let stopped = false,
    replies = false;
  const thread = new ReplyThread({
    channelId: "room",
    messageId: "root",
    subscribeParent: (_, fail) => {
      fail(new Error("denied"));
      return () => {
        stopped = true;
      };
    },
    subscribeReplies: () => {
      replies = true;
      return () => {};
    },
    visible: () => true,
    publish: () => {},
    failure: () => {},
  });
  thread.start();
  assert.equal(stopped, true);
  assert.equal(replies, false);
});
