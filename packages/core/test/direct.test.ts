import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, initialState, type Command } from "../src/index";
const ctx = { id: "my-dm", now: "2026-10-26T14:00:00.000Z" };
const send = () =>
  applyCommand(
    initialState(),
    { type: "dm.send", userId: "maya", body: "A thoughtful hello." },
    ctx,
  );

test("participation names are derived from the author and cannot impersonate another profile", () => {
  let s = applyCommand(
    initialState(),
    {
      type: "message.send",
      channelId: "the-lobby",
      topic: "Introductions",
      body: "Hello.",
      authorName: "A forged name",
    } as unknown as Command,
    ctx,
  );
  assert.equal(s.messages.at(-1)!.authorName, "Alex Morgan");
  s = applyCommand(
    s,
    {
      type: "post.create",
      communityId: "builders",
      kind: "discussion",
      title: "A new thought",
      body: "Here is a little context.",
    },
    ctx,
  );
  s = applyCommand(
    s,
    { type: "post.comment", postId: ctx.id, body: "A reply." },
    { ...ctx, id: "reply" },
  );
  assert.equal(s.posts.find((p) => p.id === ctx.id)!.authorName, "Alex Morgan");
  assert.equal(
    s.posts.find((p) => p.id === ctx.id)!.comments[0].authorInitials,
    "AM",
  );
  const dm = send().directMessages.at(-1)!;
  assert.equal(dm.fromName, "Alex Morgan");
  assert.equal(dm.toName, "Maya Thompson");
  assert.equal(dm.conversationId, "maya~me");
});

test("DM text correction preserves participant identity, image and read state; deletion stays author-owned", () => {
  const s = send(),
    before = s.directMessages.find((d) => d.id === ctx.id)!;
  const next = applyCommand(
      s,
      { type: "dm.edit", messageId: ctx.id, body: "A clearer hello." },
      ctx,
    ),
    message = next.directMessages.find((d) => d.id === ctx.id)!;
  assert.deepEqual(
    { ...message, body: before.body, editedAt: undefined },
    { ...before, editedAt: undefined },
  );
  assert.equal(message.body, "A clearer hello.");
  assert.throws(
    () =>
      applyCommand(
        { ...s, currentUserId: "maya" },
        { type: "dm.edit", messageId: ctx.id, body: "An impersonation." },
        ctx,
      ),
    /author/,
  );
  assert.throws(
    () =>
      applyCommand(
        { ...s, currentUserId: "maya" },
        { type: "dm.delete", messageId: ctx.id },
        ctx,
      ),
    /author/,
  );
  const blocked = applyCommand(
    s,
    { type: "profile.block", userId: "maya" },
    ctx,
  );
  assert.throws(
    () =>
      applyCommand(
        blocked,
        { type: "dm.edit", messageId: ctx.id, body: "New text after a block." },
        ctx,
      ),
    /Unblock/,
  );
  assert.ok(
    !applyCommand(
      blocked,
      { type: "dm.delete", messageId: ctx.id },
      ctx,
    ).directMessages.some((d) => d.id === ctx.id),
  );
});

test("an unanswered outbound message grants no reply consent while a peer-authored message does", () => {
  const s = initialState();
  s.directMessages = [
    {
      id: "unanswered",
      fromId: "me",
      toId: "imani",
      fromName: "Alex Morgan",
      body: "An unanswered hello.",
      createdAt: ctx.now,
      read: false,
    },
  ];
  assert.throws(
    () =>
      applyCommand(
        s,
        {
          type: "dm.send",
          userId: "imani",
          body: "Cannot use an unanswered message as permission.",
        },
        ctx,
      ),
    /Connect/,
  );
  s.directMessages.push({
    id: "specific-consent",
    fromId: "imani",
    toId: "me",
    fromName: "Imani Brooks",
    fromInitials: "IB",
    body: "An invitation to reply.",
    createdAt: ctx.now,
    read: false,
  });
  const next = applyCommand(
    s,
    {
      type: "dm.send",
      userId: "imani",
      body: "Thanks for opening the conversation.",
    },
    ctx,
  );
  assert.equal(next.directMessages.at(-1)!.toName, "Imani Brooks");
  assert.deepEqual(next.connections, s.connections);
});

test("conversation mute changes notifications preference without erasing history or duplicating the peer", () => {
  const s = send();
  const muted = applyCommand(
      s,
      { type: "dm.mute", userId: "maya", muted: true },
      ctx,
    ),
    again = applyCommand(
      muted,
      { type: "dm.mute", userId: "maya", muted: true },
      ctx,
    );
  assert.deepEqual(again.preferences.dmMutedIds, ["maya"]);
  assert.deepEqual(again.directMessages, s.directMessages);
  assert.deepEqual(
    applyCommand(again, { type: "dm.mute", userId: "maya", muted: false }, ctx)
      .preferences.dmMutedIds,
    [],
  );
});
