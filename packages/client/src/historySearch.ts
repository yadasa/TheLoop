import type { LoopState, Message } from "@theloop/core";
import type { MessageCursor } from "./data";

export type HistorySearchRequest = {
  channelId: string;
  query: string;
  topic?: string;
  cursor?: MessageCursor;
};
export type SearchRecord = { id: string; body: string; createdAt: string };
export type SearchRequest = { query: string; cursor?: MessageCursor };
export type HistorySearchPage<Row extends SearchRecord = Message> = {
  matches: Row[];
  scanned: number;
  cursor?: MessageCursor;
  hasMore: boolean;
};
export type HistorySearchState<Row extends SearchRecord = Message> = {
  matches: Row[];
  scanned: number;
  hasMore: boolean;
  loading: boolean;
  started: boolean;
  error: string | null;
};
export const emptyHistorySearch = <
  Row extends SearchRecord = Message,
>(): HistorySearchState<Row> => ({
  matches: [],
  scanned: 0,
  hasMore: false,
  loading: false,
  started: false,
  error: null,
});

export function normalizeMessageSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
export function validMessageSearch(value: string): boolean {
  const length = Array.from(normalizeMessageSearch(value)).length;
  return length >= 2 && length <= 100;
}
export function matchesMessageSearch(
  message: Pick<SearchRecord, "body">,
  query: string,
): boolean {
  const needle = normalizeMessageSearch(query);
  return (
    validMessageSearch(needle) &&
    normalizeMessageSearch(message.body).includes(needle)
  );
}
export function canSearchChannel(state: LoopState, channelId: string): boolean {
  const channel = state.channels.find((channel) => channel.id === channelId);
  return (
    !!state.currentUserId &&
    !!channel &&
    (channel.visibility === "public" ||
      !!channel.memberIds?.includes(state.currentUserId))
  );
}
export function filterHistoryResults(
  rows: Message[],
  request: HistorySearchRequest,
  state: LoopState,
): Message[] {
  if (!canSearchChannel(state, request.channelId)) return [];
  return rows.filter(
    (message) =>
      message.channelId === request.channelId &&
      typeof message.body === "string" &&
      (request.topic === undefined
        ? state.preferences.subscriptions[
            `${message.channelId}:${message.topic}`
          ] !== "hidden"
        : message.topic === request.topic) &&
      !state.preferences.blockedIds.includes(message.authorId) &&
      matchesMessageSearch(message, request.query),
  );
}

/** Search progressively without attaching live listeners or reading an unbounded archive. */
export class HistorySearch<
  Request extends SearchRequest = HistorySearchRequest,
  Row extends SearchRecord = Message,
> {
  private generation = 0;
  private request: Request | null = null;
  private cursor: MessageCursor | undefined;
  private value = emptyHistorySearch<Row>();
  constructor(
    private options: {
      readPage(request: Request): Promise<HistorySearchPage<Row>>;
      publish(state: HistorySearchState<Row>): void;
      errorText(error: unknown): string;
    },
  ) {}
  private publish(patch: Partial<HistorySearchState<Row>>) {
    this.value = { ...this.value, ...patch };
    this.options.publish({ ...this.value, matches: [...this.value.matches] });
  }
  reset() {
    this.generation++;
    this.request = null;
    this.cursor = undefined;
    this.publish(emptyHistorySearch<Row>());
  }
  pause() {
    this.generation++;
    this.publish({ loading: false });
  }
  async start(request: Request) {
    this.reset();
    if (!validMessageSearch(request.query)) {
      this.publish({ error: "Enter between 2 and 100 characters to search." });
      return;
    }
    this.request = { ...request, query: normalizeMessageSearch(request.query) };
    this.publish({ started: true, hasMore: true });
    await this.more();
  }
  async more() {
    if (!this.request || this.value.loading || !this.value.hasMore) return;
    const generation = this.generation,
      request = this.request;
    this.publish({ loading: true, error: null });
    let added = 0;
    try {
      // One explicit action reads at most 300 records, then asks before continuing.
      for (let page = 0; page < 3; page++) {
        const result = await this.options.readPage({
          ...request,
          cursor: this.cursor,
        });
        if (generation !== this.generation) return;
        if (
          result.hasMore &&
          (!result.cursor ||
            (result.cursor.id === this.cursor?.id &&
              result.cursor.createdAt === this.cursor?.createdAt))
        ) {
          throw new Error("Search could not advance. Start the search again.");
        }
        const merged = new Map(
          this.value.matches.map((message) => [message.id, message]),
        );
        for (const message of result.matches) {
          if (!merged.has(message.id)) added++;
          merged.set(message.id, message);
        }
        this.cursor = result.cursor;
        this.publish({
          matches: [...merged.values()],
          scanned: this.value.scanned + result.scanned,
          hasMore: result.hasMore,
        });
        if (!result.hasMore || added >= 20) break;
      }
    } catch (error) {
      if (generation === this.generation)
        this.publish({ error: this.options.errorText(error) });
    } finally {
      if (generation === this.generation) this.publish({ loading: false });
    }
  }
}
