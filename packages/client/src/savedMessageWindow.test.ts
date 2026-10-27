import test from "node:test";
import assert from "node:assert/strict";
import type { Channel, Message } from "@theloop/core";
import { SavedMessageWindow, type SavedMessageRow } from "./savedMessageWindow";
const channel = {
  id: "room",
  visibility: "private",
  memberIds: ["me"],
  topics: ["Plans"],
} as Channel;
const message = {
  id: "saved",
  channelId: "room",
  topic: "Plans",
  body: "Original",
  authorId: "friend",
} as Message;
const references = [
  { messageId: "saved", channelId: "room", savedAt: "2026-10-27T12:00:00Z" },
];
function fixture() {
  let channelNext!: (value: Channel | null) => void, channelError!: () => void;
  let messageNext!: (value: Message[]) => void, messageError!: () => void;
  let rows: SavedMessageRow[] = [],
    channelStops = 0,
    messageStops = 0,
    messageStarts = 0,
    visible = true;
  const window = new SavedMessageWindow({
    references,
    userId: "me",
    visible: () => visible,
    subscribeChannel: (_, next, error) => {
      channelNext = next;
      channelError = error;
      return () => {
        channelStops++;
      };
    },
    subscribeMessages: (_, __, next, error) => {
      messageStarts++;
      messageNext = next;
      messageError = error;
      return () => {
        messageStops++;
      };
    },
    publish: (value) => {
      rows = value;
    },
  });
  window.start();
  return {
    window,
    channel: (value: Channel | null) => channelNext(value),
    channelError: () => channelError(),
    messages: (value: Message[]) => messageNext(value),
    messageError: () => messageError(),
    snapshot: () => ({ rows, channelStops, messageStops, messageStarts }),
    hide: () => {
      visible = false;
    },
  };
}
test("saved references wait for source authority, show edits and clear deleted or hidden messages", () => {
  const f = fixture();
  assert.equal(f.snapshot().messageStarts, 0);
  assert.equal(f.snapshot().rows[0].status, "loading");
  f.channel(channel);
  f.messages([message]);
  assert.equal(f.snapshot().rows[0].message?.body, "Original");
  f.messages([{ ...message, body: "Edited" }]);
  assert.equal(f.snapshot().rows[0].message?.body, "Edited");
  f.messages([{ ...message, channelId: "another-room" }]);
  assert.equal(f.snapshot().rows[0].message, undefined);
  f.messages([message]);
  f.hide();
  f.messages([message]);
  assert.equal(f.snapshot().rows[0].status, "unavailable");
  f.messages([]);
  assert.equal(f.snapshot().rows[0].message, undefined);
  f.window.close();
});
test("membership loss and listener failures clear content and late callbacks cannot restore it", () => {
  const f = fixture();
  f.channel(channel);
  f.messages([message]);
  f.channel({ ...channel, memberIds: [] });
  f.messages([message]);
  assert.equal(f.snapshot().rows[0].status, "unavailable");
  assert.equal(f.snapshot().rows[0].channel, undefined);
  assert.equal(f.snapshot().messageStops, 1);
  f.channel(channel);
  f.messages([message]);
  f.channelError();
  f.messages([message]);
  assert.equal(f.snapshot().rows[0].status, "error");
  assert.equal(f.snapshot().rows[0].message, undefined);
  f.window.close();
  const previous = f.snapshot().rows;
  f.channel(channel);
  f.messages([message]);
  assert.equal(f.snapshot().rows, previous);
  assert.equal(f.snapshot().channelStops, 1);
});
test("message query failures erase the last result and pages stay bounded", () => {
  const f = fixture();
  f.channel(channel);
  f.messages([message]);
  f.messageError();
  f.messages([message]);
  assert.equal(f.snapshot().rows[0].status, "error");
  assert.equal(f.snapshot().rows[0].message, undefined);
  f.window.start();
  assert.equal(f.snapshot().messageStarts, 1);
  f.window.close();
  assert.throws(
    () =>
      new SavedMessageWindow({
        references: Array(21).fill(references[0]),
        userId: "me",
        visible: () => true,
        subscribeChannel: () => () => {},
        subscribeMessages: () => () => {},
        publish: () => {},
      }),
    /20/,
  );
});
