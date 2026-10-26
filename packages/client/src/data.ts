import type { Channel, Message, Preferences, Profile, Squad, SquadInvite, SquadMessage } from "@theloop/core";

/** The directory index and client queries use the same Unicode normalization. */
const normalizeDirectoryText = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(" ") ?? "";
export function normalizeDirectoryQuery(value: string): string { return Array.from(normalizeDirectoryText(value)).slice(0, 32).join(""); }

export function matchesDirectory(profile: Profile, value: string): boolean {
  const needle = normalizeDirectoryQuery(value);
  return !needle || [profile.name, profile.headline, profile.company, profile.location, ...profile.skills, ...profile.interests]
    .some(field => normalizeDirectoryText(field).includes(needle));
}

export function previewChannelIds(channels: Channel[], subscriptions: Preferences["subscriptions"], maximum = 30): Set<string> {
  return new Set([...channels].filter(channel => subscriptions[channel.id] !== "hidden")
    .sort((a, b) => Number(subscriptions[b.id] === "following") - Number(subscriptions[a.id] === "following") || a.id.localeCompare(b.id))
    .slice(0, maximum).map(channel => channel.id));
}

export function mergeMessages(buckets: Iterable<Message[]>, allowedChannelIds: ReadonlySet<string>): Message[] {
  const records = new Map<string, Message>();
  for (const bucket of buckets) for (const message of bucket)
    if (allowedChannelIds.has(message.channelId)) records.set(message.id, message);
  return [...records.values()].sort((a, b) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Firestore's in filter accepts at most 30 alternatives. */
export function documentIdBatches(ids: string[]): string[][] {
  const unique = [...new Set(ids)].filter(Boolean), batches: string[][] = [];
  for (let index = 0; index < unique.length; index += 30) batches.push(unique.slice(index, index + 30));
  return batches;
}

export type MessageCursor = { createdAt: string; id: string };
export function messageCursor(records: { id: string; createdAt: string }[]): MessageCursor | undefined {
  const oldest = [...records].sort((a, b) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0];
  return oldest && { createdAt: oldest.createdAt, id: oldest.id };
}

export function revokePrivateProfiles(caches: Iterable<Map<string, Profile>>, allowedPeerIds: ReadonlySet<string>, revokedIds: Set<string>): void {
  for (const cache of caches) for (const [id, profile] of cache) if (profile.visibility !== "public" && !allowedPeerIds.has(id)) {
    cache.delete(id);
    revokedIds.add(id);
  }
}

export function visibleSquadMessages(messages: SquadMessage[], squads: Squad[], userId: string): SquadMessage[] {
  const memberships = new Set(squads.filter(squad => !squad.archived && squad.memberIds.includes(userId)).map(squad => squad.id));
  return messages.filter(message => memberships.has(message.squadId) && message.audienceIds.includes(userId));
}

export function mergeSquadInvites(buckets: Iterable<SquadInvite[]>, userId: string, ownerSquadId?: string): SquadInvite[] {
  const invites = new Map<string, SquadInvite>();
  for (const bucket of buckets) for (const invite of bucket) {
    if (!invite.participantIds.includes(userId) && invite.squadId !== ownerSquadId) continue;
    const previous = invites.get(invite.id);
    // An accepted/declined snapshot must win over a still-pending copy from
    // another query while its removal event is in flight.
    if (previous && previous.status !== "pending" && invite.status === "pending") continue;
    if (!previous || (invite.respondedAt ?? invite.createdAt) >= (previous.respondedAt ?? previous.createdAt)) invites.set(invite.id, invite);
  }
  return [...invites.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
