import test from "node:test";
import assert from "node:assert/strict";
import { emptyState } from "@theloop/core";
import { DraftChanges } from "../apps/mobile/src/draftChanges";
import { ConversationDrafts } from "../apps/mobile/src/conversationDrafts";
import { ImageDrafts } from "../apps/mobile/src/imageDrafts";
import { PostDrafts, defaultPollChoices } from "../apps/mobile/src/postDrafts";

test("draft writes, photo removal, sends and discards refresh subscribers without a navigation event", async () => {
  const changes = new DraftChanges();
  const state = emptyState("me");
  const text = new ConversationDrafts("me", 50, changes.changed);
  const images = new ImageDrafts("me", () => {}, 10, 1024, changes.changed);
  const posts = new PostDrafts("me", changes.changed);
  const target = { kind: "dm" as const, id: "friend" };
  let renders = 0;
  const unsubscribe = changes.subscribe(() => ++renders);
  text.remember(target, { body: "Unsent" }, state);
  images.remember(
    target,
    { uri: "photo", width: 1, height: 1, bytes: new Uint8Array(4) },
    state,
  );
  assert.equal(renders, 0);
  await Promise.resolve();
  assert.equal(renders, 1); // One UI update for the whole synchronous operation.
  const revision = changes.getSnapshot();
  text.list(state);
  images.targets(state);
  text.remember(target, { body: "Unsent" }, state);
  assert.equal(changes.getSnapshot(), revision);
  text.remember(target, { body: "" }, state);
  images.remove(target);
  await Promise.resolve();
  assert.equal(renders, 2);
  assert.equal(text.list(state).length, 0);
  assert.equal(images.targets(state).length, 0);
  posts.remember("me", {
    communityId: "builders",
    kind: "discussion",
    title: "Draft",
    body: "",
    url: "",
    options: defaultPollChoices,
  });
  await Promise.resolve();
  assert.equal(renders, 3);
  posts.clear();
  await Promise.resolve();
  assert.equal(renders, 4);
  unsubscribe();
  changes.changed();
  await Promise.resolve();
  assert.equal(renders, 4);
});

test("privacy pruning notifies once and an empty book stays stable", async () => {
  const changes = new DraftChanges();
  const state = emptyState("me");
  const book = new ConversationDrafts("me", 50, changes.changed);
  book.remember({ kind: "dm", id: "friend" }, { body: "Draft" }, state);
  let notices = 0;
  changes.subscribe(() => ++notices);
  await Promise.resolve();
  state.preferences.blockedIds = ["friend"];
  assert.deepEqual(book.list(state), []);
  await Promise.resolve();
  assert.equal(notices, 2);
  const revision = changes.getSnapshot();
  book.list(state);
  book.clear();
  assert.equal(changes.getSnapshot(), revision);
});
