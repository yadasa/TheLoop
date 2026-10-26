import { eventICS } from "./selectors";

export type GuideEvent = {
  id: string; title: string; host: string; timeLabel: string; venueName: string; address: string;
  kind: string; categories: string[]; priceType: string; priceAmount: number | null;
  description: string; sourceLabel: string; canonicalUrl: string;
  startAt?: string; endAt?: string; verifiedAt?: string; ticketUrl?: string; sourceUrl?: string;
};
/** q is natural-language discovery and can return broadened suggestions, not exact
 * phrase matches. Date/time filters use Houston local time in the public Guide. */
export type GuideEventFilters = { q?: string; category?: string; date?: string; after?: string; before?: string; tags?: string | string[]; limit?: number };
/** count describes valid unique returned listings, never the total available plans. */
export type GuideEventsResult = { events: GuideEvent[]; count: number; limit: number; bounded: boolean; skipped: number };
export type GuideFetcher = (url: string, options: RequestInit) => Promise<Response>;
const endpoint = "https://afrotech.guide/api/v1/events";
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, maximum: number) => typeof value === "string" ? Array.from(value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim()).slice(0, maximum).join("") : "";
const validDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
};

export function guideInstant(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) || !validDate(value.slice(0, 10))) return undefined;
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
}

/** Organizer links remain external; only public HTTPS links without credentials are shown. */
export function guideHTTPSURL(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048 || /[\s\\\u0000-\u001F\u007F]/.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
}

export function guideCanonicalURL(value: unknown): string | undefined {
  const safe = guideHTTPSURL(value);
  if (!safe) return undefined;
  const url = new URL(safe);
  if (url.hostname !== "afrotech.guide" || url.port) return undefined;
  const parts = url.pathname.split("/");
  if (parts[1] !== "events" || !parts[2] || parts.length > 4 || (parts.length === 4 && parts[3])) return undefined;
  try { if (/[\/\\\s\u0000-\u001F\u007F]/.test(decodeURIComponent(parts[2]))) return undefined; }
  catch { return undefined; }
  return `${url.origin}${url.pathname}`;
}

export function guideEventsURL(filters: GuideEventFilters = {}): string {
  const params = new URLSearchParams();
  for (const [key, maximum] of [["q", 300], ["category", 80]] as const) {
    const value = filters[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || Array.from(value.trim()).length > maximum || /[\u0000-\u001F\u007F]/.test(value)) throw new Error(`Use at most ${maximum} characters for ${key === "q" ? "the search" : key}.`);
    if (value.trim()) params.set(key, value.trim());
  }
  if (filters.date !== undefined && filters.date !== "") {
    if (typeof filters.date !== "string" || !validDate(filters.date)) throw new Error("Choose a real calendar date for the Guide.");
    params.set("date", filters.date);
  }
  for (const key of ["after", "before"] as const) if (filters[key] !== undefined && filters[key] !== "") {
    if (typeof filters[key] !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(filters[key])) throw new Error("Use Houston local time in HH:mm format.");
    params.set(key, filters[key]);
  }
  if (params.has("after") && params.has("before") && params.get("after")! >= params.get("before")!) throw new Error("The Guide end time must follow its start time.");
  if (filters.tags !== undefined) {
    if (!Array.isArray(filters.tags) && typeof filters.tags !== "string") throw new Error("Choose up to 10 Guide tags.");
    const tags = typeof filters.tags === "string" ? filters.tags.split(",") : filters.tags;
    if (tags.length > 10 || tags.some(tag => typeof tag !== "string" || tag.length > 80 || /[\u0000-\u001F\u007F,]/.test(tag))) throw new Error("Choose up to 10 Guide tags of at most 80 characters.");
    const values = [...new Set(tags.map(tag => tag.trim()).filter(Boolean))];
    if (values.length) params.set("tags", values.join(","));
  }
  const limit = filters.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Request between 1 and 50 Guide matches.");
  params.set("limit", `${limit}`);
  return `${endpoint}?${params}`;
}

