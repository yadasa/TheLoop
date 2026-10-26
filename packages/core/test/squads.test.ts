import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, initialState, type LoopState } from "../src/index";
const ctx = { id: "our-squad", now: "2026-10-26T12:00:00.000Z" };
const fresh = () => {
  const s = initialState();
  s.squads = [];
  s.squadInvites = [];
  s.squadMessages = [];
  s.notifications = [];
  return s;
};
const actor = (s: LoopState, id: string) => ({
  ...s,
  currentUserId: id,
  preferences: { ...s.preferences, blockedIds: [] },
});
const create = () =>
  applyCommand(
    fresh(),
    { type: "squad.create", name: "Coffee people", inviteeIds: ["maya"] },
    ctx,
  );
const join = () => {
  const s = create();
  return applyCommand(
    actor(s, "maya"),
    { type: "squad.respond", inviteId: s.squadInvites[0].id, accept: true },
    { ...ctx, id: "accept", now: "2026-10-26T12:01:00.000Z" },
  );
};

test("a squad invitation reserves capacity without adding a member or granting history", () => {
  const s = create();
  assert.deepEqual(s.squads[0].memberIds, ["me"]);
  assert.deepEqual(s.squads[0].pendingInviteeIds, ["maya"]);
  assert.equal(s.squadInvites[0].status, "pending");
  assert.throws(
    () =>
      applyCommand(
        actor(s, "maya"),
        {
          type: "squad.message.send",
          squadId: "our-squad",
          body: "Not accepted yet.",
        },
        ctx,
      ),
    /not a member/,
  );
  assert.throws(
    () =>
      applyCommand(
        s,
        {
          type: "squad.create",
          name: "No forced additions",
          inviteeIds: ["jordan"],
        },
        ctx,
      ),
    /accepted connection/,
  );
  assert.equal(s.squads.length, 1);
});

test("only the invited recipient can accept; consent captures a future message audience", () => {
  let s = create();
  assert.throws(
    () =>
      applyCommand(
        s,
        { type: "squad.respond", inviteId: s.squadInvites[0].id, accept: true },
        ctx,
      ),
    /not available/,
  );
  s = applyCommand(
    s,
    {
      type: "squad.message.send",
      squadId: "our-squad",
      body: "Before the invitation was accepted.",
    },
    { ...ctx, id: "before" },
  );
  s = applyCommand(
    actor(s, "maya"),
    { type: "squad.respond", inviteId: s.squadInvites[0].id, accept: true },
    ctx,
  );
  s = applyCommand(
    s,
    {
      type: "squad.message.send",
      squadId: "our-squad",
      body: "Now we are both here.",
    },
    { ...ctx, id: "after" },
  );
  assert.deepEqual(
    s.squadMessages.find((m) => m.id === "before")!.audienceIds,
    ["me"],
  );
  assert.deepEqual(s.squadMessages.find((m) => m.id === "after")!.audienceIds, [
    "me",
    "maya",
  ]);
  assert.throws(
    () =>
      applyCommand(
        s,
        { type: "squad.message.react", messageId: "before", emoji: "🖤" },
        ctx,
      ),
    /before you joined/,
  );
  assert.throws(
    () =>
      applyCommand(
        s,
        {
          type: "report.create",
          targetType: "squadMessage",
          targetId: "before",
          reason: "Cannot report unseen history.",
        },
        ctx,
      ),
    /available to you/,
  );
});

test("owner departure transfers to the oldest member; the final departure archives", () => {
  let s = join();
  s = applyCommand(
    actor(s, "me"),
    { type: "squad.leave", squadId: "our-squad" },
    ctx,
  );
  assert.equal(s.squads[0].ownerId, "maya");
  assert.deepEqual(s.squads[0].memberIds, ["maya"]);
  assert.throws(
    () => applyCommand(s, { type: "squad.read", squadId: "our-squad" }, ctx),
    /not a member/,
  );
  s = applyCommand(
    actor(s, "maya"),
    { type: "squad.leave", squadId: "our-squad" },
    ctx,
  );
  assert.equal(s.squads[0].archived, true);
  assert.deepEqual(s.squads[0].memberIds, []);
});

