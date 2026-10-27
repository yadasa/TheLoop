import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DialogQueue,
  type DialogRequest,
} from "../apps/mobile/src/dialogQueue";

function harness() {
  let current: DialogRequest | null = null;
  const errors: unknown[] = [];
  const queue = new DialogQueue(
    (value) => {
      current = value;
    },
    (error) => errors.push(error),
  );
  queue.setScope("account-a");
  return { queue, errors, current: () => current };
}
test("choosing consumes the action before a repeated tap or nested confirmation", () => {
  const h = harness();
  let executed = 0;
  h.queue.show("account-a", "Options", "", [
    {
      text: "Delete",
      onPress: () => {
        h.queue.show("account-a", "Really delete?", "", [
          {
            text: "Confirm",
            onPress: () => {
              executed++;
            },
          },
        ]);
      },
    },
  ]);
  const first = h.current()!.id;
  h.queue.choose(first, 0, "account-a");
  const second = h.current()!.id;
  h.queue.choose(first, 0, "account-a");
  assert.equal(h.current()!.id, second);
  assert.equal(executed, 0);
  h.queue.choose(second, 0, "account-a");
  h.queue.choose(second, 0, "account-a");
  assert.equal(executed, 1);
  assert.equal(h.current(), null);
});
test("backdrop dismissal invokes cancel and never destructive actions", () => {
  const h = harness();
  const calls: string[] = [];
  h.queue.show(
    "account-a",
    "Delete?",
    "",
    [
      {
        text: "Keep",
        style: "cancel",
        onPress: () => {
          calls.push("cancel");
        },
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          calls.push("delete");
        },
      },
    ],
    {
      onDismiss: () => {
        calls.push("dismiss");
      },
    },
  );
  h.queue.dismiss(h.current()!.id, "account-a");
  assert.deepEqual(calls, ["cancel", "dismiss"]);
});
test("account changes discard queued choices and reject late callbacks", () => {
  const h = harness();
  let executed = false;
  h.queue.show("account-a", "Private action", "", [
    {
      text: "Confirm",
      onPress: () => {
        executed = true;
      },
    },
  ]);
  const previous = h.current()!.id;
  h.queue.setScope("account-b");
  h.queue.choose(previous, 0, "account-b");
  h.queue.show("account-a", "Late private action");
  assert.equal(h.current(), null);
  assert.equal(executed, false);
  h.queue.show("account-b", "New account");
  assert.equal(h.current()!.title, "New account");
});
test("queued dialogs preserve order, invalid actions cannot dismiss and failures are reported", async () => {
  const h = harness();
  h.queue.show(
    "account-a",
    "First",
    "",
    [
      {
        text: "Run",
        onPress: async () => {
          throw new Error("failed");
        },
      },
    ],
    { cancelable: false },
  );
  h.queue.show("account-a", "Second");
  const first = h.current()!.id;
  h.queue.dismiss(first, "account-a");
  h.queue.choose(first, 99, "account-a");
  assert.equal(h.current()!.title, "First");
  h.queue.choose(first, 0, "account-a");
  assert.equal(h.current()!.title, "Second");
  await Promise.resolve();
  assert.equal(h.errors.length, 1);
  h.queue.clear();
  assert.equal(h.current(), null);
});
