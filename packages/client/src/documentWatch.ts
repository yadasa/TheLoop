export type DocumentStatus = { id: string | null; loading: boolean; notFound: boolean; error: string | null };
export type DocumentUpdate<T> = { record: T | undefined; status: DocumentStatus; fromCache: boolean };
const idle = (): DocumentStatus => ({ id: null, loading: false, notFound: false, error: null });

/** One scoped listener; a cache miss is not evidence that a shared link is gone. */
export class DocumentWatch<T extends { id: string }> {
  private generation = 0;
  private id: string | null = null;
  private off: (() => void) | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private options: {
    current(): boolean;
    subscribe(id: string, success: (record: T | undefined, fromCache: boolean) => void, failure: (error: unknown) => void): () => void;
    publish(update: DocumentUpdate<T>): void;
    describeError?(error: unknown): string;
    timeoutMs?: number;
  }) {}

  watch(id: string | null): void {
    if (!this.options.current() || (id === this.id && this.off)) return;
    this.generation++;
    this.clearTimer();
    this.off?.(); this.off = undefined;
    this.id = id;
    const generation = this.generation;
    if (!id) { this.options.publish({ record: undefined, status: idle(), fromCache: false }); return; }
    this.options.publish({ record: undefined, status: { id, loading: true, notFound: false, error: null }, fromCache: false });
    const current = () => this.options.current() && generation === this.generation && this.id === id;
    let serverExists: boolean | undefined;
    const failed = (error: unknown) => {
      if (!current()) return;
      this.clearTimer();
      this.off?.(); this.off = undefined;
      this.generation++;
      const message = this.options.describeError?.(error) ?? (error instanceof Error ? error.message : "This shared item could not be loaded. Try again.");
      this.options.publish({ record: undefined, fromCache: false, status: { id, loading: false, notFound: false, error: message } });
    };
    const waitForConfirmation = () => {
      if (!this.timer) this.timer = setTimeout(() => failed(new Error("This link could not be confirmed. Check your connection and try again.")), this.options.timeoutMs ?? 15000);
    };
    waitForConfirmation();
    this.off = () => {};
    try {
      const unsubscribe = this.options.subscribe(id, (record, fromCache) => {
        if (!current() || (record && record.id !== id)) return;
        if (!fromCache) serverExists = Boolean(record);
        const loading = fromCache && (record ? serverExists !== true : serverExists !== false);
        if (loading) waitForConfirmation(); else this.clearTimer();
        this.options.publish({ record, fromCache, status: { id, loading, notFound: !record && serverExists === false, error: null } });
      }, failed);
      if (current() && this.off) this.off = unsubscribe; else unsubscribe();
    } catch (error) { failed(error); }
  }

  stop(): void {
    this.generation++;
    this.clearTimer();
    this.off?.(); this.off = undefined; this.id = null;
    if (this.options.current()) this.options.publish({ record: undefined, status: idle(), fromCache: false });
  }
  private clearTimer(): void { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
}
