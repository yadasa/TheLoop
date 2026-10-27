import type { LoopState } from "@theloop/core";
import { draftAllowed, type DraftTarget } from "./conversationDrafts";

export type ImageChoice = {
  uri: string;
  width: number;
  height: number;
  bytes: Uint8Array;
};
const key = (target: DraftTarget) =>
  JSON.stringify([
    target.kind,
    target.id,
    target.kind === "channel" ? target.topic : null,
  ]);

/** Owns only app-created image cache files. Never persists photos to shared storage. */
export class ImageDrafts {
  private entries = new Map<
    string,
    { target: DraftTarget; choice: ImageChoice }
  >();
  constructor(
    private accountId: string,
    private dispose: (choice: ImageChoice) => void,
    private limit = 10,
    private byteLimit = 10 * 1024 * 1024,
  ) {}
  private allowed(target: DraftTarget, state: LoopState) {
    return (
      state.currentUserId === this.accountId &&
      draftAllowed(state, target) &&
      (target.kind !== "channel" || typeof target.topic === "string")
    );
  }
  read(target: DraftTarget, state: LoopState): ImageChoice | null {
    return this.allowed(target, state)
      ? (this.entries.get(key(target))?.choice ?? null)
      : null;
  }
  remember(target: DraftTarget, choice: ImageChoice, state: LoopState) {
    this.prune(state);
    if (!this.allowed(target, state))
      throw new Error(
        "This draft is no longer available. Choose the photo again in a new draft.",
      );
    const previous = this.entries.get(key(target));
    const bytes =
      [...this.entries.values()].reduce(
        (sum, entry) => sum + entry.choice.bytes.byteLength,
        0,
      ) -
      (previous?.choice.bytes.byteLength ?? 0) +
      choice.bytes.byteLength;
    if (
      (!previous && this.entries.size >= this.limit) ||
      bytes > this.byteLimit
    )
      throw new Error(
        "You have photos waiting in several drafts. Send or remove one before adding another.",
      );
    this.entries.set(key(target), { target: { ...target }, choice });
    if (previous && previous.choice.uri !== choice.uri)
      this.dispose(previous.choice);
  }
  latestTopic(channelId: string, state: LoopState): string | undefined {
    return [...this.entries.values()]
      .reverse()
      .find(
        (entry) =>
          entry.target.kind === "channel" &&
          entry.target.id === channelId &&
          this.allowed(entry.target, state),
      )?.target.topic;
  }
  remove(target: DraftTarget) {
    const entry = this.entries.get(key(target));
    this.entries.delete(key(target));
    if (entry) this.dispose(entry.choice);
  }
  prune(state: LoopState) {
    for (const entry of this.entries.values())
      if (!this.allowed(entry.target, state)) this.remove(entry.target);
  }
  targets(state: LoopState): DraftTarget[] {
    return [...this.entries.values()]
      .reverse()
      .filter((entry) => this.allowed(entry.target, state))
      .map((entry) => ({ ...entry.target }));
  }
  clear() {
    for (const entry of this.entries.values()) this.dispose(entry.choice);
    this.entries.clear();
  }
}
