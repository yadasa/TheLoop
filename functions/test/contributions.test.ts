import test from "node:test";
import assert from "node:assert/strict";
import {
  contributorIds,
  exportCursor,
  projectContribution,
  withContributors,
} from "../src/contributions";
import { scrubPost } from "../src/cleanup";
import { DomainError } from "../src/policy";

test("contributor IDs are derived from actual comments, votes and poll choices", () => {
  const post = {
    authorId: "author",
    votes: { voter: 1 },
    comments: [{ authorId: "commenter" }, { authorId: "voter" }],
    poll: { options: [{ voterIds: ["poll-voter", "voter"] }] },
  };
  assert.deepEqual(contributorIds(post).sort(), [
    "commenter",
    "poll-voter",
    "voter",
  ]);
  assert.equal(
    withContributors({
      ...post,
      contributorIds: ["forged"],
    }).contributorIds.includes("forged"),
    false,
  );
});
test("contribution projection excludes another member’s text, votes and poll selection", () => {
  const post = {
    id: "post",
    communityId: "builders",
    title: "Another member’s title",
    body: "Another member’s body",
    votes: { me: -1, other: 1 },
    comments: [
      {
        id: "c1",
        authorId: "me",
        body: "My comment",
        createdAt: "2026-10-26T12:00:00Z",
      },
      {
        id: "c2",
        authorId: "other",
        body: "Their private export data",
        createdAt: "2026-10-26T13:00:00Z",
      },
    ],
    poll: {
      options: [
        { id: "o1", label: "Other authored option", voterIds: ["me"] },
        { id: "o2", voterIds: ["other"] },
      ],
    },
  };
  assert.deepEqual(projectContribution(post, "me"), {
    postId: "post",
    communityId: "builders",
    comments: [
      {
        id: "c1",
        authorId: "me",
        body: "My comment",
        createdAt: "2026-10-26T12:00:00Z",
      },
    ],
    vote: -1,
    pollOptionIds: ["o1"],
  });
  assert.equal(projectContribution(post, "unrelated"), undefined);
});
test("deletion removes contributor-index references and preserves other people’s contributions", () => {
  const post = withContributors({
    id: "post",
    votes: { me: 1, other: 1 },
    comments: [{ authorId: "other", body: "Keep" }],
  });
  const patch = scrubPost(post, "me")!;
  assert.deepEqual(patch.contributorIds, ["other"]);
  assert.equal(projectContribution({ ...post, ...patch }, "me"), undefined);
  const stale = scrubPost(
    { comments: [], votes: {}, contributorIds: ["me"] },
    "me",
  )!;
  assert.deepEqual(stale.contributorIds, []);
});
test("export cursors support directional relationship IDs without allowing resource paths", () => {
  assert.equal(exportCursor("alice~bob"), "alice~bob");
  assert.equal(exportCursor("post-request-123"), "post-request-123");
  for (const value of ["../users/admin", "users\\admin", "", ".", ".."])
    assert.throws(() => exportCursor(value), DomainError);
});
test("post activity is bounded below Firestore’s document and index limits", () => {
  assert.throws(
    () =>
      withContributors({
        votes: Object.fromEntries(
          Array.from({ length: 5001 }, (_, index) => [`user${index}`, 1]),
        ),
      }),
    /activity limit/,
  );
  assert.throws(
    () => withContributors({ body: "x".repeat(800_001) }),
    /activity limit/,
  );
});
