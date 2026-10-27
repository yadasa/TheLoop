import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState, type Conference } from "@theloop/core";
import {
  calendarDay,
  conferenceDateRange,
  conferenceTiming,
  conferenceChannels,
  featuredConference,
} from "../apps/mobile/src/conferencePresentation";

const conference = (
  id = "afrotech",
  overrides: Partial<Conference> = {},
): Conference => ({
  id,
  name: "AfroTech 2026",
  shortName: "AF",
  city: "Houston",
  startDate: "2026-11-02",
  endDate: "2026-11-06",
  description: "Community conference",
  members: 0,
  tagline: "",
  ...overrides,
});
test("conference dates reject impossible dates and stay on the stored calendar day", () => {
  assert.equal(calendarDay("2026-02-30"), null);
  assert.equal(calendarDay("2026-2-3"), null);
  assert.equal(calendarDay("invalid"), null);
  assert.equal(calendarDay("2028-02-29")?.getUTCDate(), 29);
  assert.equal(calendarDay("2026-11-02")?.getUTCDate(), 2);
  assert.equal(
    conferenceDateRange(conference("bad", { endDate: "2026-10-01" })),
    "Dates to be announced",
  );
});
test("countdown uses local calendar days across daylight saving and inclusive end date", () => {
  assert.equal(
    conferenceTiming(conference(), new Date(2026, 9, 27, 23, 59)),
    "IN 6 DAYS",
  );
  assert.equal(
    conferenceTiming(conference(), new Date(2026, 10, 1, 23, 59)),
    "STARTS TOMORROW",
  );
  assert.equal(
    conferenceTiming(conference(), new Date(2026, 10, 2)),
    "HAPPENING NOW",
  );
  assert.equal(
    conferenceTiming(conference(), new Date(2026, 10, 6, 23, 59)),
    "HAPPENING NOW",
  );
  assert.equal(
    conferenceTiming(conference(), new Date(2026, 10, 7)),
    "PAST CONFERENCE",
  );
});
test("spotlight excludes hidden, past and inaccessible conferences without changing subscriptions", () => {
  const state = emptyState("me");
  state.conferences = [
    conference(),
    conference("past", { endDate: "2025-11-06", startDate: "2025-11-02" }),
    conference("hidden"),
    conference("private"),
  ];
  state.channels = state.conferences.map((item) => ({
    id: `${item.id}-chat`,
    conferenceId: item.id,
    name: "Chat",
    description: "",
    icon: "#",
    members: 0,
    topics: [],
    visibility: item.id === "private" ? "private" : "public",
    memberIds: [],
  }));
  state.preferences.subscriptions.hidden = "hidden";
  state.preferences.hideUnsubscribed = true;
  const before = structuredClone(state.preferences);
  assert.equal(
    featuredConference(state, new Date(2026, 9, 27))?.id,
    "afrotech",
  );
  assert.deepEqual(conferenceChannels(state, "private"), []);
  state.currentUserId = "";
  assert.equal(featuredConference(state, new Date(2026, 9, 27)), undefined);
  assert.deepEqual(state.preferences, before);
});
test("ongoing conferences lead, then followed upcoming conferences", () => {
  const state = emptyState("me");
  state.conferences = [
    conference(),
    conference("later", { startDate: "2026-12-01", endDate: "2026-12-02" }),
    conference("now", { startDate: "2026-10-25", endDate: "2026-10-28" }),
  ];
  state.channels = state.conferences.map((item) => ({
    id: item.id,
    conferenceId: item.id,
    name: "Chat",
    description: "",
    icon: "#",
    members: 0,
    topics: [],
    visibility: "public",
  }));
  state.preferences.subscriptions.later = "following";
  assert.equal(featuredConference(state, new Date(2026, 9, 27))?.id, "now");
  assert.equal(featuredConference(state, new Date(2026, 9, 29))?.id, "later");
});

test("year-round spaces remain available without displacing a dated conference", () => {
  const state = emptyState("me");
  state.conferences = [
    conference("everyday", { startDate: "2026-01-01", endDate: "2026-12-31" }),
    conference(),
  ];
  state.channels = state.conferences.map((item) => ({
    id: item.id,
    conferenceId: item.id,
    name: "Chat",
    description: "",
    icon: "#",
    members: 0,
    topics: [],
    visibility: "public",
  }));
  assert.equal(
    featuredConference(state, new Date(2026, 9, 27))?.id,
    "afrotech",
  );
  assert.equal(
    conferenceTiming(state.conferences[0], new Date(2026, 9, 27)),
    "ONGOING",
  );
  assert.equal(
    featuredConference(state, new Date(2026, 10, 7))?.id,
    "everyday",
  );
});
