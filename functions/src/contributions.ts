import { assert, Doc, text } from "./policy";

/** Recomputed only by trusted mutation handlers, never accepted from client input. */
export function contributorIds(post: Doc): string[] {
  return [
    ...new Set<string>([
      ...Object.keys(post.votes || {}),
      ...(post.comments || []).map((comment: Doc) => comment.authorId),
      ...(post.poll?.options || []).flatMap(
        (option: Doc) => option.voterIds || [],
      ),
    ]),
  ].filter((value) => typeof value === "string" && value.length > 0);
}

export function withContributors(post: Doc): Doc {
  const result = { ...post, contributorIds: contributorIds(post) };
  assert(
    result.contributorIds.length <= 5000 &&
      Buffer.byteLength(JSON.stringify(result), "utf8") < 800_000,
    "resource-exhausted",
    "This discussion has reached its activity limit. Start a related discussion.",
  );
  return result;
}

/** Account exports expose the caller's contributions without other members' text or votes. */
export function projectContribution(post: Doc, uid: string): Doc | undefined {
  const comments = (post.comments || [])
    .filter((comment: Doc) => comment.authorId === uid)
    .map((comment: Doc) => ({
      id: comment.id,
      authorId: uid,
      body: comment.body,
      createdAt: comment.createdAt,
    }));
  const vote = post.votes?.[uid];
  const pollOptionIds = (post.poll?.options || [])
    .filter((option: Doc) => option.voterIds?.includes(uid))
    .map((option: Doc) => option.id);
  if (!comments.length && vote === undefined && !pollOptionIds.length) return;
  return {
    postId: post.id,
    communityId: post.communityId,
    comments,
    ...(vote === undefined ? {} : { vote }),
    pollOptionIds,
  };
}

export function exportCursor(value: unknown): string {
  const cursor = text(value, "Export cursor", 512);
  assert(
    !/[\\/]/.test(cursor) && cursor !== "." && cursor !== "..",
    "invalid-argument",
    "Invalid export cursor.",
  );
  return cursor;
}
