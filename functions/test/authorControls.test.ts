import test from "node:test";
import assert from "node:assert/strict";
import { commandFields, editablePost } from "../src/authorControls";
import { DomainError } from "../src/policy";

test("post edits allow only display content and never identity, votes, community, or poll changes", () => {
  for (const key of [
    "authorId",
    "communityId",
    "kind",
    "votes",
    "comments",
    "poll",
    "createdAt",
    "contributorIds",
  ])
    assert.throws(
      () => editablePost({ [key]: "forged" }, "discussion"),
      DomainError,
    );
  assert.throws(
    () =>
      commandFields({ type: "comment.edit", authorId: "forged" }, [
        "type",
        "postId",
        "commentId",
        "body",
      ]),
    DomainError,
  );
  assert.throws(() => editablePost({}, "discussion"), DomainError);
});
test("post edits safely clear optional links and validate text and HTTPS links", () => {
  assert.deepEqual(editablePost({ url: "" }, "discussion"), {
    patch: {},
    removeUrl: true,
  });
  assert.equal(
    editablePost({ title: " A clearer title " }, "discussion").patch.title,
    "A clearer title",
  );
  assert.deepEqual(editablePost({ body: "" }, "poll").patch, { body: "" });
  assert.throws(() => editablePost({ body: "" }, "discussion"), DomainError);
  assert.throws(
    () => editablePost({ url: "javascript:alert(1)" }, "link"),
    DomainError,
  );
});
