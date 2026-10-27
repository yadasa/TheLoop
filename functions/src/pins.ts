import type { TransactionStore } from "./service";
import { assert, type Doc } from "./policy";

export function pinnedIds(channel: Doc): string[] {
  return [
    ...new Set<string>(
      (Array.isArray(channel.pinnedMessageIds)
        ? channel.pinnedMessageIds
        : []
      ).filter(
        (value: unknown): value is string =>
          typeof value === "string" && value.length > 0 && !value.includes("/"),
      ),
    ),
  ].slice(0, 20);
}
export async function updatePins(
  store: TransactionStore,
  channel: Doc,
  messageId: string,
  pinned: boolean,
): Promise<void> {
  const existing = pinnedIds(channel);
  if (!pinned) {
    store.set(`channels/${channel.id}`, {
      ...channel,
      pinnedMessageIds: existing.filter((id) => id !== messageId),
    });
    return;
  }
  const message = await store.get(`messages/${messageId}`);
  assert(
    message?.channelId === channel.id,
    "not-found",
    "This message is no longer available in this group chat.",
  );
  const records = await Promise.all(
    existing.map((id) => store.get(`messages/${id}`)),
  );
  const valid = existing.filter(
    (id, index) => records[index]?.channelId === channel.id && id !== messageId,
  );
  assert(
    valid.length < 20,
    "resource-exhausted",
    "This group chat already has 20 pinned messages. Unpin one first.",
  );
  store.set(`channels/${channel.id}`, {
    ...channel,
    pinnedMessageIds: [messageId, ...valid],
  });
}
export async function removeMessagePin(
  store: TransactionStore,
  message: Doc,
): Promise<void> {
  if (!message.channelId) return;
  const channel = await store.get(`channels/${message.channelId}`);
  if (channel && pinnedIds(channel).includes(message.id))
    await updatePins(store, channel, message.id, false);
}
