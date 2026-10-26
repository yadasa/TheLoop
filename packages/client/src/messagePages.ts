import { messageCursor, type MessageCursor } from "./data";

type TimelineRecord = { id: string; createdAt: string };
type History = { loading: boolean; hasMore: boolean };
type Page<T> = { rows: T[]; cursor?: MessageCursor; full: boolean };

/** A live message window whose cancelled callbacks cannot publish into another scope. */
export class MessagePages<T extends TimelineRecord> {
  private generation = 0;
  private active = false;
  private desiredPages = 1;
  private pages = new Map<number, Page<T>>();
  private listeners = new Map<number, () => void>();
  private tickets = new Map<number, symbol>();
  private pending = new Set<number>();
  private requests = new Map<number, { resolve(): void; reject(error: unknown): void }>();

  constructor(private options: {
    subscribe(cursor: MessageCursor | undefined, success: (rows: T[]) => void, failure: (error: unknown) => void): () => void;
    publish(rows: T[], history: History): void;
    failure(error: unknown): void;
    pageSize?: number;
  }) {}

  start(): void {
    this.stop();
    this.active = true;
    this.desiredPages = 1;
    this.attach(0);
  }

  stop(): void {
    this.active = false;
    this.generation++;
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners.clear();
    this.tickets.clear();
    this.pages.clear();
    this.pending.clear();
    this.requests.forEach(request => request.resolve());
    this.requests.clear();
    this.publish();
  }

  loadMore(): Promise<void> {
    if (!this.active || this.pending.size) return Promise.resolve();
    const last = [...this.pages.entries()].sort(([a], [b]) => a - b).at(-1);
    if (!last?.[1].full || !last[1].cursor) return Promise.resolve();
    const page = last[0] + 1;
    this.desiredPages = page + 1;
    return new Promise<void>((resolve, reject) => {
      this.requests.set(page, { resolve, reject });
      this.attach(page, last[1].cursor);
    });
  }

  private publish(): void {
    const pages = [...this.pages.entries()].sort(([a], [b]) => b - a);
    const records = new Map<string, T>();
    for (const [, page] of pages) for (const row of page.rows) records.set(row.id, row);
    const rows = [...records.values()].sort((a, b) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const last = pages[0]?.[1];
    this.options.publish(rows, { loading: this.pending.size > 0, hasMore: last?.full ?? false });
  }

  private attach(page: number, cursor?: MessageCursor): void {
    if (!this.active || this.listeners.has(page)) return;
    const generation = this.generation, ticket = Symbol();
    this.tickets.set(page, ticket);
    this.pending.add(page);
    this.listeners.set(page, () => {});
    const current = () => this.active && generation === this.generation && this.tickets.get(page) === ticket;
    this.publish();
    const unsubscribe = this.options.subscribe(cursor, rows => {
      if (!current()) return;
      const nextCursor = messageCursor(rows) ?? cursor;
      const previous = this.pages.get(page)?.cursor;
      if (previous && (previous.createdAt !== nextCursor?.createdAt || previous.id !== nextCursor?.id)) {
        for (const [number, stop] of this.listeners) if (number > page) {
          stop();
          this.listeners.delete(number);
          this.tickets.delete(number);
          this.pages.delete(number);
          this.pending.delete(number);
        }
      }
      const full = rows.length === (this.options.pageSize ?? 100);
      this.pages.set(page, { rows, cursor: nextCursor, full });
      this.pending.delete(page);
      this.requests.get(page)?.resolve();
      this.requests.delete(page);
      if (!full || !nextCursor) {
        for (const [number, request] of this.requests) if (number > page) { request.resolve(); this.requests.delete(number); }
        this.desiredPages = Math.min(this.desiredPages, page + 1);
      }
      if (full && nextCursor && page + 1 < this.desiredPages) this.attach(page + 1, nextCursor);
      this.publish();
    }, error => {
      if (!current()) return;
      this.listeners.delete(page);
      this.tickets.delete(page);
      this.pages.delete(page);
      this.pending.delete(page);
      this.requests.get(page)?.reject(error);
      this.requests.delete(page);
      this.options.failure(error);
      if (this.active && generation === this.generation) this.publish();
    });
    // This also handles transports that deliver an initial callback synchronously.
    if (current()) this.listeners.set(page, unsubscribe);
    else unsubscribe();
  }
}
