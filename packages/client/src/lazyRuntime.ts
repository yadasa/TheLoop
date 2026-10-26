/** A failed chunk load can be retried, while concurrent callers share one load. */
export function lazyRuntime<T>(importer: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    if (!pending) pending = Promise.resolve().then(importer).catch(error => { pending = undefined; throw error; });
    return pending;
  };
}

/** Cancellation is checked before persistence and again before SDK initialization. */
export async function resolveLiveRuntime<T, P>(options: {
  load(): Promise<T>;
  prepare(runtime: T): P | Promise<P>;
  current(): boolean;
}): Promise<{ runtime: T; prepared: P } | undefined> {
  const runtime = await options.load();
  if (!options.current()) return undefined;
  const prepared = await options.prepare(runtime);
  return options.current() ? { runtime, prepared } : undefined;
}
