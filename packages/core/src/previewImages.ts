import type {
  ImageAttachment,
  LoopState,
  MediaTarget,
  PreviewImage,
} from "./types";
type ImageLink = NonNullable<PreviewImage["linkedTo"]>;

/** Sample-mode binding follows the same owner, target and single-use contract as the server. */
export function bindPreviewImage(
  s: LoopState,
  id: string,
  target: MediaTarget,
  linkedTo: ImageLink,
  now: string,
): ImageAttachment {
  const entry = s.previewImages?.[id];
  if (
    !entry ||
    entry.image.id !== id ||
    entry.ownerId !== s.currentUserId ||
    entry.linkedTo ||
    entry.target.kind !== target.kind ||
    entry.target.id !== target.id ||
    !Number.isFinite(Date.parse(entry.createdAt)) ||
    Date.parse(entry.createdAt) - Date.parse(now) > 60000 ||
    Date.parse(now) - Date.parse(entry.createdAt) > 3600000
  )
    throw new Error("Choose a fresh image uploaded for this conversation.");
  entry.linkedTo = linkedTo;
  return { ...entry.image };
}

/** Current scope still governs cached private image bytes, including after leave or block. */
export function canReadPreviewImage(
  s: LoopState,
  entry: PreviewImage,
): boolean {
  const uid = s.currentUserId;
  if (!uid) return false;
  const link = entry.linkedTo;
  if (!link) return entry.ownerId === uid;
  if (link.kind === "profile") {
    const profile = s.profiles.find(
      (p) => p.id === link.id && p.image?.id === entry.image.id,
    );
    return (
      !!profile &&
      !s.preferences.blockedIds.includes(profile.id) &&
      (profile.id === uid ||
        profile.visibility === "public" ||
        s.connections.some(
          (c) =>
            c.status === "accepted" &&
            [c.fromId, c.toId].includes(uid) &&
            [c.fromId, c.toId].includes(profile.id),
        ))
    );
  }
  if (link.kind === "message") {
    const m = s.messages.find(
      (x) => x.id === link.id && x.image?.id === entry.image.id,
    );
    if (!m || s.preferences.blockedIds.includes(m.authorId)) return false;
    const channel = s.channels.find((c) => c.id === m.channelId);
    return (
      !!channel &&
      (channel.visibility === "public" ||
        channel.memberIds?.includes(uid) === true)
    );
  }
  if (link.kind === "squadMessage") {
    const m = s.squadMessages.find(
      (x) => x.id === link.id && x.image?.id === entry.image.id,
    );
    return (
      !!m &&
      !s.preferences.blockedIds.includes(m.authorId) &&
      m.audienceIds.includes(uid) &&
      s.squads.some(
        (g) => g.id === m.squadId && !g.archived && g.memberIds.includes(uid),
      )
    );
  }
  if (link.kind === "directMessage") {
    const m = s.directMessages.find(
      (x) => x.id === link.id && x.image?.id === entry.image.id,
    );
    return (
      !!m &&
      [m.fromId, m.toId].includes(uid) &&
      ![m.fromId, m.toId].some(
        (id) => id !== uid && s.preferences.blockedIds.includes(id),
      )
    );
  }
  const p = s.posts.find(
    (x) => x.id === link.id && x.image?.id === entry.image.id,
  );
  return (
    !!p &&
    !s.preferences.blockedIds.includes(p.authorId) &&
    s.communities.some((c) => c.id === p.communityId)
  );
}

export function prunePreviewImages(s: LoopState, now: string): void {
  for (const [id, entry] of Object.entries(s.previewImages ?? {})) {
    const link = entry.linkedTo;
    const exists =
      link?.kind === "message"
        ? s.messages.some((m) => m.id === link.id && m.image?.id === id)
        : link?.kind === "squadMessage"
          ? s.squadMessages.some((m) => m.id === link.id && m.image?.id === id)
          : link?.kind === "directMessage"
            ? s.directMessages.some(
                (m) => m.id === link.id && m.image?.id === id,
              )
            : link?.kind === "profile"
              ? s.profiles.some((p) => p.id === link.id && p.image?.id === id)
              : link?.kind === "post"
                ? s.posts.some((p) => p.id === link.id && p.image?.id === id)
                : Date.parse(now) - Date.parse(entry.createdAt) <= 3600000;
    if (!exists) delete s.previewImages![id];
  }
}
