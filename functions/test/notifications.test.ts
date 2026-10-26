import test from "node:test";
import assert from "node:assert/strict";
import {
  digestContent,
  digestSlot,
  inQuietHours,
  localClock,
  subscription,
} from "../src/notifications";
import { defaultPreferences } from "../src/policy";

test("quiet hours cross midnight in the member timezone and respect the end boundary", () => {
  const prefs = {
    ...defaultPreferences(),
    timezone: "America/Chicago",
    quietHours: true,
  };
  assert.equal(inQuietHours(prefs, new Date("2026-10-26T03:00:00Z")), true); // 22:00 CDT
  assert.equal(inQuietHours(prefs, new Date("2026-10-26T12:59:00Z")), true); // 07:59 CDT
  assert.equal(inQuietHours(prefs, new Date("2026-10-26T13:00:00Z")), false); // 08:00 CDT
  assert.equal(
    inQuietHours(
      { ...prefs, quietHours: false },
      new Date("2026-10-26T03:00:00Z"),
    ),
    false,
  );
});
test("IANA timezone conversion follows daylight saving time", () => {
  assert.equal(
    localClock(new Date("2026-10-26T14:00:00Z"), "America/Chicago").time,
    "09:00",
  );
  assert.equal(
    localClock(new Date("2026-11-09T15:00:00Z"), "America/Chicago").time,
    "09:00",
  );
  assert.equal(
    localClock(new Date("2026-10-26T14:00:00Z"), "invalid/timezone").time,
    "14:00",
  );
});
test("weekly digests run Monday at local 9am and daily/off preferences differ", () => {
  const weekly = { digest: "weekly", timezone: "America/Chicago" };
  assert.equal(
    digestSlot(weekly, new Date("2026-10-26T14:00:00Z")),
    "weekly_2026-10-26",
  );
  assert.equal(digestSlot(weekly, new Date("2026-10-27T14:00:00Z")), undefined);
  assert.equal(
    digestSlot(
      { ...weekly, digest: "daily" },
      new Date("2026-10-27T14:00:00Z"),
    ),
    "daily_2026-10-27",
  );
  assert.equal(
    digestSlot({ ...weekly, digest: "off" }, new Date("2026-10-26T14:00:00Z")),
    undefined,
  );
});
test("digests honor topic override, hidden channels, blocks, reads, and private membership", () => {
  const prefs = {
    ...defaultPreferences(),
    subscriptions: {
      lobby: "muted",
      "lobby:Careers": "following",
      private: "following",
    },
    blockedIds: ["blocked"],
    joinedCommunityIds: ["builders"],
  };
  const channels = [
    { id: "lobby", conferenceId: "afrotech", visibility: "public" },
    {
      id: "private",
      conferenceId: "afrotech",
      visibility: "private",
      memberIds: ["someone-else"],
    },
  ];
  const messages = [
    {
      channelId: "lobby",
      topic: "Careers",
      authorId: "friend",
      createdAt: "2026-10-26T12:00:00Z",
    },
    {
      channelId: "lobby",
      topic: "Music",
      authorId: "friend",
      createdAt: "2026-10-26T12:00:00Z",
    },
    {
      channelId: "lobby",
      topic: "Careers",
      authorId: "blocked",
      createdAt: "2026-10-26T12:00:00Z",
    },
    {
      channelId: "private",
      topic: "Plans",
      authorId: "friend",
      createdAt: "2026-10-26T12:00:00Z",
    },
  ];
  const posts = [
    {
      authorId: "friend",
      communityId: "builders",
      createdAt: "2026-10-26T12:00:00Z",
    },
    {
      authorId: "blocked",
      communityId: "builders",
      createdAt: "2026-10-26T12:00:00Z",
    },
  ];
  assert.deepEqual(
    digestContent(
      "me",
      prefs,
      channels,
      messages,
      posts,
      new Date("2026-10-26T14:00:00Z"),
    ),
    { messageCount: 1, postCount: 1 },
  );
  assert.equal(subscription(prefs, channels[0], "Careers"), "following");
  assert.equal(subscription(prefs, channels[0], "Music"), "muted");
  assert.equal(
    digestContent(
      "me",
      { ...prefs, readChannels: { lobby: "2026-10-26T13:00:00Z" } },
      channels,
      messages,
      [],
      new Date("2026-10-26T14:00:00Z"),
    ).messageCount,
    0,
  );
});
