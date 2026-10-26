export class DirectReadIncomplete extends Error {
  constructor(readonly marked: number) {
    super(marked ? `Marked ${marked.toLocaleString("en-US")} messages read. Earlier unread messages remain; reopen this conversation to continue.` : "Read markers could not be completed. Reopen this conversation to try again.");
  }
}

/** The explicit first batch is preserved; follow-ups belong only to the same
 * authenticated, selected conversation and never exceed five calls per action. */
export async function drainDirectRead(options: {
  send(requestId: string): Promise<unknown>;
  requestId(): string;
  current(): boolean;
}): Promise<void> {
  let marked = 0;
  for (let page = 0; page < 5; page++) {
    if (page && !options.current()) return;
    const value = await options.send(options.requestId());
    if (!options.current()) return;
    const result = value && typeof value === "object" ? value as { marked?: unknown; hasMore?: unknown } : {};
    if (typeof result.marked === "number" && Number.isInteger(result.marked) && result.marked > 0) marked += result.marked;
    if (result.hasMore !== true) return;
    if (typeof result.marked !== "number" || result.marked <= 0 || page === 4) throw new DirectReadIncomplete(marked);
  }
}
