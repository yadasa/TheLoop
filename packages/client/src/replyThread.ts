import type { Message } from "@theloop/core";
import type { MessageCursor } from "./data";
import { MessagePages } from "./messagePages";

export type ReplyThreadState = {
  parent: Message | null;
  parentLoaded: boolean;
  replies: Message[];
  loading: boolean;
  hasMore: boolean;
};
export type ReplyThreadHandle = { close(): void; loadMore(): Promise<void> };
export const emptyReplyThread = (): ReplyThreadState => ({
  parent: null,
  parentLoaded: false,
  replies: [],
  loading: true,
  hasMore: false,
});

/** One direct-reply branch. Nested branches retain their own parent identity. */
export class ReplyThread implements ReplyThreadHandle {
  private active = true;
  private parent: Message | null = null;
  private parentLoaded = false;
  private rows: Message[] = [];
  private history = { loading: true, hasMore: false };
  private offParent: () => void = () => {};
  private pages: MessagePages<Message>;
  constructor(
    private options: {
      channelId: string;
      messageId: string;
      subscribeParent(
        next: (parent: Message | null) => void,
        fail: (error: unknown) => void,
      ): () => void;
      subscribeReplies(
        cursor: MessageCursor | undefined,
        next: (rows: Message[]) => void,
        fail: (error: unknown) => void,
      ): () => void;
      visible(message: Message): boolean;
      publish(state: ReplyThreadState): void;
      failure(error: unknown): void;
    },
  ) {
    this.pages = new MessagePages({
      subscribe: options.subscribeReplies,
      publish: (rows, history) => {
        this.rows = rows;
        this.history = history;
        this.publish();
      },
      failure: (error) => this.fail(error),
    });
  }
  start() {
    if (!this.active) return;
    this.offParent = this.options.subscribeParent(
      (parent) => {
        if (!this.active) return;
        this.parent =
          parent?.id === this.options.messageId &&
          parent.channelId === this.options.channelId
            ? parent
            : null;
        this.parentLoaded = true;
        this.publish();
      },
      (error) => this.fail(error),
    );
    if (!this.active) this.offParent();
    if (this.active) this.pages.start();
  }
  private publish() {
    if (!this.active) return;
    const parent =
      this.parent && this.options.visible(this.parent) ? this.parent : null;
    this.options.publish({
      parent,
      parentLoaded: this.parentLoaded,
      ...this.history,
      replies: parent
        ? this.rows.filter(
            (row) =>
              row.channelId === parent.channelId &&
              row.replyTo === parent.id &&
              row.topic === parent.topic &&
              this.options.visible(row),
          )
        : [],
    });
  }
  private fail(error: unknown) {
    if (!this.active) return;
    this.close();
    this.options.failure(error);
  }
  loadMore() {
    return this.active ? this.pages.loadMore() : Promise.resolve();
  }
  close() {
    if (!this.active) return;
    this.active = false;
    this.offParent();
    this.pages.stop();
    this.rows = [];
    this.parent = null;
  }
}
