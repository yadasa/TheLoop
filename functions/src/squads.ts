import { createHash } from "node:crypto";
import {
  assert,
  Doc,
  DomainError,
  id,
  list,
  pairId,
  text,
  toggle,
} from "./policy";
import { commandFields } from "./authorControls";
import type { Actor, TransactionStore } from "./service";
import { linkImage } from "./media";

export const SQUAD_CAPACITY = 12;
export const SQUAD_MEMBERSHIPS = 50;
const DAY = 86_400_000;
export function squadInviteId(squadId: string, userId: string): string {
  return `si_${createHash("sha256").update(`${squadId}\0${userId}`).digest("hex").slice(0, 40)}`;
}
export function activePending(user: Doc, now: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(user.pendingSquadInvites || {})
      .filter(([, expiry]) => Date.parse(String(expiry)) > Date.parse(now))
      .map(([key, expiry]) => [key, String(expiry)]),
  );
}
export function squadIdentity(profile: Doc, now: string): Doc {
  return {
    userId: profile.id,
    name: String(profile.name || "Loop member").slice(0, 80),
    initials: String(profile.initials || "LM").slice(0, 8),
    joinedAt: now,
  };
}
export async function readableSquadMessage(
  store: TransactionStore,
  uid: string,
  message: Doc,
): Promise<Doc> {
  const squad = await store.get(`squads/${message.squadId}`);
  assert(
    squad &&
      !squad.archived &&
      squad.memberIds.includes(uid) &&
      message.audienceIds?.includes(uid),
    "permission-denied",
    "This message is outside your current Squad history.",
  );
  return squad;
}

