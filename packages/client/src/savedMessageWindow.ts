import type { Channel, Message, SavedMessage } from "@theloop/core";

export type SavedMessageRow = {
  reference: SavedMessage;
  status: "loading" | "ready" | "unavailable" | "error";
  channel?: Channel;
  message?: Message;
};
type Stop = () => void;
type Group = {
  ids: string[];
  channel?: Channel;
  messages: Message[];
  status: SavedMessageRow["status"];
  revision: number;
  stopChannel?: Stop;
  stopMessages?: Stop;
};
type Options = {
  references: SavedMessage[];
  userId: string;
  visible(channel: Channel, message: Message): boolean;
  subscribeChannel(
    id: string,
    next: (channel: Channel | null) => void,
    error: () => void,
  ): Stop;
  subscribeMessages(
    channelId: string,
    ids: string[],
    next: (messages: Message[]) => void,
    error: () => void,
  ): Stop;
  publish(rows: SavedMessageRow[]): void;
};

/** A bounded page watches source records; saved references never contain copied message bodies. */
export class SavedMessageWindow {
  private closed = false;
  private started = false;
  private groups = new Map<string, Group>();
  constructor(private options: Options) {
    if (options.references.length > 20)
      throw new Error("Open up to 20 saved messages at a time.");
    for (const reference of options.references) {
      const group: Group = this.groups.get(reference.channelId) || {
        ids: [],
        messages: [],
        status: "loading",
        revision: 0,
      };
      group.ids.push(reference.messageId);
      this.groups.set(reference.channelId, group);
    }
  }
  start() {
    if (this.closed || this.started) return;
    this.started = true;
    this.emit();
    for (const [id, group] of this.groups) {
      if (this.closed) break;
      const stop = this.options.subscribeChannel(
        id,
        (channel) => {
          if (this.closed) return;
          group.revision++;
          group.stopMessages?.();
          group.stopMessages = undefined;
          group.messages = [];
          group.channel = channel || undefined;
          if (
            !channel ||
            (channel.visibility !== "public" &&
              !channel.memberIds?.includes(this.options.userId))
          ) {
            group.status = "unavailable";
            group.channel = undefined;
            this.emit();
            return;
          }
          group.status = "loading";
          this.emit();
          if (this.closed) return;
          const revision = group.revision;
          const stopMessages = this.options.subscribeMessages(
            id,
            group.ids,
            (messages) => {
              if (this.closed || revision !== group.revision) return;
              group.messages = messages.filter(
                (message) =>
                  message.channelId === id && group.ids.includes(message.id),
              );
              group.status = "ready";
              this.emit();
            },
            () => {
              if (!this.closed && revision === group.revision) {
                group.revision++;
                group.stopMessages?.();
                group.stopMessages = undefined;
                group.messages = [];
                group.status = "error";
                this.emit();
              }
            },
          );
          if (this.closed || revision !== group.revision) stopMessages();
          else group.stopMessages = stopMessages;
        },
        () => {
          if (this.closed) return;
          group.revision++;
          group.stopMessages?.();
          group.stopMessages = undefined;
          group.channel = undefined;
          group.messages = [];
          group.status = "error";
          this.emit();
        },
      );
      if (this.closed) stop();
      else group.stopChannel = stop;
    }
  }
  private emit() {
    if (this.closed) return;
    this.options.publish(
      this.options.references.map((reference) => {
        const group: Group = this.groups.get(reference.channelId)!;
        const message = group.messages.find(
          (item) => item.id === reference.messageId,
        );
        if (
          group.status === "ready" &&
          group.channel &&
          message &&
          this.options.visible(group.channel, message)
        )
          return {
            reference,
            status: "ready",
            channel: group.channel,
            message,
          };
        return {
          reference,
          status: group.status === "ready" ? "unavailable" : group.status,
        };
      }),
    );
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const group of this.groups.values()) {
      group.revision++;
      group.stopMessages?.();
      group.stopChannel?.();
      group.messages = [];
      group.channel = undefined;
    }
  }
}
