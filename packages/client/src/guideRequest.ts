import { fetchGuideEvents, type GuideEventFilters, type GuideEventsResult } from "@theloop/core";

export type GuideRequestState = GuideEventsResult & { loading: boolean; error: string | null };
export const emptyGuideResult = (limit = 50): GuideEventsResult => ({ events: [], count: 0, limit, bounded: false, skipped: 0 });

/** Public requests have their own lifecycle and never read account state or Firebase. */
export class GuideRequests {
  private generation = 0;
  private controller: AbortController | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private load = fetchGuideEvents) {}

  cancel(): void {
    this.generation++;
    this.controller?.abort();
    this.controller = undefined;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  start(filters: GuideEventFilters, publish: (state: GuideRequestState) => void): () => void {
    this.cancel();
    const generation = this.generation, controller = new AbortController();
    this.controller = controller;
    const empty = emptyGuideResult(filters.limit ?? 50);
    const current = () => generation === this.generation && !controller.signal.aborted;
    publish({ ...empty, loading: true, error: null });
    this.timer = setTimeout(() => {
      if (!current()) return;
      this.cancel();
      publish({ ...empty, loading: false, error: "The public Guide took too long. Try again." });
    }, 15000);
    void this.load(filters, { signal: controller.signal }).then(result => {
      if (!current()) return;
      if (this.timer) clearTimeout(this.timer);
      this.timer = undefined;
      publish({ ...result, loading: false, error: null });
    }, error => {
      if (!current()) return;
      if (this.timer) clearTimeout(this.timer);
      this.timer = undefined;
      publish({ ...empty, loading: false, error: error instanceof Error ? error.message.slice(0, 240) : "The public Guide could not be loaded. Try again." });
    });
    return () => { if (generation === this.generation) this.cancel(); };
  }
}
