import test from "node:test";
import assert from "node:assert/strict";
import { emptyState } from "@theloop/core";
import {
  PostDrafts,
  defaultPollChoices,
  postDraftTarget,
  type PostDraft,
} from "../apps/mobile/src/postDrafts";
import { ImageDrafts } from "../apps/mobile/src/imageDrafts";
const draft: PostDraft = {
  communityId: "builders",
  kind: "poll",
  title: "Monday plans?",
  body: "Where should we meet?",
  url: "",
  options: "Coffee\nDinner",
};
test("post draft restores all fields, copies values and clears on an account change", () => {
  const book = new PostDrafts("me");
  book.remember("me", draft);
  assert.deepEqual(book.read("me"), draft);
  const copy = book.read("me")!;
  copy.title = "Changed outside the composer";
  assert.equal(book.read("me")?.title, draft.title);
  assert.equal(book.read("another"), undefined);
  assert.equal(book.read("me"), undefined);
  book.remember("another", draft);
  assert.equal(book.read("me"), undefined);
});
test("empty forms don't create drafts but photo-only drafts retain their destination", () => {
  const book = new PostDrafts("me");
  const empty = { ...draft, title: "", body: "", options: defaultPollChoices };
  book.remember("me", empty);
  assert.equal(book.read("me"), undefined);
  book.remember("me", { ...empty, hasImage: true });
  assert.equal(book.read("me")?.communityId, "builders");
  book.remember("me", { ...draft, body: "x".repeat(6000) });
  assert.equal(book.read("me")?.body.length, 5000);
  book.clear();
  assert.equal(book.read("me"), undefined);
});
test("post photos survive navigation but are disposed on sign-out with other photo drafts", () => {
  const state = emptyState("me"),
    disposed: string[] = [];
  const images = new ImageDrafts("me", (photo) => disposed.push(photo.uri));
  const photo = {
    uri: "file:///app-created-post.webp",
    width: 5,
    height: 5,
    bytes: new Uint8Array(10),
  };
  images.remember(postDraftTarget, photo, state);
  assert.equal(images.read(postDraftTarget, state)?.uri, photo.uri);
  assert.equal(
    images.read({ ...postDraftTarget, id: "unexpected" }, state),
    null,
  );
  images.prune({ ...state, currentUserId: "another" });
  assert.equal(images.read(postDraftTarget, state), null);
  assert.deepEqual(disposed, [photo.uri]);
});
