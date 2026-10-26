import { Doc } from "./policy";
import { contributorIds } from "./contributions";

export function scrubPost(post: Doc, uid: string): Doc | undefined {
  const comments = (post.comments || []).filter(
    (comment: Doc) => comment.authorId !== uid,
  );
  const votes = { ...post.votes };
  const hadVote = uid in votes;
  delete votes[uid];
  let pollChanged = false;
  const poll = post.poll
    ? {
        ...post.poll,
        options: post.poll.options.map((option: Doc) => {
          const voterIds = option.voterIds.filter(
            (value: string) => value !== uid,
          );
          if (voterIds.length !== option.voterIds.length) pollChanged = true;
          return { ...option, voterIds };
        }),
      }
    : undefined;
  if (
    comments.length === (post.comments || []).length &&
    !hadVote &&
    !pollChanged &&
    !(post.contributorIds || []).includes(uid)
  )
    return;
  const patch = { comments, votes, ...(poll ? { poll } : {}) };
  return { ...patch, contributorIds: contributorIds({ ...post, ...patch }) };
}
export function scrubReactions(message: Doc, uid: string): Doc | undefined {
  const reactions: Doc = {};
  let changed = false;
  for (const [emoji, voters] of Object.entries(message.reactions || {})) {
    const remaining = (voters as string[]).filter((value) => value !== uid);
    if (remaining.length !== (voters as string[]).length) changed = true;
    if (remaining.length) reactions[emoji] = remaining;
  }
  return changed ? { reactions } : undefined;
}
export function scrubCommunityOwner(community: Doc, uid: string): Doc {
  const moderatorIds = (community.moderatorIds || []).filter(
    (value: string) => value !== uid,
  );
  return {
    ...community,
    creatorId: "deleted-member",
    moderatorIds,
    needsModerator: moderatorIds.length === 0,
  };
}
