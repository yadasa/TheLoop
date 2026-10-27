import type {
  DirectMessage,
  ImageAttachment,
  LoopState,
  SquadMessage,
} from "@theloop/core";
import type { SearchRequest } from "./historySearch";
import { matchesMessageSearch } from "./historySearch";

export type PrivateHistoryRequest = SearchRequest & {
  kind: "dm" | "squad";
  id: string;
};
export type PrivateSearchHit = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName?: string;
  authorInitials?: string;
  image?: ImageAttachment;
};

export function canSearchPrivate(
  state: LoopState,
  target: Pick<PrivateHistoryRequest, "kind" | "id">,
): boolean {
  if (!state.currentUserId || !target.id) return false;
  if (target.kind === "dm")
    return (
      target.id !== state.currentUserId &&
      !state.preferences.blockedIds.includes(target.id)
    );
  return state.squads.some(
    (squad) =>
      squad.id === target.id &&
      !squad.archived &&
      squad.memberIds.includes(state.currentUserId),
  );
}

/** Recheck the current audience before exposing even a historical search result. */
export function privateHistoryHits(
  rows: (DirectMessage | SquadMessage)[],
  request: PrivateHistoryRequest,
  state: LoopState,
): PrivateSearchHit[] {
  if (!canSearchPrivate(state, request)) return [];
  const uid = state.currentUserId;
  return rows.flatMap((row) => {
    if (
      typeof row.body !== "string" ||
      !matchesMessageSearch(row, request.query)
    )
      return [];
    if (request.kind === "dm") {
      if (
        !("fromId" in row) ||
        !(
          (row.fromId === uid && row.toId === request.id) ||
          (row.toId === uid && row.fromId === request.id)
        )
      )
        return [];
      if (
        row.participantIds &&
        (!row.participantIds.includes(uid) ||
          !row.participantIds.includes(request.id))
      )
        return [];
      return [
        {
          id: row.id,
          body: row.body,
          createdAt: row.createdAt,
          authorId: row.fromId,
          authorName: row.fromName,
          authorInitials: row.fromInitials,
          ...(row.image ? { image: row.image } : {}),
        },
      ];
    }
    if (
      !("squadId" in row) ||
      row.squadId !== request.id ||
      !row.audienceIds?.includes(uid) ||
      state.preferences.blockedIds.includes(row.authorId)
    )
      return [];
    return [
      {
        id: row.id,
        body: row.body,
        createdAt: row.createdAt,
        authorId: row.authorId,
        authorName: row.authorName,
        authorInitials: row.authorInitials,
        ...(row.image ? { image: row.image } : {}),
      },
    ];
  });
}
