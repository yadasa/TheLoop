import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, initialState, type Command } from "../src/index";
const ctx = { id: "new-post", now: "2026-10-26T16:00:00.000Z" };
const ownPost = () =>
  applyCommand(
    initialState(),
    {
      type: "post.create",
      communityId: "builders",
      kind: "discussion",
      title: "Our next conversation",
      body: "A thoughtful starting point.",
    },
    ctx,
  );

test("private reports capture only an accessible message excerpt", () => {
  const s = initialState();
  s.directMessages = [
    {
      id: "private-note",
      fromId: "nia",
      toId: "me",
      body: "A message with context.",
      createdAt: ctx.now,
      read: false,
    },
    {
      id: "other-note",
      fromId: "nia",
      toId: "maya",
      body: "Not part of this conversation.",
      createdAt: ctx.now,
      read: false,
    },
  ];
  const next = applyCommand(
    s,
    {
      type: "report.create",
      targetId: "private-note",
      targetType: "directMessage",
      reason: "Please review this message.",
    },
    ctx,
  );
  assert.deepEqual(next.reports[0].snapshot, {
    body: "A message with context.",
    authorId: "nia",
    capturedAt: ctx.now,
  });
  assert.throws(
    () =>
      applyCommand(
        s,
        {
          type: "report.create",
          targetId: "other-note",
          targetType: "directMessage",
          reason: "Cannot read this.",
        },
        ctx,
      ),
    /available to you/,
  );
  assert.equal(s.reports.length, 0);
});
test("scoped onboarding replacement mutes deselected follows and preserves explicit quiet choices", () => {
  const s = initialState();
  s.preferences.subscriptions["after-hours"] = "muted";
  s.preferences.subscriptions.wellness = "hidden";
  const next = applyCommand(
    s,
    {
      type: "onboarding.complete",
      interests: ["Design"],
      channelIds: ["the-lobby"],
      channelScopeIds: s.channels.map((c) => c.id),
      replaceChannels: true,
    },
    ctx,
  );
  assert.equal(next.preferences.subscriptions["career-moves"], "muted");
  assert.equal(next.preferences.subscriptions["the-lobby"], "following");
  assert.equal(next.preferences.subscriptions["after-hours"], "muted");
  assert.equal(next.preferences.subscriptions.wellness, "hidden");
  assert.equal(s.preferences.subscriptions["career-moves"], "following");
});
test("interest-only onboarding updates never erase channel subscriptions", () => {
  const s = initialState();
  const next = applyCommand(
    s,
    { type: "onboarding.complete", interests: ["Music"], channelIds: [] },
    ctx,
  );
  assert.deepEqual(next.preferences.subscriptions, s.preferences.subscriptions);
  assert.throws(
    () =>
      applyCommand(
        s,
        {
          type: "onboarding.complete",
          interests: [],
          channelIds: ["the-lobby"],
          channelScopeIds: ["wellness"],
          replaceChannels: true,
        },
        ctx,
      ),
    /scope/i,
  );
});
test("post authors can correct their content without changing ownership, votes or destination", () => {
  const s = ownPost();
  const next = applyCommand(
    s,
    {
      type: "post.edit",
      postId: "new-post",
      post: {
        title: "A clearer opening",
        body: "A little more context.",
        tags: ["Community"],
      },
    },
    ctx,
  );
  const p = next.posts.find((p) => p.id === "new-post")!;
  assert.equal(p.title, "A clearer opening");
  assert.equal(p.authorId, "me");
  assert.equal(p.communityId, "builders");
  assert.deepEqual(p.votes, {});
  assert.equal(p.editedAt, ctx.now);
  assert.throws(
    () =>
      applyCommand(
        s,
        {
          type: "post.edit",
          postId: "new-post",
          post: { authorId: "nia" },
        } as unknown as Command,
        ctx,
      ),
    /only the post text/i,
  );
  assert.throws(
    () =>
      applyCommand(
        s,
        {
          type: "post.edit",
          postId: "p1",
          post: { body: "An impersonation." },
        },
        ctx,
      ),
    /only the author/i,
  );
});
test("own post removal clears own bookmark and cannot remove another author’s thread", () => {
  let s = ownPost();
  s = applyCommand(s, { type: "post.save", postId: "new-post" }, ctx);
  const next = applyCommand(
    s,
    { type: "post.delete", postId: "new-post" },
    ctx,
  );
  assert.ok(!next.posts.some((p) => p.id === "new-post"));
  assert.ok(!next.preferences.savedPostIds.includes("new-post"));
  assert.throws(
    () => applyCommand(s, { type: "post.delete", postId: "p1" }, ctx),
    /only the author/i,
  );
});
test("reply authors retain correction and removal rights after leaving a community", () => {
  let s = applyCommand(
    ownPost(),
    { type: "post.comment", postId: "new-post", body: "My first thought." },
    { ...ctx, id: "my-comment" },
  );
  s.preferences.joinedCommunityIds = [];
  s = applyCommand(
    s,
    {
      type: "comment.edit",
      postId: "new-post",
      commentId: "my-comment",
      body: "A corrected thought.",
    },
    ctx,
  );
  assert.equal(
    s.posts.find((p) => p.id === "new-post")!.comments[0].body,
    "A corrected thought.",
  );
  s = applyCommand(
    s,
    { type: "comment.delete", postId: "new-post", commentId: "my-comment" },
    ctx,
  );
  assert.equal(s.posts.find((p) => p.id === "new-post")!.comments.length, 0);
  assert.throws(
    () =>
      applyCommand(
        s,
        { type: "comment.delete", postId: "p1", commentId: "c1" },
        ctx,
      ),
    /only the author/i,
  );
});
test("a reply report targets the reply and keeps its parent thread context", () => {
  const s = applyCommand(
    initialState(),
    {
      type: "report.create",
      targetId: "c1",
      targetType: "comment",
      postId: "p1",
      reason: "Please review this particular reply.",
    },
    { ...ctx, id: "reply-report" },
  );
  assert.equal(s.reports[0].postId, "p1");
  assert.equal(s.reports[0].targetId, "c1");
  assert.equal(s.posts.find((p) => p.id === "p1")!.comments.length, 1);
});
