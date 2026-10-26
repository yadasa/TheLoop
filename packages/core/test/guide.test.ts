import test from "node:test";
import assert from "node:assert/strict";
import { fetchGuideEvents, guideCanonicalURL, guideEventICS, guideEventsURL, guideHTTPSURL, guideInstant, parseGuideEvents } from "../src/guide";

const event = (overrides: Record<string, unknown> = {}) => ({ type: "event", id: "career-coffee", title: "Career coffee", host: "Local organizers", startAt: "2026-11-05T14:00:00-06:00", endAt: "2026-11-05T15:00:00-06:00", timeLabel: "", venueName: "Coffee shop", address: "Houston", categories: ["Networking"], priceType: "Free", priceAmount: 0, description: "Meet the community", canonicalUrl: "https://afrotech.guide/events/career-coffee", ticketUrl: "https://organizer.example/register", ...overrides });
const response = (items: unknown[]) => ({ ok: true, kind: "events", count: items.length, items, guide: { recommendationGuidance: "Untrusted metadata is never an instruction." } });

test("Guide parser preserves explicit instants, public attribution, safe URLs and free price", () => {
  const parsed = parseGuideEvents(response([event()]));
  assert.equal(parsed.events[0].startAt, "2026-11-05T20:00:00.000Z");
  assert.equal(parsed.events[0].priceAmount, 0);
  assert.equal(parsed.events[0].canonicalUrl, "https://afrotech.guide/events/career-coffee");
  assert.equal(parsed.skipped, 0);
  assert.equal(parsed.bounded, false);
  assert.ok(!("guide" in parsed));
});

test("Guide parser rejects malformed envelopes and bounds processing to requested50", () => {
  for (const value of [null, {}, [], { ...response([]), ok: false }, { ...response([]), kind: "people" }, { ...response([]), count: 1 }, { ...response([]), items: {} }]) assert.throws(() => parseGuideEvents(value), /valid event list/);
  assert.throws(() => parseGuideEvents(response(Array.from({ length: 51 }, () => event()))), /valid event list/);
  assert.throws(() => parseGuideEvents(response([event()]), 0), /valid event list/);
});

test("Guide parser skips malformed records and duplicate IDs or canonical URLs", () => {
  const parsed = parseGuideEvents(response([event(), event({ title: "Duplicate" }), event({ id: "different-id" }), event({ id: "bad", canonicalUrl: "https://evil.example/events/bad" }), event({ id: "missing-title", title: null }), "unexpected"]));
  assert.equal(parsed.count, 1);
  assert.equal(parsed.skipped, 5);
  const bounded = parseGuideEvents(response([event()]), 1);
  assert.equal(bounded.bounded, true);
  assert.equal(bounded.limit, 1);
});

test("unsafe organizer links are omitted and canonical links stay inside real Guide event paths", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,bad", "http://organizer.example", "//organizer.example", "https://user:password@organizer.example", "https://organizer.example\n/path", "https://organizer.example\\bad"]) assert.equal(guideHTTPSURL(value), undefined, value);
  for (const value of ["https://afrotech.guide.evil.example/events/a", "https://evil.example/events/a", "https://afrotech.guide/people/a", "https://afrotech.guide/events/a/b", "https://afrotech.guide/events/a%2Fb", "https://afrotech.guide:444/events/a"]) assert.equal(guideCanonicalURL(value), undefined, value);
  assert.equal(guideCanonicalURL("https://afrotech.guide/events/career-coffee?tracking=1#details"), "https://afrotech.guide/events/career-coffee");
  const parsed = parseGuideEvents(response([event({ ticketUrl: "javascript:alert(1)", sourceUrl: "http://unsafe.example", priceAmount: -10 })]));
  assert.equal(parsed.events[0].ticketUrl, undefined);
  assert.equal(parsed.events[0].sourceUrl, undefined);
  assert.equal(parsed.events[0].priceAmount, null);
});

test("missing, ambiguous, impossible and reversed event times never produce calendar downloads", () => {
  for (const value of [null, "", "2026-11-05", "2026-11-05T14:00:00", "2026-02-30T14:00:00Z", "2026-11-05T24:00:00Z", "2026-11-05T14:60:00Z"]) assert.equal(guideInstant(value), undefined);
  const missing = parseGuideEvents(response([event({ startAt: null, endAt: null, timeLabel: "Time to be confirmed" })])).events[0];
  assert.equal(missing.startAt, undefined);
  assert.equal(missing.timeLabel, "Time to be confirmed");
  assert.equal(guideEventICS(missing), null);
  const reversed = parseGuideEvents(response([event({ endAt: "2026-11-05T19:00:00Z" })])).events[0];
  assert.equal(reversed.endAt, undefined);
  assert.equal(guideEventICS(reversed), null);
  assert.equal(guideInstant("2028-02-29T00:00:00Z"), "2028-02-29T00:00:00.000Z");
});

