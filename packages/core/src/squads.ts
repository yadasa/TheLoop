import type {
  Command,
  CommandContext,
  LoopState,
  Squad,
  SquadMessage,
} from "./types";
import { connected } from "./selectors";
import {bindPreviewImage} from './previewImages';
type SquadCommand = Extract<Command, { type: `squad.${string}` }>;
const text = (value: string, max: number, required = true) => {
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    throw new Error(`Enter ${required ? "1" : "0"}–${max} characters.`);
  return value.trim();
};

// The sample driver mirrors the trusted server's consent and audience boundaries.
// Its input is already a cloned state, so rejected commands never persist changes.
export function applySquadCommand(
  s: LoopState,
  cmd: SquadCommand,
  ctx: CommandContext,
): void {
  const uid = s.currentUserId,
    now = Date.parse(ctx.now),
    me = s.profiles.find((p) => p.id === uid);
  if (!me) throw new Error("Your profile is not available.");
  const expires = (squad: Squad) => {
    for (const invite of s.squadInvites)
      if (
        invite.squadId === squad.id &&
        invite.status === "pending" &&
        Date.parse(invite.expiresAt) <= now
      ) {
        invite.status = "expired";
        invite.respondedAt = ctx.now;
        squad.pendingInviteeIds = squad.pendingInviteeIds.filter(
          (id) => id !== invite.toId,
        );
      }
  };
  const squad = (id: string) => {
    const found = s.squads.find(
      (x) => x.id === id && !x.archived && x.memberIds.includes(uid),
    );
    if (!found) throw new Error("You are not a member of this squad.");
    expires(found);
    return found;
  };
  const owner = (value: Squad) => {
    if (value.ownerId !== uid)
      throw new Error("Only the squad owner can do that.");
  };
  const joined = (id: string) =>
    s.squads.filter((x) => !x.archived && x.memberIds.includes(id)).length;
  const member = (id: string) => {
    const p = s.profiles.find((x) => x.id === id);
    if (!p) throw new Error("Member is not available.");
    return {
      userId: p.id,
      name: p.name,
      initials: p.initials,
      joinedAt: ctx.now,
    };
  };
  const note = (
    userId: string,
    title: string,
    body: string,
    targetId: string,
    suffix: string,
  ) =>
    s.notifications.push({
      id: `${ctx.id}-${suffix}`,
      userId,
      title,
      body,
      kind: "squad",
      targetId,
      createdAt: ctx.now,
      read: false,
    });
  const invite = (value: Squad, target: string) => {
    if (
      target === uid ||
      !connected(s, target) ||
      s.preferences.blockedIds.includes(target)
    )
      throw new Error("Invite an accepted connection.");
    member(target);
    expires(value);
    if (
      value.memberIds.includes(target) ||
      value.pendingInviteeIds.includes(target)
    )
      throw new Error("This member is already in the squad or invited.");
    if (value.memberIds.length + value.pendingInviteeIds.length >= 12)
      throw new Error("Squads have room for 12 people, including invitations.");
    if (
      s.squadInvites.some(
        (i) =>
          i.squadId === value.id &&
          i.toId === target &&
          now - Date.parse(i.createdAt) < 86400000,
      )
    )
      throw new Error(
        "Give this connection 24 hours before another invitation.",
      );
    if (
      s.squadInvites.filter(
        (i) =>
          i.toId === target &&
          i.status === "pending" &&
          Date.parse(i.expiresAt) > now,
      ).length >= 50
    )
      throw new Error("This member has enough pending invitations for now.");
    const id = `${ctx.id}~${target}`;
    s.squadInvites.push({
      id,
      squadId: value.id,
      squadName: value.name,
      description: value.description,
      fromId: uid,
      toId: target,
      participantIds: [uid, target],
      status: "pending",
      createdAt: ctx.now,
      expiresAt: new Date(now + 7 * 86400000).toISOString(),
    });
    value.pendingInviteeIds.push(target);
    value.updatedAt = ctx.now;
    note(
      target,
      `${me.name} invited you to ${value.name}`,
      "Your place is waiting. Join only if it feels right.",
      id,
      `invite-${target}`,
    );
  };
  const depart = (value: Squad, target: string) => {
    value.memberIds = value.memberIds.filter((id) => id !== target);
    delete value.memberProfiles[target];
    for (const i of s.squadInvites)
      if (
        i.squadId === value.id &&
        i.status === "pending" &&
        (i.fromId === target || i.toId === target)
      ) {
        i.status = "revoked";
        i.respondedAt = ctx.now;
        value.pendingInviteeIds = value.pendingInviteeIds.filter(
          (id) => id !== i.toId,
        );
      }
    if (value.ownerId === target)
      value.ownerId =
        [...value.memberIds].sort(
          (a, b) =>
            value.memberProfiles[a].joinedAt.localeCompare(
              value.memberProfiles[b].joinedAt,
            ) || a.localeCompare(b),
        )[0] ?? "";
    if (!value.memberIds.length) {
      value.archived = true;
      value.pendingInviteeIds = [];
      for (const i of s.squadInvites)
        if (i.squadId === value.id && i.status === "pending") {
          i.status = "revoked";
          i.respondedAt = ctx.now;
        }
    }
    value.updatedAt = ctx.now;
  };
  const message = (id: string) => {
    const m = s.squadMessages.find((x) => x.id === id);
    if (!m) throw new Error("Message is no longer available.");
    const room = squad(m.squadId);
    if (!m.audienceIds.includes(uid))
      throw new Error("This message was sent before you joined.");
    return { m, room };
  };
  switch (cmd.type) {
    case "squad.create": {
      if (
        joined(uid) >= 50 ||
        s.squads.filter((x) => !x.archived && x.ownerId === uid).length >= 20
      )
        throw new Error("You have enough active squads for now.");
      const ids = [...new Set(cmd.inviteeIds ?? [])];
      if (ids.length > 11) throw new Error("Invite up to 11 connections.");
      const value: Squad = {
        id: ctx.id,
        name: text(cmd.name, 60),
        description: text(cmd.description ?? "", 500, false),
        ownerId: uid,
        memberIds: [uid],
        memberProfiles: { [uid]: member(uid) },
        pendingInviteeIds: [],
        createdAt: ctx.now,
        updatedAt: ctx.now,
        archived: false,
      };
      s.squads.push(value);
      for (const id of ids) invite(value, id);
      break;
    }
    case "squad.invite":
      invite(squad(cmd.squadId), cmd.userId);
      break;
    case "squad.respond": {
      const i = s.squadInvites.find(
        (x) => x.id === cmd.inviteId && x.toId === uid,
      );
      if (!i) throw new Error("Invitation is not available.");
      const value = s.squads.find((x) => x.id === i.squadId && !x.archived);
      if (!value) throw new Error("Squad is no longer active.");
      expires(value);
      if (i.status !== "pending")
        throw new Error("This invitation is no longer pending.");
      if (cmd.accept) {
        if (
          !value.memberIds.includes(i.fromId) ||
          !connected(s, i.fromId) ||
          value.memberIds.some((id) => s.preferences.blockedIds.includes(id))
        )
          throw new Error("This invitation is no longer available.");
        if (joined(uid) >= 50 || value.memberIds.length >= 12)
          throw new Error("There is no room for another squad membership.");
        value.memberIds.push(uid);
        value.memberProfiles[uid] = member(uid);
      }
      i.status = cmd.accept ? "accepted" : "declined";
      i.respondedAt = ctx.now;
      value.pendingInviteeIds = value.pendingInviteeIds.filter(
        (id) => id !== uid,
      );
      value.updatedAt = ctx.now;
      if (cmd.accept)
        note(
          i.fromId,
          `${me.name} joined ${value.name}`,
          "A little closer. Say hello.",
          value.id,
          "joined",
        );
      break;
    }
    case "squad.revoke": {
      const i = s.squadInvites.find((x) => x.id === cmd.inviteId);
      if (!i) throw new Error("Invitation is not available.");
      const value = squad(i.squadId);
      if (i.fromId !== uid && value.ownerId !== uid)
        throw new Error(
          "Only the inviter or owner can withdraw this invitation.",
        );
      if (i.status !== "pending")
        throw new Error("This invitation is no longer pending.");
      i.status = "revoked";
      i.respondedAt = ctx.now;
      value.pendingInviteeIds = value.pendingInviteeIds.filter(
        (id) => id !== i.toId,
      );
      value.updatedAt = ctx.now;
      break;
    }
    case "squad.leave":
      depart(squad(cmd.squadId), uid);
      break;
    case "squad.remove": {
      const value = squad(cmd.squadId);
      owner(value);
      if (cmd.userId === uid)
        throw new Error("Use leave to step out of your squad.");
      if (!value.memberIds.includes(cmd.userId))
        throw new Error("Member is not in this squad.");
      depart(value, cmd.userId);
      break;
    }
    case "squad.transfer": {
      const value = squad(cmd.squadId);
      owner(value);
      if (cmd.userId === uid || !value.memberIds.includes(cmd.userId))
        throw new Error("Choose another current member.");
      value.ownerId = cmd.userId;
      value.updatedAt = ctx.now;
      break;
    }
    case "squad.update": {
      const value = squad(cmd.squadId);
      owner(value);
      if (
        Object.keys(cmd.squad).some((k) => !["name", "description"].includes(k))
      )
        throw new Error("Only the squad name and description can change.");
      if (cmd.squad.name !== undefined) value.name = text(cmd.squad.name, 60);
      if (cmd.squad.description !== undefined)
        value.description = text(cmd.squad.description, 500, false);
      value.updatedAt = ctx.now;
      break;
    }
    case "squad.message.send": {
      const value = squad(cmd.squadId);
      if (cmd.replyTo) {
        const target = message(cmd.replyTo);
        if (target.room.id !== value.id)
          throw new Error("Replies stay inside their squad.");
      }
      const m: SquadMessage = {
        id: ctx.id,
        squadId: value.id,
        authorId: uid,
        authorName: me.name,
        authorInitials: me.initials,
        body: text(cmd.body, 4000),
        createdAt: ctx.now,
        audienceIds: value.memberIds.filter(
          (id) => !s.preferences.blockedIds.includes(id),
        ),
        reactions: {},
          ...(cmd.imageId!==undefined?{image:bindPreviewImage(s,cmd.imageId,{kind:'squad',id:value.id},{kind:'squadMessage',id:ctx.id},ctx.now)}:{}),
        ...(cmd.replyTo ? { replyTo: cmd.replyTo } : {}),
      };
      s.squadMessages.push(m);
      value.updatedAt = ctx.now;
      break;
    }
    case "squad.message.edit": {
      const { m, room } = message(cmd.messageId);
      if (m.authorId !== uid)
        throw new Error("Only the author can edit this message.");
      m.body = text(cmd.body, 4000);
      m.audienceIds = m.audienceIds.filter(
        (id) =>
          room.memberIds.includes(id) && !s.preferences.blockedIds.includes(id),
      );
      m.editedAt = ctx.now;
      break;
    }
    case "squad.message.delete": {
      const m = s.squadMessages.find((x) => x.id === cmd.messageId);
      if (!m) throw new Error("Message is no longer available.");
      if (m.authorId !== uid) {
        const room = message(m.id).room;
        if (room.ownerId !== uid)
          throw new Error("Only the author or owner can remove this message.");
      }
      s.squadMessages = s.squadMessages.filter((x) => x.id !== m.id);
      break;
    }
    case "squad.message.react": {
      const { m } = message(cmd.messageId);
      if (m.audienceIds.some((id) => s.preferences.blockedIds.includes(id)))
        throw new Error(
          "This message includes a blocked member. Send a new message instead of reacting.",
        );
      const emoji = text(cmd.emoji, 16);
      if (!["🖤", "☕", "🙌", "🔥", "😂", "🎉", "💯", "👍"].includes(emoji))
        throw new Error("Choose a supported reaction.");
      const ids = m.reactions[emoji] ?? [];
      m.reactions[emoji] = ids.includes(uid)
        ? ids.filter((id) => id !== uid)
        : [...ids, uid];
      break;
    }
    case "squad.read": {
      const value = squad(cmd.squadId);
      s.preferences.squadReadAt = {
        ...s.preferences.squadReadAt,
        [value.id]: ctx.now,
      };
      break;
    }
    case "squad.mute": {
      const value = squad(cmd.squadId),
        muted = s.preferences.squadMutedIds ?? [];
      s.preferences.squadMutedIds = cmd.muted
        ? [...new Set([...muted, value.id])]
        : muted.filter((id) => id !== value.id);
      break;
    }
  }
}