// The caller supplies its already-read user object. Mutating it lets the common command
// transaction write preferences and membership bookkeeping together without stale merges.
class SquadTransaction {
  constructor(
    readonly store: TransactionStore,
    readonly uid: string,
    readonly user: Doc,
    readonly now: string,
  ) {}
  async userFor(uid: string): Promise<Doc> {
    if (uid === this.uid) return this.user;
    const user = await this.store.get(`users/${uid}`);
    assert(user, "not-found", "This member is no longer available.");
    return user;
  }
  saveUser(uid: string, user: Doc): void {
    if (uid === this.uid) Object.assign(this.user, user);
    else this.store.set(`users/${uid}`, { ...user, updatedAt: this.now });
  }
  async settle(squad: Doc, invite: Doc, status: string): Promise<void> {
    if (invite.status !== "pending") return;
    const recipient = await this.store.get(`users/${invite.toId}`);
    if (recipient || invite.toId === this.uid) {
      const user = await this.userFor(invite.toId),
        pending = { ...user.pendingSquadInvites };
      delete pending[invite.id];
      this.saveUser(invite.toId, { ...user, pendingSquadInvites: pending });
    }
    squad.pendingInviteeIds = (squad.pendingInviteeIds || []).filter(
      (value: string) => value !== invite.toId,
    );
    this.store.set(`squadInvites/${invite.id}`, {
      ...invite,
      status,
      respondedAt: this.now,
    });
  }
  async prune(squad: Doc): Promise<void> {
    for (const uid of [...(squad.pendingInviteeIds || [])]) {
      const invite = await this.store.get(
        `squadInvites/${squadInviteId(squad.id, uid)}`,
      );
      if (invite?.status === "pending") {
        if (Date.parse(invite.expiresAt) <= Date.parse(this.now))
          await this.settle(squad, invite, "expired");
        else if (!squad.memberIds.includes(invite.fromId))
          await this.settle(squad, invite, "revoked");
      } else
        squad.pendingInviteeIds = squad.pendingInviteeIds.filter(
          (value: string) => value !== uid,
        );
    }
  }
  async member(squadId: unknown): Promise<Doc> {
    const squad = await this.store.get(`squads/${id(squadId)}`);
    assert(squad, "not-found", "This Squad is no longer available.");
    assert(
      !squad.archived && squad.memberIds.includes(this.uid),
      "permission-denied",
      "Join this Squad by accepting an invitation first.",
    );
    return squad;
  }
  async unblocked(
    squad: Doc,
    recipient: string,
    recipientUser: Doc,
  ): Promise<void> {
    for (const uid of squad.memberIds as string[]) {
      const member = await this.userFor(uid);
      assert(
        !member.preferences?.blockedIds?.includes(recipient) &&
          !recipientUser.preferences?.blockedIds?.includes(uid),
        "permission-denied",
        "This invitation conflicts with a member's block settings.",
      );
    }
  }
  async audience(squad: Doc, preferences: Doc): Promise<string[]> {
    const audience: string[] = [];
    for (const uid of squad.memberIds as string[]) {
      const member = await this.userFor(uid);
      if (
        !member.disabled &&
        !member.deletionPending &&
        !preferences.blockedIds?.includes(uid) &&
        !member.preferences?.blockedIds?.includes(this.uid)
      )
        audience.push(uid);
    }
    return audience;
  }
  async invite(
    squad: Doc,
    recipientId: unknown,
    requestId: string,
  ): Promise<string> {
    const recipient = id(recipientId);
    assert(
      recipient !== this.uid && !squad.memberIds.includes(recipient),
      "already-exists",
      "This person is already in the Squad.",
    );
    const [user, connection] = await Promise.all([
      this.userFor(recipient),
      this.store.get(`connections/${pairId(this.uid, recipient)}`),
    ]);
    assert(
      !user.disabled && !user.deletionPending,
      "failed-precondition",
      "This member is unavailable.",
    );
    assert(
      connection?.status === "accepted",
      "permission-denied",
      "Invite an accepted connection to your Squad.",
    );
    await this.unblocked(squad, recipient, user);
    const inviteId = squadInviteId(squad.id, recipient),
      previous = await this.store.get(`squadInvites/${inviteId}`);
    assert(
      previous?.status !== "pending" ||
        Date.parse(previous.expiresAt) <= Date.parse(this.now),
      "already-exists",
      "An invitation is already waiting for this person.",
    );
    assert(
      !previous ||
        Date.parse(this.now) -
          Date.parse(previous.respondedAt || previous.createdAt) >=
          DAY,
      "resource-exhausted",
      "Wait 24 hours before inviting this person to the same Squad again.",
    );
    assert(
      squad.memberIds.length + squad.pendingInviteeIds.length < SQUAD_CAPACITY,
      "resource-exhausted",
      "A Squad can hold 12 members and reserved invitations combined.",
    );
    assert(
      (user.activeSquadIds || []).length < SQUAD_MEMBERSHIPS,
      "resource-exhausted",
      "This person has reached their active Squad limit.",
    );
    const pending = activePending(user, this.now);
    assert(
      Object.keys(pending).length < 50,
      "resource-exhausted",
      "This person's invitation inbox is full.",
    );
    const expiresAt = new Date(Date.parse(this.now) + 7 * DAY).toISOString();
    this.store.set(`squadInvites/${inviteId}`, {
      id: inviteId,
      squadId: squad.id,
      squadName: squad.name,
      description: squad.description,
      fromId: this.uid,
      toId: recipient,
      participantIds: [this.uid, recipient],
      status: "pending",
      createdAt: this.now,
      expiresAt,
    });
    this.saveUser(recipient, {
      ...user,
      pendingSquadInvites: { ...pending, [inviteId]: expiresAt },
    });
    squad.pendingInviteeIds.push(recipient);
    const noticeId = `squad_${inviteId}_${requestId}`;
    this.store.set(`notifications/${noticeId}`, {
      id: noticeId,
      userId: recipient,
      title: "A private Squad invitation",
      body: `You've been invited to ${squad.name}. Accept to share your name and join new conversations.`,
      kind: "squad",
      targetId: squad.id,
      createdAt: this.now,
      read: false,
      unreadUserId: recipient,
    });
    return inviteId;
  }
  async detach(squad: Doc, departing: string): Promise<void> {
    const memberUser = await this.store.get(`users/${departing}`);
    if (memberUser || departing === this.uid) {
      const user = await this.userFor(departing),
        reads = { ...user.preferences?.squadReadAt };
      delete reads[squad.id];
      this.saveUser(departing, {
        ...user,
        activeSquadIds: (user.activeSquadIds || []).filter(
          (value: string) => value !== squad.id,
        ),
        preferences: {
          ...user.preferences,
          squadReadAt: reads,
          squadMutedIds: (user.preferences?.squadMutedIds || []).filter(
            (value: string) => value !== squad.id,
          ),
        },
      });
    }
    squad.memberIds = squad.memberIds.filter(
      (value: string) => value !== departing,
    );
    squad.memberProfiles = { ...squad.memberProfiles };
    delete squad.memberProfiles[departing];
    if (squad.ownerId === departing)
      squad.ownerId =
        [...squad.memberIds].sort(
          (a, b) =>
            String(squad.memberProfiles[a]?.joinedAt || "").localeCompare(
              String(squad.memberProfiles[b]?.joinedAt || ""),
            ) || a.localeCompare(b),
        )[0] || "";
    squad.archived = squad.memberIds.length === 0;
    for (const recipient of [...squad.pendingInviteeIds]) {
      const invite = await this.store.get(
        `squadInvites/${squadInviteId(squad.id, recipient)}`,
      );
      if (invite && (squad.archived || invite.fromId === departing))
        await this.settle(squad, invite, "revoked");
    }
    squad.updatedAt = this.now;
    this.store.set(`squads/${squad.id}`, squad);
  }
}

