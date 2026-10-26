import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateTrust,
  canMessage,
  defaultPreferences,
  DomainError,
  httpsUrl,
  rsvp,
  validatePreferences,
  validateProfile,
} from "../src/policy";

test("RSVP waitlist preserves capacity and promotes the oldest waiting member", () => {
  const event = {
    capacity: 2,
    attendeeIds: ["a", "b"],
    waitlistIds: ["c", "d"],
  };
  assert.deepEqual(rsvp(event, "e"), {
    attendeeIds: ["a", "b"],
    waitlistIds: ["c", "d", "e"],
  });
  assert.deepEqual(rsvp(event, "a"), {
    attendeeIds: ["b", "c"],
    waitlistIds: ["d"],
    promotedId: "c",
  });
  assert.deepEqual(rsvp(event, "d"), {
    attendeeIds: ["a", "b"],
    waitlistIds: ["c"],
  });
});
test("DM policy requires accepted connection and rejects blocks in either direction", () => {
  const sender = { preferences: defaultPreferences() };
  const receiver = { preferences: defaultPreferences() };
  assert.equal(canMessage("a", "b", sender, receiver, undefined), false);
  assert.equal(
    canMessage("a", "b", sender, receiver, { status: "pending" }),
    false,
  );
  assert.equal(
    canMessage("a", "b", sender, receiver, { status: "accepted" }),
    true,
  );
  receiver.preferences.blockedIds = ["a"];
  assert.equal(
    canMessage("a", "b", sender, receiver, { status: "accepted" }),
    false,
  );
  receiver.preferences = { ...defaultPreferences(), dmPolicy: "everyone" };
  assert.equal(canMessage("a", "b", sender, receiver, undefined), true);
  sender.preferences.blockedIds = ["b"];
  assert.equal(canMessage("a", "b", sender, receiver, undefined), false);
});
test("profile input cannot forge verification, founding-year badges, or trust", () => {
  for (const field of ["verified", "trust", "foundingYear", "role", "id"])
    assert.throws(() => validateProfile({ [field]: true }), DomainError);
  assert.throws(
    () =>
      validateProfile({
        links: [{ label: "Click", url: "javascript:alert(1)" }],
      }),
    DomainError,
  );
  assert.equal(
    validateProfile({ name: "Maya Thompson", visibility: "connections" })
      .initials,
    "MT",
  );
});
test("generic preferences cannot bypass dedicated relationship and subscription commands", () => {
  for (const field of [
    "subscriptions",
    "joinedCommunityIds",
    "followingIds",
    "blockedIds",
    "savedPostIds",
    "role",
  ])
    assert.throws(() => validatePreferences({ [field]: [] }), DomainError);
  assert.throws(
    () => validatePreferences({ quietStart: "28:00" }),
    DomainError,
  );
  assert.deepEqual(
    validatePreferences({ dmPolicy: "nobody", quietHours: true }),
    { dmPolicy: "nobody", quietHours: true },
  );
});
test("trust is explained, bounded, and excludes unreviewed report counts", () => {
  const profile = {
    joinedAt: "2025-01-01T00:00:00Z",
    name: "Member",
    headline: "Engineer",
    bio: "About me",
    skills: ["TypeScript"],
  };
  const trust = calculateTrust(
    profile,
    {
      emailVerified: true,
      acceptedConnections: 500,
      verifiedAttendance: 500,
      rawReports: 1000,
    },
    "2026-10-26T00:00:00Z",
  );
  assert.equal(trust.score, 90);
  assert.equal(trust.reasons.length, 6);
  assert.ok(trust.reasons.every((reason) => /\d+ ·/.test(reason)));
  assert.equal(
    calculateTrust(profile, { moderatorPenalty: 5000 }, "2026-10-26T00:00:00Z")
      .score,
    0,
  );
});
test("social links accept HTTPS only and reject embedded credentials", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,test",
    "http://example.com",
    "https://user:password@example.com",
  ])
    assert.throws(() => httpsUrl(value), DomainError);
  assert.equal(
    httpsUrl("https://linkedin.com/in/member"),
    "https://linkedin.com/in/member",
  );
});
