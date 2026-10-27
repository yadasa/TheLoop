/** Tracks full-screen photos, including overlapping viewers during navigation. */
export class MediaVisibility {
  private viewers = new Set<symbol>();
  private listeners = new Set<() => void>();
  getSnapshot = () => this.viewers.size > 0;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  open() {
    const key = Symbol("photo");
    const wasOpen = this.getSnapshot();
    this.viewers.add(key);
    if (!wasOpen) this.emit();
    return () => {
      if (this.viewers.delete(key) && !this.getSnapshot()) this.emit();
    };
  }
  private emit() {
    for (const listener of this.listeners) listener();
  }
}
export const mediaVisibility = new MediaVisibility();