/** Only allowlisted listing fields survive parsing. Extra API metadata is never instructions. */
export function parseGuideEvents(value: unknown, limit = 50): GuideEventsResult {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !object(value) || value.ok !== true || value.kind !== "events" || !Array.isArray(value.items) || value.items.length > limit || !Number.isInteger(value.count) || value.count !== value.items.length) throw new Error("The public Guide did not return a valid event list.");
  const events: GuideEvent[] = [], ids = new Set<string>(), urls = new Set<string>();
  let skipped = 0;
  for (const item of value.items) {
    if (!object(item) || item.type !== "event" || typeof item.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,179}$/.test(item.id) || typeof item.title !== "string" || !item.title.trim() || Array.from(item.title).length > 300) { skipped++; continue; }
    const canonicalUrl = guideCanonicalURL(item.canonicalUrl);
    if (!canonicalUrl || ids.has(item.id) || urls.has(canonicalUrl)) { skipped++; continue; }
    const startAt = guideInstant(item.startAt), parsedEnd = guideInstant(item.endAt);
    const endAt = parsedEnd && (!startAt || Date.parse(parsedEnd) > Date.parse(startAt)) ? parsedEnd : undefined;
    events.push({
      id: item.id, title: text(item.title, 300), host: text(item.host, 300), timeLabel: text(item.timeLabel, 300),
      venueName: text(item.venueName, 500), address: text(item.address, 1000), kind: text(item.kind, 80),
      categories: Array.isArray(item.categories) ? [...new Set(item.categories.filter((entry): entry is string => typeof entry === "string").map(entry => text(entry, 80)).filter(Boolean))].slice(0, 20) : [],
      priceType: text(item.priceType, 80), priceAmount: typeof item.priceAmount === "number" && Number.isFinite(item.priceAmount) && item.priceAmount >= 0 ? item.priceAmount : null,
      description: text(item.description, 10000), sourceLabel: text(item.sourceLabel, 300), canonicalUrl,
      ...(startAt ? { startAt } : {}), ...(endAt ? { endAt } : {}),
      ...(guideInstant(item.verifiedAt) ? { verifiedAt: guideInstant(item.verifiedAt) } : {}),
      ...(guideHTTPSURL(item.ticketUrl) ? { ticketUrl: guideHTTPSURL(item.ticketUrl) } : {}),
      ...(guideHTTPSURL(item.sourceUrl) ? { sourceUrl: guideHTTPSURL(item.sourceUrl) } : {}),
    });
    ids.add(item.id); urls.add(canonicalUrl);
  }
  return { events, count: events.length, limit, bounded: value.items.length === limit, skipped };
}

export async function fetchGuideEvents(filters: GuideEventFilters = {}, options: { signal?: AbortSignal; fetcher?: GuideFetcher } = {}): Promise<GuideEventsResult> {
  const url = guideEventsURL(filters);
  const response = await (options.fetcher ?? globalThis.fetch)(url, { method: "GET", credentials: "omit", redirect: "error", headers: { Accept: "application/json" }, signal: options.signal });
  if (!response.ok) throw new Error(`The public Guide is unavailable (HTTP ${response.status}).`);
  if (!/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) throw new Error("The public Guide returned an unexpected response.");
  if (Number(response.headers.get("content-length") ?? 0) > 1_000_000) throw new Error("The public Guide response is too large.");
  const body = await response.text();
  let bytes = 0;
  for (const character of body) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > 1_000_000) throw new Error("The public Guide response is too large.");
  }
  let payload: unknown;
  try { payload = JSON.parse(body); } catch { throw new Error("The public Guide returned invalid JSON."); }
  return parseGuideEvents(payload, filters.limit ?? 50);
}

export function guideEventICS(event: GuideEvent): string | null {
  const startAt = guideInstant(event.startAt), endAt = guideInstant(event.endAt);
  const canonicalUrl = guideCanonicalURL(event.canonicalUrl);
  if (!startAt || !endAt || Date.parse(endAt) <= Date.parse(startAt) || !canonicalUrl || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,179}$/.test(event.id)) return null;
  return eventICS({ id: `guide-${event.id}`, title: event.title, description: [event.description, canonicalUrl].filter(Boolean).join("\n\n"), startAt, endAt, location: [event.venueName, event.address].filter(Boolean).join(", ") });
}
