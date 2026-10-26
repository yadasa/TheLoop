import test from "node:test";
import assert from "node:assert/strict";
import { previewEventDraft, type EventFormValues } from "../src/eventForm";
const values: EventFormValues = {
  conferenceId: "afrotech",
  title: 'Coffee, "good company"',
  description: "First floor\nBring a friend",
  startAt: "2026-11-05T08:30",
  endAt: "2026-11-05T10:00",
  timezone: "America/Chicago",
  location: "Houston",
  kind: "meetup",
  capacity: "30",
  tags: ["Coffee", "Community"],
  url: "https://example.com/coffee",
};
const options = {
  conferences: [{ id: "afrotech" }],
  now: "2026-10-26T00:00:00Z",
};
test("manual event entry preserves quoted content and converts selected-zone wall time", () => {
  const result = previewEventDraft(values, options);
  assert.deepEqual(result.errors, []);
  assert.equal(result.event?.title, values.title);
  assert.equal(result.event?.description, values.description);
  assert.equal(result.event?.startAt, "2026-11-05T14:30:00.000Z");
  assert.deepEqual(result.event?.tags, values.tags);
});
test("manual entry rejects impossible or ambiguous local dates before submission", () => {
  for (const startAt of [
    "2027-02-30T08:00",
    "2027-03-14T02:30",
    "2026-11-01T01:30",
  ]) {
    const result = previewEventDraft(
      { ...values, startAt, endAt: "2027-11-02T15:00" },
      options,
    );
    assert.equal(result.event, undefined, startAt);
    assert.ok(
      result.errors.some((error) => error.startsWith("startAt:")),
      startAt,
    );
  }
  assert.equal(
    previewEventDraft(
      {
        ...values,
        startAt: "2026-11-01T01:30-05:00",
        endAt: "2026-11-01T02:30-06:00",
      },
      options,
    ).event?.startAt,
    "2026-11-01T06:30:00.000Z",
  );
});
test("manual entries cannot bypass duplicate, capacity, or link validation", () => {
  const event = previewEventDraft(values, options).event!;
  assert.equal(
    previewEventDraft(values, {
      ...options,
      existingEvents: [{ title: event.title, startAt: event.startAt }],
    }).duplicate,
    true,
  );
  for (const patch of [
    { capacity: "-1" },
    { capacity: "10001" },
    { url: "javascript:alert(1)" },
    { timezone: "Unknown/Place" },
    { capacity: "1001" },
    { location: "x".repeat(241) },
    { tags: ["x".repeat(31)] },
    { tags: ["a", "b", "c", "d", "e", "f", "g"] },
    { url: "http://example.com/event" },
  ])
    assert.equal(
      previewEventDraft({ ...values, ...patch }, options).event,
      undefined,
    );
});
test("manual entry works without browser encoding globals", () => {
  const encoder = globalThis.TextEncoder;
  try {
    Object.defineProperty(globalThis, "TextEncoder", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    assert.ok(previewEventDraft(values, options).event);
    assert.match(
      previewEventDraft(
        { ...values, description: "好".repeat(700_000) },
        options,
      ).errors.join(" "),
      /too large/,
    );
  } finally {
    Object.defineProperty(globalThis, "TextEncoder", {
      value: encoder,
      writable: true,
      configurable: true,
    });
  }
});
