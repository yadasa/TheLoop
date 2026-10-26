import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCommand,
  canReadPreviewImage,
  initialState,
  type LoopState,
  type MediaTarget,
} from "../src/index";
const ctx = { id: "photo-message", now: "2026-10-26T12:00:00.000Z" };
const imageState = (target: MediaTarget): LoopState => {
  const s = initialState();
  s.previewImages = {
    photo: {
      image: {
        id: "photo",
        mimeType: "image/webp",
        width: 320,
        height: 200,
        size: 1200,
      },
      dataUrl: "data:image/webp;base64,UklGRg==",
      ownerId: "me",
      target,
      createdAt: ctx.now,
    },
  };
  return s;
};

test("an image is owned, bound to its selected conversation and used once", () => {
  const s = imageState({ kind: "channel", id: "the-lobby" });
  assert.throws(
    () =>
      applyCommand(
        s,
        {
          type: "message.send",
          channelId: "career-moves",
          topic: "Career",
          body: "Wrong room.",
          imageId: "photo",
        },
        ctx,
      ),
    /fresh image/,
  );
  const next = applyCommand(
    s,
    {
      type: "message.send",
      channelId: "the-lobby",
      topic: "Introductions",
      body: "A little hello.",
      imageId: "photo",
    },
    ctx,
  );
  assert.equal(next.messages.at(-1)!.image?.id, "photo");
  assert.deepEqual(next.previewImages!.photo.linkedTo, {
    kind: "message",
    id: ctx.id,
  });
  assert.equal(s.previewImages!.photo.linkedTo, undefined);
  for (const createdAt of ["not-a-date", "2027-01-01T00:00:00.000Z"]) {
    const invalid = imageState({ kind: "channel", id: "the-lobby" });
    invalid.previewImages!.photo.createdAt = createdAt;
    assert.throws(
      () =>
        applyCommand(
          invalid,
          {
            type: "message.send",
            channelId: "the-lobby",
            topic: "Introductions",
            body: "Invalid image age.",
            imageId: "photo",
          },
          ctx,
        ),
      /fresh image/,
    );
  }
  assert.throws(
    () =>
      applyCommand(
        next,
        {
          type: "message.send",
          channelId: "the-lobby",
          topic: "Introductions",
          body: "A duplicate.",
          imageId: "photo",
        },
        { ...ctx, id: "duplicate" },
      ),
    /fresh image/,
  );
});

test("failed captions do not consume a ready image; expired or foreign images are denied", () => {
  const s = imageState({ kind: "channel", id: "the-lobby" });
  assert.throws(
    () =>
      applyCommand(
        s,
        {
          type: "message.send",
          channelId: "the-lobby",
          topic: "Introductions",
          body: "",
          imageId: "photo",
        },
        ctx,
      ),
    /characters/,
  );
  assert.equal(s.previewImages!.photo.linkedTo, undefined);
  assert.throws(
    () =>
      applyCommand(
        s,
        {
          type: "message.send",
          channelId: "the-lobby",
          topic: "Introductions",
          body: "Expired.",
          imageId: "photo",
        },
        { ...ctx, now: "2026-10-26T14:00:00.000Z" },
      ),
    /fresh image/,
  );
  s.previewImages!.photo.ownerId = "maya";
  assert.throws(
    () =>
      applyCommand(
        s,
        {
          type: "message.send",
          channelId: "the-lobby",
          topic: "Introductions",
          body: "Not mine.",
          imageId: "photo",
        },
        ctx,
      ),
    /fresh image/,
  );
});

test("private image reads follow current squad membership and captured message audience", () => {
  let s = imageState({ kind: "squad", id: "coffee-crew" });
  s = applyCommand(
    s,
    {
      type: "squad.message.send",
      squadId: "coffee-crew",
      body: "A little coffee.",
      imageId: "photo",
    },
    ctx,
  );
  const viewer = { ...s, currentUserId: "maya" };
  assert.equal(canReadPreviewImage(viewer, viewer.previewImages!.photo), true);
  const departed = applyCommand(
    viewer,
    { type: "squad.leave", squadId: "coffee-crew" },
    ctx,
  );
  assert.equal(
    canReadPreviewImage(departed, departed.previewImages!.photo),
    false,
  );
  const outsider = { ...s, currentUserId: "jordan" };
  assert.equal(
    canReadPreviewImage(outsider, outsider.previewImages!.photo),
    false,
  );
  const blocked = {
    ...viewer,
    preferences: { ...viewer.preferences, blockedIds: ["me"] },
  };
  assert.equal(
    canReadPreviewImage(blocked, blocked.previewImages!.photo),
    false,
  );
});

test("image deletion reclaims sample payload and old identifiers cannot be rebound", () => {
  let s = imageState({ kind: "channel", id: "the-lobby" });
  s = applyCommand(
    s,
    {
      type: "message.send",
      channelId: "the-lobby",
      topic: "Introductions",
      body: "Temporary sample.",
      imageId: "photo",
    },
    ctx,
  );
  s = applyCommand(s, { type: "message.delete", messageId: ctx.id }, ctx);
  assert.equal(s.previewImages!.photo, undefined);
  assert.throws(
    () =>
      applyCommand(
        s,
        {
          type: "message.send",
          channelId: "the-lobby",
          topic: "Introductions",
          body: "Gone.",
          imageId: "photo",
        },
        ctx,
      ),
    /fresh image/,
  );
});

test("posts and direct messages bind images without accepting public attachment URLs", () => {
  const post = applyCommand(
    imageState({ kind: "community", id: "builders" }),
    {
      type: "post.create",
      communityId: "builders",
      kind: "win",
      title: "We made a little thing.",
      body: "Here is what we built.",
      imageId: "photo",
    },
    ctx,
  );
  assert.equal(
    post.posts[0].image?.id ?? post.posts.at(-1)?.image?.id,
    "photo",
  );
  assert.equal(canReadPreviewImage(post, post.previewImages!.photo), true);
  const dm = applyCommand(
    imageState({ kind: "directMessage", id: "maya" }),
    {
      type: "dm.send",
      userId: "maya",
      body: "A little note.",
      imageId: "photo",
    },
    ctx,
  );
  assert.equal(dm.directMessages.at(-1)?.image?.id, "photo");
  assert.equal(
    canReadPreviewImage(
      { ...dm, currentUserId: "jordan" },
      dm.previewImages!.photo,
    ),
    false,
  );
  const reported = applyCommand(
    { ...dm, currentUserId: "maya" },
    {
      type: "report.create",
      targetType: "directMessage",
      targetId: ctx.id,
      reason: "Review this selected message.",
    },
    { ...ctx, id: "photo-report" },
  );
  assert.equal(reported.reports.at(-1)?.snapshot?.image?.id, "photo");
  assert.ok(!("url" in reported.reports.at(-1)!.snapshot!.image!));
});