export async function executeSquad(
  store: TransactionStore,
  actor: Actor,
  user: Doc,
  profile: Doc,
  preferences: Doc,
  command: Doc,
  requestId: string,
  now: string,
): Promise<Doc> {
  const context = new SquadTransaction(store, actor.uid, user, now),
    type = command.type;
  let result: Doc = { ok: true, id: requestId };
  if (type === "squad.create") {
    commandFields(command, ["type", "name", "description", "inviteeIds"]);
    const invitees = list(command.inviteeIds || [], "Invitees", 11, 128).map(
      id,
    );
    assert(
      (user.activeSquadIds || []).length < SQUAD_MEMBERSHIPS,
      "resource-exhausted",
      "Leave a Squad before joining more than 50 active Squads.",
    );
    assert(
      (await store.find("squads", "ownerId", actor.uid, 21)).filter(
        (squad) => !squad.archived,
      ).length < 20,
      "resource-exhausted",
      "You can create up to 20 active Squads.",
    );
    const squad: Doc = {
      id: requestId,
      name: text(command.name, "Squad name", 60),
      description: text(command.description || "", "Squad description", 500, 0),
      ownerId: actor.uid,
      memberIds: [actor.uid],
      memberProfiles: { [actor.uid]: squadIdentity(profile, now) },
      pendingInviteeIds: [],
      createdAt: now,
      updatedAt: now,
      archived: false,
    };
    user.activeSquadIds = [...(user.activeSquadIds || []), squad.id];
    for (const uid of invitees) await context.invite(squad, uid, requestId);
    store.set(`squads/${squad.id}`, squad);
  } else if (type === "squad.respond" || type === "squad.revoke") {
    commandFields(
      command,
      type === "squad.respond"
        ? ["type", "inviteId", "accept"]
        : ["type", "inviteId"],
    );
    const invite = await store.get(`squadInvites/${id(command.inviteId)}`);
    assert(invite, "not-found", "This invitation is no longer available.");
    const squad = await store.get(`squads/${invite.squadId}`);
    assert(squad, "not-found", "This Squad is no longer available.");
    if (type === "squad.respond") {
      assert(
        invite.toId === actor.uid,
        "permission-denied",
        "Only the invited person can respond.",
      );
      assert(
        typeof command.accept === "boolean",
        "invalid-argument",
        "Accept or decline this invitation.",
      );
    } else
      assert(
        invite.fromId === actor.uid ||
          (squad.ownerId === actor.uid && squad.memberIds.includes(actor.uid)),
        "permission-denied",
        "Only the inviter or current Squad owner can revoke this invitation.",
      );
    assert(
      invite.status === "pending",
      "failed-precondition",
      "This invitation has already been answered.",
    );
    if (Date.parse(invite.expiresAt) <= Date.parse(now)) {
      await context.settle(squad, invite, "expired");
      result = { ...result, expired: true };
    } else if (type === "squad.revoke" || !command.accept)
      await context.settle(
        squad,
        invite,
        type === "squad.revoke" ? "revoked" : "declined",
      );
    else {
      assert(
        !squad.archived && squad.memberIds.includes(invite.fromId),
        "failed-precondition",
        "The inviter has left this Squad.",
      );
      const inviter = await context.userFor(invite.fromId),
        connection = await store.get(
          `connections/${pairId(actor.uid, invite.fromId)}`,
        );
      assert(
        !inviter.disabled &&
          !inviter.deletionPending &&
          connection?.status === "accepted",
        "permission-denied",
        "Your connection with the inviter must still be accepted.",
      );
      await context.unblocked(squad, actor.uid, user);
      assert(
        (user.activeSquadIds || []).length < SQUAD_MEMBERSHIPS,
        "resource-exhausted",
        "Leave a Squad before joining more than 50 active Squads.",
      );
      assert(
        squad.memberIds.length < SQUAD_CAPACITY,
        "resource-exhausted",
        "This Squad is full.",
      );
      await context.settle(squad, invite, "accepted");
      squad.memberIds.push(actor.uid);
      squad.memberProfiles = {
        ...squad.memberProfiles,
        [actor.uid]: squadIdentity(profile, now),
      };
      user.activeSquadIds = [
        ...new Set([...(user.activeSquadIds || []), squad.id]),
      ];
    }
    squad.updatedAt = now;
    store.set(`squads/${squad.id}`, squad);
    result.squadId = squad.id;
  } else if (
    [
      "squad.message.edit",
      "squad.message.delete",
      "squad.message.react",
    ].includes(type)
  ) {
    commandFields(command, [
      "type",
      "messageId",
      ...(type === "squad.message.edit"
        ? ["body"]
        : type === "squad.message.react"
          ? ["emoji"]
          : []),
    ]);
    const message = await store.get(`squadMessages/${id(command.messageId)}`);
    assert(message, "not-found", "This message is no longer available.");
    const squad =
      type === "squad.message.delete" && message.authorId === actor.uid
        ? undefined
        : await readableSquadMessage(store, actor.uid, message);
    if (type === "squad.message.edit") {
      assert(
        message.authorId === actor.uid,
        "permission-denied",
        "Only the author can edit this message.",
      );
      store.set(`squadMessages/${message.id}`, {
        ...message,
        body: text(command.body, "Message", 4000),
        editedAt: now,
        audienceIds: (await context.audience(squad!, preferences)).filter(
          (uid) => message.audienceIds.includes(uid),
        ),
      });
    } else if (type === "squad.message.delete") {
      assert(
        message.authorId === actor.uid || squad?.ownerId === actor.uid,
        "permission-denied",
        "Only the author or an owner in the message audience can remove it.",
      );
      store.remove(`squadMessages/${message.id}`);
      store.set(`moderationAudit/${requestId}`, {
        id: requestId,
        actorId: actor.uid,
        action: "squadMessage.delete",
        targetType: "squadMessage",
        targetId: message.id,
        subjectAuthorId: message.authorId,
        authorization:
          message.authorId === actor.uid ? "author" : "squad-owner",
        createdAt: now,
      });
    } else {
      const emoji = text(command.emoji, "Reaction", 16);
      assert(
        [
          "♥",
          "❤️",
          "🔥",
          "👏",
          "🙌",
          "😂",
          "💯",
          "👍",
          "🎉",
          "🤝",
          "🖤",
          "👀",
          "☕",
          "🍽️",
          "✨",
          "✅",
        ].includes(emoji),
        "invalid-argument",
        "Choose a supported reaction.",
      );
      if (!message.reactions?.[emoji]?.includes(actor.uid)) {
        const audience = await context.audience(squad!, preferences);
        assert(
          message.audienceIds
            .filter((uid: string) => squad!.memberIds.includes(uid))
            .every((uid: string) => audience.includes(uid)),
          "permission-denied",
          "A blocked member can still read this old message. React to a newer message with an unblocked audience instead.",
        );
      }
      store.set(`squadMessages/${message.id}`, {
        ...message,
        reactions: {
          ...message.reactions,
          [emoji]: toggle(message.reactions?.[emoji] || [], actor.uid),
        },
      });
    }
  } else {
    const squad = await context.member(command.squadId);
    await context.prune(squad);
    if (type === "squad.invite") {
      commandFields(command, ["type", "squadId", "userId"]);
      result.inviteId = await context.invite(squad, command.userId, requestId);
    } else if (type === "squad.leave" || type === "squad.remove") {
      commandFields(
        command,
        type === "squad.leave"
          ? ["type", "squadId"]
          : ["type", "squadId", "userId"],
      );
      const departing = type === "squad.leave" ? actor.uid : id(command.userId);
      assert(
        type === "squad.leave" ||
          (squad.ownerId === actor.uid && departing !== actor.uid),
        "permission-denied",
        "The owner can remove another member; use Leave for yourself.",
      );
      assert(
        squad.memberIds.includes(departing),
        "not-found",
        "This person is not an active member.",
      );
      await context.detach(squad, departing);
      if (departing === actor.uid) {
        preferences.squadReadAt = user.preferences?.squadReadAt || {};
        preferences.squadMutedIds = user.preferences?.squadMutedIds || [];
      }
    } else if (type === "squad.transfer") {
      commandFields(command, ["type", "squadId", "userId"]);
      const target = id(command.userId);
      assert(
        squad.ownerId === actor.uid &&
          target !== actor.uid &&
          squad.memberIds.includes(target),
        "permission-denied",
        "Transfer ownership to another active Squad member.",
      );
      squad.ownerId = target;
    } else if (type === "squad.update") {
      commandFields(command, ["type", "squadId", "squad"]);
      assert(
        squad.ownerId === actor.uid,
        "permission-denied",
        "Only the owner can change Squad details.",
      );
      const patch = command.squad;
      assert(
        patch &&
          typeof patch === "object" &&
          !Array.isArray(patch) &&
          Object.keys(patch).length > 0 &&
          Object.keys(patch).every((key) =>
            ["name", "description"].includes(key),
          ),
        "invalid-argument",
        "Edit only the Squad name or description.",
      );
      if ("name" in patch) squad.name = text(patch.name, "Squad name", 60);
      if ("description" in patch)
        squad.description = text(
          patch.description,
          "Squad description",
          500,
          0,
        );
      for (const recipient of squad.pendingInviteeIds) {
        const invite = await store.get(
          `squadInvites/${squadInviteId(squad.id, recipient)}`,
        );
        if (invite?.status === "pending")
          store.set(`squadInvites/${invite.id}`, {
            ...invite,
            squadName: squad.name,
            description: squad.description,
          });
      }
    } else if (type === "squad.read") {
      commandFields(command, ["type", "squadId"]);
      preferences.squadReadAt = { ...preferences.squadReadAt, [squad.id]: now };
    } else if (type === "squad.mute") {
      commandFields(command, ["type", "squadId", "muted"]);
      assert(
        typeof command.muted === "boolean",
        "invalid-argument",
        "Choose whether to mute this Squad.",
      );
      preferences.squadMutedIds = (preferences.squadMutedIds || []).filter(
        (value: string) => value !== squad.id,
      );
      if (command.muted) preferences.squadMutedIds.push(squad.id);
    } else if (type === "squad.message.send") {
      commandFields(command, ["type", "squadId", "body", "replyTo", "imageId"]);
      let audienceIds = await context.audience(squad, preferences);
      if (command.replyTo) {
        const reply = await store.get(`squadMessages/${id(command.replyTo)}`);
        assert(
          reply && reply.squadId === squad.id,
          "not-found",
          "That reply is no longer available in this Squad.",
        );
        await readableSquadMessage(store, actor.uid, reply);
        audienceIds = audienceIds.filter((uid) =>
          reply.audienceIds.includes(uid),
        );
      }
      const message: Doc = {
        id: requestId,
        squadId: squad.id,
        authorId: actor.uid,
        authorName: profile.name,
        authorInitials: profile.initials,
        body: text(command.body, "Message", 4000),
        createdAt: now,
        audienceIds,
        reactions: {},
        ...(command.replyTo ? { replyTo: id(command.replyTo) } : {}),
      };
      const image = await linkImage(
        store,
        actor.uid,
        user,
        command.imageId,
        { kind: "squad", id: squad.id },
        "squadMessages",
        requestId,
        message.body,
        now,
      );
      if (image) message.image = image;
      store.set(`squadMessages/${requestId}`, message);
      for (const uid of audienceIds.filter((uid) => uid !== actor.uid)) {
        if (
          (await context.userFor(uid)).preferences?.squadMutedIds?.includes(
            squad.id,
          )
        )
          continue;
        const noticeId = `squad_message_${requestId}_${uid}`;
        store.set(`notifications/${noticeId}`, {
          id: noticeId,
          userId: uid,
          title: "A new Squad message",
          body: `${profile.name} sent a message in ${squad.name}.`,
          kind: "squad",
          targetId: squad.id,
          createdAt: now,
          read: false,
          unreadUserId: uid,
        });
      }
      preferences.squadReadAt = { ...preferences.squadReadAt, [squad.id]: now };
      result.audienceCount = audienceIds.length;
    } else throw new DomainError("invalid-argument", "Unknown Squad action.");
    // Mark-read alone must not reorder the shared catalog for everybody.
    if (!["squad.read", "squad.mute"].includes(type)) squad.updatedAt = now;
    store.set(`squads/${squad.id}`, squad);
  }
  return result;
}

