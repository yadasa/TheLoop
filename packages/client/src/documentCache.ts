import type { DocumentUpdate } from "./documentWatch";

export type DocumentRead = { ids: Set<string>; changed: Set<string> };
export function updateEventBuckets<T extends { id: string; endAt: string }>(future: T[], past: T[], record: T, boundary: string): { future: T[]; past: T[] } {
  return {
    future: future.map(event => event.id === record.id ? record : event).filter(event => event.endAt >= boundary),
    past: past.map(event => event.id === record.id ? record : event).filter(event => event.endAt < boundary),
  };
}
/** One selected overlay with session-scoped deletion protection. Raw catalog
 * copies must also be removed when a deletion is confirmed. */
export class DocumentCache<T extends { id: string }> {
  private id: string | null = null;
  private record: T | undefined;
  private missing = new Set<string>();
  private reads = new Set<DocumentRead>();
  constructor(private missingLimit = 4096) {}

  select(id: string | null): void { if (this.id !== id) { this.id = id; this.record = undefined; } }
  apply(update: DocumentUpdate<T>): DocumentUpdate<T> {
    const id = update.status.id;
    if (id !== this.id) return update;
    this.record = undefined;
    if (!id) return update;
    if (update.record) {
      if (update.fromCache && this.missing.has(id)) return { ...update, record: undefined, status: { ...update.status, loading: true, notFound: false } };
      this.record = update.record;
      if (!update.fromCache) { this.missing.delete(id); this.changed(id); }
    } else if (update.status.notFound && !update.fromCache) this.markMissing(id);
    return update;
  }
  markMissing(id: string): void {
    this.changed(id);
    this.missing.delete(id); this.missing.add(id);
    while (this.missing.size > this.missingLimit) this.missing.delete(this.missing.values().next().value!);
    if (this.id === id) this.record = undefined;
  }
  isMissing(id: string): boolean { return this.missing.has(id); }
  private changed(id: string): void { for (const read of this.reads) if (read.ids.has(id)) read.changed.add(id); }

  beginRead(ids: string[]): DocumentRead {
    const read = { ids: new Set(ids), changed: new Set<string>() }; this.reads.add(read); return read;
  }
  endRead(read: DocumentRead): void { this.reads.delete(read); }
  /** Fetches begun before a targeted update may not overwrite its fresher value. */
  mergeRead(destination: Map<string, T>, read: DocumentRead, records: T[], authoritative: boolean): string[] {
    const found = new Map(records.map(record => [record.id, record])), removed: string[] = [];
    for (const id of read.ids) {
      if (read.changed.has(id)) continue;
      const record = found.get(id);
      if (!record && !authoritative) continue;
      destination.delete(id);
      if (record && !this.missing.has(id)) destination.set(id, record);
      else if (!record && authoritative) { this.markMissing(id); removed.push(id); }
    }
    return removed;
  }
  merge(buckets: Iterable<T[]>): T[] {
    const records = new Map<string, T>();
    for (const bucket of buckets) for (const record of bucket) if (!this.missing.has(record.id)) records.set(record.id, record);
    if (this.record && !this.missing.has(this.record.id)) records.set(this.record.id, this.record);
    return [...records.values()];
  }
  clear(): void { this.id = null; this.record = undefined; this.missing.clear(); this.reads.clear(); }
}
