import test from "node:test";
import assert from "node:assert/strict";
import { initialRoute, readRoute, routeHash } from "../src/routes";
const origin = "https://preview.example/";
test("shared destinations survive refresh with their selected record", () => {
  const routes = [
    {
      ...initialRoute,
      page: "chat" as const,
      channelId: "career-moves",
      topic: "Warm intros & referrals",
    },
    { ...initialRoute, page: "communities" as const, communityId: "builders" },
    { ...initialRoute, page: "profile" as const, profileId: "maya" },
    { ...initialRoute, page: "inbox" as const, dmId: "maya" },
    { ...initialRoute, page: "squads" as const, squadId: "coffee" },
    { ...initialRoute, page: "calendar" as const, eventDetail: "meetup" },
    { ...initialRoute, postDetail: "older-post" },
  ];
  for (const route of routes)
    assert.deepEqual(readRoute(origin + routeHash(route)), route);
});
test("older shared query URLs and invalid destinations have predictable screens", () => {
  assert.equal(readRoute(origin + "?post=older").postDetail, "older");
  assert.equal(readRoute(origin + "?event=coffee").eventDetail, "coffee");
  assert.equal(readRoute(origin + "#/inbox/%2Fprivate").dmId, "");
  assert.equal(
    readRoute(origin + "#/conversations/career-moves?topic=%00bad").topic,
    "All topics",
  );
  assert.deepEqual(readRoute(origin + "#/unknown/path"), initialRoute);
});
