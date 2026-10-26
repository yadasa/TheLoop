import type { Channel, Message, Preferences, Profile } from "@theloop/core";

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
export function messageCursor(records: Message[]): MessageCursor | undefined {
  const oldest = [...records].sort((a, b) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0];
  return oldest && { createdAt: oldest.createdAt, id: oldest.id };
}