export async function expireSquadInvitation(
  store: TransactionStore,
  inviteId: string,
  now: string,
): Promise<void> {
  const invite = await store.get(`squadInvites/${inviteId}`);
  if (
    !invite ||
    invite.status !== "pending" ||
    Date.parse(invite.expiresAt) > Date.parse(now)
  )
    return;
  const squad = await store.get(`squads/${invite.squadId}`);
  const user = await store.get(`users/${invite.toId}`);
  const context = new SquadTransaction(store, invite.toId, user || {}, now);
  await context.settle(squad || { pendingInviteeIds: [] }, invite, "expired");
  if (user)
    store.set(`users/${invite.toId}`, { ...context.user, updatedAt: now });
  if (squad) store.set(`squads/${squad.id}`, { ...squad, updatedAt: now });
}

export async function revokeDeletedSquadInvitation(
  store: TransactionStore,
  inviteId: string,
  now: string,
): Promise<void> {
  const invite = await store.get(`squadInvites/${inviteId}`);
  if (!invite) return;
  const [squad, user] = await Promise.all([
    store.get(`squads/${invite.squadId}`),
    store.get(`users/${invite.toId}`),
  ]);
  if (invite.status === "pending") {
    const context = new SquadTransaction(store, invite.toId, user || {}, now);
    await context.settle(squad || { pendingInviteeIds: [] }, invite, "revoked");
    if (user)
      store.set(`users/${invite.toId}`, { ...context.user, updatedAt: now });
    if (squad) store.set(`squads/${squad.id}`, { ...squad, updatedAt: now });
  }
  store.remove(`squadInvites/${inviteId}`);
}

