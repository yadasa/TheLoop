/** Coalesce draft mutations without notifying React from a read-time privacy prune. */
export class DraftChanges {
  private revision = 0;
  private queued = false;
  private listeners = new Set<() => void>();
  getSnapshot = () => this.revision;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  changed = () => {
    ++this.revision;
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      for (const listener of this.listeners) listener();
    });
  };
}