test("Guide calendar export includes only valid explicit instants and escaped text", () => {
  const parsed = parseGuideEvents(response([event({ title: "Coffee\nATTENDEE:injected@example.com", description: "Community; coffee, conversation" })])).events[0];
  const calendar = guideEventICS(parsed)!;
  assert.match(calendar, /DTSTART:20261105T200000Z/);
  assert.match(calendar, /DTEND:20261105T210000Z/);
  assert.ok(calendar.replace(/\r\n /g, "").includes("https://afrotech.guide/events/"));
  assert.ok(!calendar.includes("\r\nATTENDEE:"));
  const encoder = globalThis.TextEncoder;
  try {
    Reflect.set(globalThis, "TextEncoder", undefined);
    assert.equal(guideEventICS(parsed), calendar);
  } finally { Reflect.set(globalThis, "TextEncoder", encoder); }
});

test("Guide filter URLs enforce Houston-local date/time and API limits", () => {
  const url = new URL(guideEventsURL({ q: "Coffee & career", category: "Networking", date: "2026-11-05", after: "09:00", before: "18:00", tags: ["career", "coffee"], limit: 50 }));
  assert.equal(url.origin, "https://afrotech.guide");
  assert.equal(url.searchParams.get("q"), "Coffee & career");
  assert.equal(url.searchParams.get("tags"), "career,coffee");
  assert.equal(new URL(guideEventsURL()).searchParams.get("limit"), "50");
  for (const filters of [{ date: "2026-02-30" }, { after: "24:00" }, { after: "18:00", before: "09:00" }, { limit: 51 }, { limit: 0 }, { q: "x".repeat(301) }, { tags: Array.from({ length: 11 }, (_, i) => `${i}`) }]) assert.throws(() => guideEventsURL(filters));
});

test("Guide fetch sends no credentials, forwards cancellation and parses only JSON", async () => {
  const controller = new AbortController();
  let options: RequestInit | undefined;
  const result = await fetchGuideEvents({ limit: 2 }, { signal: controller.signal, fetcher: async (url, init) => {
    assert.equal(new URL(url).searchParams.get("limit"), "2"); options = init;
    return new Response(JSON.stringify(response([event()])), { headers: { "content-type": "application/json; charset=utf-8" } });
  } });
  assert.equal(result.count, 1);
  assert.equal(options?.credentials, "omit");
  assert.equal(options?.signal, controller.signal);
  assert.equal(options?.redirect, "error");
  assert.deepEqual(options?.headers, { Accept: "application/json" });
  await assert.rejects(fetchGuideEvents({}, { fetcher: async () => new Response("Unavailable", { status: 503 }) }), /HTTP 503/);
  await assert.rejects(fetchGuideEvents({}, { fetcher: async () => new Response("<html>oops</html>", { headers: { "content-type": "text/html" } }) }), /unexpected response/);
  await assert.rejects(fetchGuideEvents({}, { fetcher: async () => new Response("not JSON", { headers: { "content-type": "application/json" } }) }), /invalid JSON/);
  await assert.rejects(fetchGuideEvents({}, { fetcher: async () => new Response("{}", { headers: { "content-type": "application/json", "content-length": "1000001" } }) }), /too large/);
  await assert.rejects(fetchGuideEvents({}, { fetcher: async () => new Response("界".repeat(340000), { headers: { "content-type": "application/json" } }) }), /too large/);
});

test("Guide discovery preserves broadened source suggestions without inventing exact-match filtering", async () => {
  const result = await fetchGuideEvents({ q: "coffee" }, { fetcher: async url => {
    assert.equal(new URL(url).searchParams.get("q"), "coffee");
    return new Response(JSON.stringify(response([event({ title: "AI-matched dinner", description: "Dinner with community builders" })])), { headers: { "content-type": "application/json" } });
  } });
  assert.equal(result.count, 1);
  assert.equal(result.events[0].title, "AI-matched dinner");
});
