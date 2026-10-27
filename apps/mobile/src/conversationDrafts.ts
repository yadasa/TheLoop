import type { LoopState, Message } from "@theloop/core";

export type DraftTarget = {
  kind: "channel" | "dm" | "squad";
  id: string;
  topic?: string;
};
export type ConversationDraft = {
  body: string;
  topic?: string;
  reply?: Message | null;
};
const key = (target: DraftTarget) =>
  JSON.stringify([
    target.kind,
    target.id,
    target.kind === "channel" ? target.topic : undefined,
  ]);

export function draftAllowed(state: LoopState, target: DraftTarget): boolean {
  if (!state.currentUserId) return false;
  if (target.kind === "dm")
    return !state.preferences.blockedIds.includes(target.id);
  if (target.kind === "squad")
    return state.squads.some(
      (squad) =>
        squad.id === target.id &&
        !squad.archived &&
        squad.memberIds.includes(state.currentUserId),
    );
  return state.channels.some(
    (channel) =>
      channel.id === target.id &&
      (channel.visibility === "public" ||
        channel.memberIds?.includes(state.currentUserId)),
  );
}

/** Memory-only: no account content is written to shared device storage. */
export class ConversationDrafts {
  private entries = new Map<
    string,
    { target: DraftTarget; value: ConversationDraft }
  >();
  constructor(
    private accountId: string,
    private limit = 50,
  ) {}
  read(target: DraftTarget, state: LoopState): ConversationDraft | undefined {
    this.prune(state);
    const draft =
      target.kind === "channel" && target.topic === undefined
        ? [...this.entries.values()]
            .reverse()
            .find(
              (entry) =>
                entry.target.kind === "channel" &&
                entry.target.id === target.id,
            )?.value
        : this.entries.get(key(target))?.value;
    return draft
      ? (JSON.parse(JSON.stringify(draft)) as ConversationDraft)
      : undefined;
  }
  remember(target: DraftTarget, value: ConversationDraft, state: LoopState) {
    if (state.currentUserId !== this.accountId || !draftAllowed(state, target))
      return;
    const slot =
      target.kind === "channel"
        ? { ...target, topic: value.topic ?? target.topic }
        : target;
    this.entries.delete(key(slot));
    if (!value.body && !value.reply) return;
    this.entries.set(key(slot), {
      target: slot,
      value: JSON.parse(JSON.stringify(value)) as ConversationDraft,
    });
    while (this.entries.size > this.limit)
      this.entries.delete(this.entries.keys().next().value!);
    this.prune(state);
  }
  prune(state: LoopState) {
    if (state.currentUserId !== this.accountId) {
      this.entries.clear();
      return;
    }
    for (const [id, entry] of this.entries) {
      if (!draftAllowed(state, entry.target)) {
        this.entries.delete(id);
        continue;
      }
      const reply = entry.value.reply;
      if (
        reply &&
        (state.preferences.blockedIds.includes(reply.authorId) ||
          entry.target.kind !== "channel" ||
          reply.channelId !== entry.target.id)
      )
        entry.value.reply = null;
    }
  }
  clear() {
    this.entries.clear();
  }
}
