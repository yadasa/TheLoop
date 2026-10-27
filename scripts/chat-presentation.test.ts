import { test } from "node:test";
import assert from "node:assert/strict";
import type { Message } from "@theloop/core";
import {
  dayKey,
  dayLabel,
  isMessageContinuation,
  visibleQuote,
  topicStarter,
} from "../apps/mobile/src/chatPresentation";

const message = (overrides: Partial<Message> = {}): Message => ({
  id: "m1",
  channelId: "c1",
  topic: "General",
  authorId: "a",
  body: "Hello",
  createdAt: "2026-10-27T12:00:00Z",
  reactions: {},
  ...overrides,
});
test("message grouping stops at author, channel, topic, reply and five-minute boundaries", () => {
  const previous = message();
  assert.equal(
    isMessageContinuation(
      previous,
      message({ createdAt: "2026-10-27T12:05:00Z" }),
    ),
    true,
  );
  for (const next of [
    { authorId: "b" },
    { channelId: "c2" },
    { topic: "Travel" },
    { replyTo: "m1" },
    { createdAt: "2026-10-27T12:05:01Z" },
    { createdAt: "2026-10-27T11:59:00Z" },
    { createdAt: "bad" },
  ]) {
    assert.equal(isMessageContinuation(previous, message(next)), false);
  }
  assert.equal(isMessageContinuation(undefined, previous), false);
});
test("date labels follow local calendar days and tolerate invalid timestamps", () => {
  const now = new Date(2026, 9, 27, 0, 3);
  assert.equal(dayLabel(now.toISOString(), now), "Today");
  const yesterday = new Date(2026, 9, 26, 23, 59);
  assert.equal(dayLabel(yesterday.toISOString(), now), "Yesterday");
  assert.notEqual(dayKey(now.toISOString()), dayKey(yesterday.toISOString()));
  assert.equal(
    isMessageContinuation(
      message({ createdAt: yesterday.toISOString() }),
      message({ createdAt: now.toISOString() }),
    ),
    false,
  );
  assert.equal(dayLabel("invalid", now), "Earlier messages");
});
test("quotes never disclose blocked authors or another channel", () => {
  const reply = message({ id: "reply", replyTo: "parent" });
  const parent = message({ id: "parent", authorId: "blocked" });
  assert.equal(visibleQuote(reply, [parent], ["blocked"]), undefined);
  assert.equal(
    visibleQuote(reply, [message({ ...parent, channelId: "private" })], []),
    undefined,
  );
  assert.equal(visibleQuote(reply, [parent], []), parent);
  assert.equal(visibleQuote(reply, [], []), undefined);
});
test("topic starters provide editable text without pretending it was sent", () => {
  for (const topic of [
    "Introductions",
    "Jobs & referrals",
    "Travel",
    "Side events",
    "General",
    "Custom topic",
  ]) {
    assert.ok(topicStarter(topic).draft.length > 0);
    assert.ok(topicStarter(topic).body.length > 0);
  }
});