test("withdrawal and expiry do not silently enroll; reinvites respect cooldown", () => {
  let s = create();
  s = applyCommand(
    s,
    { type: "squad.revoke", inviteId: s.squadInvites[0].id },
    ctx,
  );
  assert.equal(s.squadInvites[0].status, "revoked");
  assert.deepEqual(s.squads[0].pendingInviteeIds, []);
  assert.throws(
    () =>
      applyCommand(
        s,
        { type: "squad.invite", squadId: "our-squad", userId: "maya" },
        ctx,
      ),
    /24 hours/,
  );
  const pending = create();
  assert.throws(
    () =>
      applyCommand(
        actor(pending, "maya"),
        {
          type: "squad.respond",
          inviteId: pending.squadInvites[0].id,
          accept: true,
        },
        { ...ctx, now: "2026-11-03T12:00:00.000Z" },
      ),
    /no longer pending/,
  );
  assert.deepEqual(pending.squads[0].memberIds, ["me"]);
});

test("ownership protects roster changes and text edits cannot change identity or audience", () => {
  let s = join();
  assert.throws(
    () =>
      applyCommand(
        s,
        {
          type: "squad.update",
          squadId: "our-squad",
          squad: { name: "Takeover" },
        },
        ctx,
      ),
    /owner/,
  );
  s = applyCommand(
    s,
    {
      type: "squad.message.send",
      squadId: "our-squad",
      body: "My first thought.",
    },
    { ...ctx, id: "my-message" },
  );
  const changed = applyCommand(
    s,
    {
      type: "squad.message.edit",
      messageId: "my-message",
      body: "My clearer thought.",
    },
    ctx,
  );
  assert.equal(changed.squadMessages[0].authorId, "maya");
  assert.deepEqual(changed.squadMessages[0].audienceIds, ["me", "maya"]);
  assert.equal(changed.squadMessages[0].editedAt, ctx.now);
  assert.throws(
    () =>
      applyCommand(
        actor(s, "me"),
        {
          type: "squad.message.edit",
          messageId: "my-message",
          body: "An impersonation.",
        },
        ctx,
      ),
    /author/,
  );
  s = applyCommand(s, { type: "squad.leave", squadId: "our-squad" }, ctx);
  assert.throws(
    () =>
      applyCommand(
        s,
        {
          type: "squad.message.edit",
          messageId: "my-message",
          body: "Cannot edit after leaving.",
        },
        ctx,
      ),
    /not a member/,
  );
  s = applyCommand(
    s,
    { type: "squad.message.delete", messageId: "my-message" },
    ctx,
  );
  assert.equal(s.squadMessages.length, 0);
});

test("private squad reports retain only an authorized excerpt", () => {
  let s = join();
  s = applyCommand(
    s,
    {
      type: "squad.message.send",
      squadId: "our-squad",
      body: "The selected message.",
    },
    { ...ctx, id: "reported" },
  );
  s = applyCommand(
    actor(s, "me"),
    {
      type: "report.create",
      targetType: "squadMessage",
      targetId: "reported",
      reason: "Review this excerpt.",
    },
    ctx,
  );
  assert.deepEqual(s.reports[0].snapshot, {
    body: "The selected message.",
    authorId: "maya",
    capturedAt: ctx.now,
  });
  s = applyCommand(s, { type: "squad.leave", squadId: "our-squad" }, ctx);
  assert.throws(
    () =>
      applyCommand(
        s,
        {
          type: "report.create",
          targetType: "squadMessage",
          targetId: "reported",
          reason: "Cannot read after leaving.",
        },
        ctx,
      ),
    /available to you/,
  );
});