export async function revokeBlockedSquadInvites(
  store: TransactionStore,
  uid: string,
  user: Doc,
  peerId: string,
  peerUser: Doc | undefined,
  now: string,
): Promise<void> {
  const context = new SquadTransaction(store, uid, user, now);
  const inviteIds = new Set([
    ...Object.keys(user.pendingSquadInvites || {}),
    ...Object.keys(peerUser?.pendingSquadInvites || {}),
  ]);
  for (const inviteId of inviteIds) {
    const invite = await store.get(`squadInvites/${inviteId}`);
    if (
      !invite ||
      invite.status !== "pending" ||
      !(
        (invite.fromId === uid && invite.toId === peerId) ||
        (invite.fromId === peerId && invite.toId === uid)
      )
    )
      continue;
    const squad = await store.get(`squads/${invite.squadId}`);
    if (squad) {
      await context.settle(squad, invite, "revoked");
      store.set(`squads/${squad.id}`, { ...squad, updatedAt: now });
    }
  }
}

export async function detachDeletedSquadMember(
  store: TransactionStore,
  squadId: string,
  uid: string,
  now: string,
): Promise<void> {
  const [squad, user] = await Promise.all([
    store.get(`squads/${squadId}`),
    store.get(`users/${uid}`),
  ]);
  if (!squad?.memberIds?.includes(uid)) return;
  const context = new SquadTransaction(store, uid, user || {}, now);
  await context.detach(squad, uid);
  if (user) store.set(`users/${uid}`, { ...context.user, updatedAt: now });
}
