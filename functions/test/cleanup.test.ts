import test from "node:test";
import assert from "node:assert/strict";
import { scrubCommunityOwner, scrubPost, scrubReactions } from "../src/cleanup";
test("deletion scrub removes only the disappearing member and remains idempotent", () => {
  const post = {
    comments: [
      { authorId: "deleted", body: "Mine" },
      { authorId: "other", body: "Keep this" },
    ],
    votes: { deleted: 1, other: -1 },
    poll: { options: [{ id: "one", voterIds: ["deleted", "other"] }] },
  };
  const patch = scrubPost(post, "deleted")!;
  assert.deepEqual(patch.comments, [{ authorId: "other", body: "Keep this" }]);
  assert.deepEqual(patch.votes, { other: -1 });
  assert.deepEqual(patch.poll.options[0].voterIds, ["other"]);
  assert.equal(scrubPost({ ...post, ...patch }, "deleted"), undefined);
});
test("reaction scrub preserves concurrent other-member reactions passed in the latest snapshot", () => {
  const latest = {
    reactions: {
      "🖤": ["deleted", "old-member", "new-member"],
      "🔥": ["new-member"],
      "👏": ["deleted"],
    },
  };
  assert.deepEqual(scrubReactions(latest, "deleted"), {
    reactions: { "🖤": ["old-member", "new-member"], "🔥": ["new-member"] },
  });
});
test("sole owner deletion explicitly marks the community as needing a moderator", () => {
  assert.equal(
    scrubCommunityOwner(
      { creatorId: "deleted", moderatorIds: ["deleted"] },
      "deleted",
    ).needsModerator,
    true,
  );
  assert.deepEqual(
    scrubCommunityOwner(
      { creatorId: "deleted", moderatorIds: ["deleted", "other"] },
      "deleted",
    ).moderatorIds,
    ["other"],
  );
});
