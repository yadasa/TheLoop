import {
  assert,
  calculateTrust,
  defaultPreferences,
  Doc,
  DomainError,
  httpsUrl,
  id,
  list,
  pairId,
  text,
  toggle,
  validatePreferences,
  validateProfile,
} from "./policy";
import { updatePins, removeMessagePin } from "./pins";
import { withContributors } from "./contributions";
import { commandFields, editablePost } from "./authorControls";
import { directoryFields } from "./directory.js";
import { linkImage } from "./media";
import { authorSnapshot, participationIdentity } from "./identity";
import { canSendDirectMessage } from "./directMessages";
import { absoluteEventInstant } from "./eventDates";
import {
  assertEventCheckinWindow,
  cancelEvent,
  editEvent,
  eventRsvpTransition,
} from "./eventLifecycle";
import { eventChangeJob } from "./eventChangeJobs";
import {
  catalogDirectMessage,
  readDirectConversation,
  updateDirectPreview,
} from "./directConversations";
import {
  executeSquad,
  readableSquadMessage,
  revokeBlockedSquadInvites,
} from "./squads";

export interface TransactionStore {
  get(path: string): Promise<Doc | undefined>;
  find(
    collection: string,
    field: string,
    value: unknown,
    limit: number,
    secondary?: { field: string; value: unknown },
  ): Promise<Doc[]>;
  set(path: string, value: Doc): void;
  remove(path: string): void;
}
export type Actor = { uid: string; emailVerified: boolean; name?: string };
export type Request = { requestId: string; command: Doc };

export async function bootstrap(
  store: TransactionStore,
  actor: Actor,
  now: string,
  name?: unknown,
): Promise<Doc> {
  const userPath = `users/${actor.uid}`;
  const profilePath = `profiles/${actor.uid}`;
  const [existingUser, existingProfile, signals] = await Promise.all([
    store.get(userPath),
    store.get(profilePath),
    store.get(`trustSignals/${actor.uid}`),
  ]);
  if (existingUser && existingProfile) {
    const fields = directoryFields(existingProfile);
    if (
      existingProfile.nameKey !== fields.nameKey ||
      JSON.stringify(existingProfile.searchKeys) !==
        JSON.stringify(fields.searchKeys)
    )
      store.set(profilePath, { ...existingProfile, ...fields });
    return {
      userId: actor.uid,
      preferences: existingUser.preferences,
      role:
        existingUser.role === "admin" || existingUser.role === "moderator"
          ? existingUser.role
          : "member",
    };
  }
  const displayName = text(name || actor.name || "Loop member", "Name", 80);
  const profile: Doc = existingProfile || {
    id: actor.uid,
    name: displayName,
    handle: `loop-${actor.uid.slice(0, 12).toLowerCase()}`,
    headline: "",
    company: "",
    location: "",
    bio: "",
    initials: displayName
      .split(/\s+/)
      .slice(0, 2)
      .map((p: string) => p[0])
      .join("")
      .toUpperCase(),
    skills: [],
    interests: [],
    links: [],
    joinedAt: now,
    verified: false,
    visibility: "public",
    openTo: [],
    followerCount: 0,
    followingCount: 0,
  };
  const serverSignals = {
    ...(signals || {}),
    emailVerified: actor.emailVerified,
    acceptedConnections: signals?.acceptedConnections || 0,
    verifiedAttendance: signals?.verifiedAttendance || 0,
  };
  profile.trust = calculateTrust(profile, serverSignals, now);
  Object.assign(profile, directoryFields(profile));
  const preferences = existingUser?.preferences || defaultPreferences();
  store.set(userPath, {
    ...(existingUser || {}),
    id: actor.uid,
    preferences,
    createdAt: existingUser?.createdAt || now,
    updatedAt: now,
  });
  store.set(profilePath, profile);
  store.set(`trustSignals/${actor.uid}`, serverSignals);
  return {
    userId: actor.uid,
    preferences,
    role:
      existingUser?.role === "admin" || existingUser?.role === "moderator"
        ? existingUser.role
        : "member",
  };
}

export async function execute(
  store: TransactionStore,
  actor: Actor,
  request: Request,
  now: string,
): Promise<Doc> {
  const requestId = id(request.requestId);
  const command = request.command;
  assert(
    command && typeof command === "object" && !Array.isArray(command),
    "invalid-argument",
    "Provide a command.",
  );
  const commandType = text(command.type, "Command", 60);
  const receiptPath = `users/${actor.uid}/requests/${requestId}`;
  const receipt = await store.get(receiptPath);
  if (receipt) return { ...receipt.result, duplicate: true };
  const [user, profile, rate, signals] = await Promise.all([
    store.get(`users/${actor.uid}`),
    store.get(`profiles/${actor.uid}`),
    store.get(`users/${actor.uid}/system/rate`),
    store.get(`trustSignals/${actor.uid}`),
  ]);
  assert(
    user && profile && !user.disabled && !user.deletionPending,
    "failed-precondition",
    "Complete account setup before continuing.",
  );
  const prefs = { ...defaultPreferences(), ...user.preferences };
  const bucket = Math.floor(Date.parse(now) / 60000);
  const count = rate?.bucket === bucket ? Number(rate.count || 0) : 0;
  assert(
    count < 45,
    "resource-exhausted",
    "Take a breath. Please try again in a minute.",
  );
  const day = now.slice(0, 10);
  const dailyCount = rate?.day === day ? Number(rate.dailyCount || 0) : 0;
  assert(
    dailyCount < 2000,
    "resource-exhausted",
    "Daily activity limit reached. Please try again tomorrow.",
  );
  const entityId = requestId;
  let result: Doc = { ok: true, id: entityId };
  let prefsChanged = false;
  let profileChanged = false;
  let signalsChanged = false;
  const serverSignals: Doc = {
    ...(signals || {}),
    emailVerified: actor.emailVerified,
  };

  async function requireDoc(
    collection: string,
    resourceId: unknown,
  ): Promise<Doc> {
    const resource = await store.get(`${collection}/${id(resourceId)}`);
    assert(resource, "not-found", "That item is no longer available.");
    return resource;
  }
  async function channelAccess(channelId: unknown): Promise<Doc> {
    const channel = await requireDoc("channels", channelId);
    assert(
      channel.visibility === "public" || channel.memberIds?.includes(actor.uid),
      "permission-denied",
      "Join this private channel before participating.",
    );
    return channel;
  }
  async function communityAccess(communityId: unknown): Promise<Doc> {
    const community = await requireDoc("communities", communityId);
    assert(
      prefs.joinedCommunityIds.includes(community.id),
      "permission-denied",
      "Join this community before participating.",
    );
    return community;
  }
  async function canManageChannel(channel: Doc): Promise<boolean> {
    if (
      user?.role === "admin" ||
      user?.role === "moderator" ||
      channel.moderatorIds?.includes(actor.uid)
    )
      return true;
    if (!channel.communityId) return false;
    const community = await requireDoc("communities", channel.communityId);
    return community.moderatorIds?.includes(actor.uid) === true;
  }
  async function requirePeer(
    peerId: unknown,
  ): Promise<{ userId: string; user: Doc; profile: Doc }> {
    const userId = id(peerId);
    assert(
      userId !== actor.uid,
      "invalid-argument",
      "Choose another community member.",
    );
    const [peer, peerProfile] = await Promise.all([
      store.get(`users/${userId}`),
      store.get(`profiles/${userId}`),
    ]);
    assert(
      peer && peerProfile && !peer.disabled && !peer.deletionPending,
      "not-found",
      "This member is unavailable.",
    );
    assert(
      !prefs.blockedIds.includes(userId) &&
        !peer.preferences?.blockedIds?.includes(actor.uid),
      "permission-denied",
      "This interaction is unavailable.",
    );
    return { userId, user: peer, profile: peerProfile };
  }
  async function notify(
    userId: string,
    title: string,
    body: string,
    kind: string,
    targetId: string,
    suffix: string,
  ): Promise<void> {
    if (userId === actor.uid) return;
    const recipient = await store.get(`users/${userId}`);
    if (
      !recipient ||
      recipient.disabled ||
      recipient.deletionPending ||
      recipient.preferences?.blockedIds?.includes(actor.uid)
    )
      return;
    if (
      suffix === "dm" &&
      recipient.preferences?.dmMutedIds?.includes(actor.uid)
    )
      return;
    const notificationId = `${requestId}_${suffix}`;
    store.set(`notifications/${notificationId}`, {
      id: notificationId,
      userId,
      title,
      body,
      kind,
      targetId,
      createdAt: now,
      read: false,
      unreadUserId: userId,
      ...(suffix === "dm" ? { dmSenderId: actor.uid } : {}),
      ...(kind === "event" && suffix === "promoted"
        ? { eventNoticeType: "promoted" }
        : {}),
    });
  }
  function savePreferences(): void {
    prefsChanged = true;
  }
  function auditRemoval(
    targetType: "post" | "comment" | "directMessage",
    targetId: string,
    subjectAuthorId: string,
    postId: string,
  ): void {
    store.set(`moderationAudit/${requestId}`, {
      id: requestId,
      actorId: actor.uid,
      action: `${targetType}.delete`,
      targetType,
      targetId,
      postId,
      subjectAuthorId,
      authorization:
        subjectAuthorId === actor.uid ? "author" : "global-moderator",
      createdAt: now,
    });
  }

  switch (commandType) {
    case "conference.create": {
      assert(
        user.role === "admin",
        "permission-denied",
        "Only a community administrator can create a conference hub.",
      );
      const input = command.conference;
      assert(
        input && typeof input === "object",
        "invalid-argument",
        "Provide conference details.",
      );
      const startDate = text(input.startDate, "Start date", 10);
      const endDate = text(input.endDate, "End date", 10);
      assert(
        /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
          /^\d{4}-\d{2}-\d{2}$/.test(endDate) &&
          Number.isFinite(Date.parse(startDate)) &&
          Number.isFinite(Date.parse(endDate)) &&
          endDate >= startDate,
        "invalid-argument",
        "Choose a valid conference date range.",
      );
      store.set(`conferences/${entityId}`, {
        id: entityId,
        name: text(input.name, "Conference name", 100),
        shortName: text(input.shortName, "Short name", 4),
        city: text(input.city, "City", 120),
        startDate,
        endDate,
        description: text(input.description, "Description", 3000),
        members: 0,
        tagline: text(input.tagline || "", "Tagline", 140, 0),
        organizerIds: [actor.uid],
        createdAt: now,
      });
      break;
    }
    case "channel.create": {
      const input = command.channel;
      assert(
        input && typeof input === "object",
        "invalid-argument",
        "Provide channel details.",
      );
      const conference = await requireDoc("conferences", input.conferenceId);
      let community: Doc | undefined;
      if (input.communityId)
        community = await requireDoc("communities", input.communityId);
      assert(
        user.role === "admin" || user.role === "moderator",
        "permission-denied",
        "Channel creation requires an administrator or global moderator.",
      );
      const ownedChannels = await store.find(
        "channels",
        "creatorId",
        actor.uid,
        1001,
      );
      assert(
        ownedChannels.length < (user.role === "admin" ? 1000 : 100),
        "resource-exhausted",
        "Channel creation limit reached.",
      );
      const name = text(input.name, "Channel name", 50).toLowerCase();
      assert(
        /^[a-z0-9][a-z0-9-]{0,49}$/.test(name),
        "invalid-argument",
        "Use a channel name with letters, numbers and dashes.",
      );
      assert(
        input.visibility === "public" || input.visibility === "private",
        "invalid-argument",
        "Choose public or private visibility.",
      );
      const topics = input.topics
        ? list(input.topics, "Topics", 30, 80)
        : ["General"];
      assert(topics.length > 0, "invalid-argument", "Add at least one topic.");
      const memberIds =
        input.visibility === "private"
          ? [
              ...new Set([
                actor.uid,
                ...list(input.memberIds || [], "Members", 250, 128).map(
                  (value) => id(value),
                ),
              ]),
            ]
          : [];
      for (const memberId of memberIds) await requireDoc("users", memberId);
      store.set(`channels/${entityId}`, {
        id: entityId,
        conferenceId: conference.id,
        name,
        description: text(input.description, "Description", 1000),
        icon: text(input.icon || "#", "Icon", 8),
        members: input.visibility === "private" ? memberIds.length : 1,
        topics,
        visibility: input.visibility,
        ...(input.visibility === "private" ? { memberIds } : {}),
        ...(community ? { communityId: community.id } : {}),
        moderatorIds: [actor.uid],
        creatorId: actor.uid,
        createdAt: now,
      });
      prefs.subscriptions = { ...prefs.subscriptions, [entityId]: "following" };
      savePreferences();
      break;
    }
    case "topic.create": {
      const channel = await channelAccess(command.channelId);
      const moderator = await canManageChannel(channel);
      const following =
        prefs.subscriptions[channel.id] === "following" ||
        prefs.subscriptions[channel.conferenceId] === "following";
      assert(
        moderator ||
          channel.memberIds?.includes(actor.uid) ||
          (channel.visibility === "public" && following),
        "permission-denied",
        "Follow this channel before starting a topic.",
      );
      const name = text(command.name, "Topic name", 80);
      const topics = channel.topics || [];
      assert(
        topics.length < 30,
        "resource-exhausted",
        "This channel has reached its topic limit.",
      );
      assert(
        !topics.some(
          (topic: string) =>
            topic.toLocaleLowerCase() === name.toLocaleLowerCase(),
        ),
        "already-exists",
        "This topic already exists.",
      );
      store.set(`channels/${channel.id}`, {
        ...channel,
        topics: [...topics, name],
      });
      result.id = channel.id;
      break;
    }
    case "channel.member": {
      const channel = await requireDoc("channels", command.channelId);
      assert(
        channel.visibility === "private",
        "failed-precondition",
        "Public channels use subscriptions. Manage membership only for private channels.",
      );
      assert(
        await canManageChannel(channel),
        "permission-denied",
        "Only this channel’s moderators can change membership.",
      );
      const targetId = id(command.userId);
      assert(
        typeof command.add === "boolean",
        "invalid-argument",
        "Choose add or remove.",
      );
      const target = await requireDoc("users", targetId);
      assert(
        !target.disabled && !target.deletionPending,
        "failed-precondition",
        "This account is unavailable.",
      );
      const members: string[] = channel.memberIds || [];
      assert(
        command.add || !channel.moderatorIds?.includes(targetId),
        "failed-precondition",
        "A channel moderator must transfer their role before removal.",
      );
      assert(
        !command.add || members.length < 250 || members.includes(targetId),
        "resource-exhausted",
        "Private channel membership limit reached.",
      );
      const updated = command.add
        ? [...new Set([...members, targetId])]
        : members.filter((uid) => uid !== targetId);
      store.set(`channels/${channel.id}`, {
        ...channel,
        memberIds: updated,
        members: updated.length,
      });
      result.id = channel.id;
      break;
    }
    case "subscription.set": {
      const targetId = text(command.targetId, "Subscription target", 230);
      const value = command.value;
      assert(
        ["following", "muted", "hidden"].includes(value),
        "invalid-argument",
        "Choose following, muted or hidden.",
      );
      // Topic names are preference-map keys, never interpolated into document paths.
      const channelId = id(targetId.split(":")[0]);
      if (targetId.includes(":"))
        text(targetId.slice(targetId.indexOf(":") + 1), "Topic", 80);
      const channel = await store.get(`channels/${channelId}`);
      const conference = channel
        ? undefined
        : await store.get(`conferences/${targetId}`);
      assert(
        channel || conference,
        "not-found",
        "Subscription target not found.",
      );
      if (channel) await channelAccess(channel.id);
      assert(
        Object.keys(prefs.subscriptions).length < 1000 ||
          targetId in prefs.subscriptions,
        "resource-exhausted",
        "Subscription limit reached.",
      );
      if (
        !targetId.includes(":") &&
        ((channel && channel.visibility === "public") || conference)
      ) {
        const target = channel || conference!;
        const wasFollowing = prefs.subscriptions[targetId] === "following";
        const nowFollowing = value === "following";
        if (wasFollowing !== nowFollowing)
          store.set(`${channel ? "channels" : "conferences"}/${target.id}`, {
            ...target,
            members: Math.max(
              0,
              Number(target.members || 0) + (nowFollowing ? 1 : -1),
            ),
          });
      }
      prefs.subscriptions = { ...prefs.subscriptions, [targetId]: value };
      savePreferences();
      break;
    }
    case "onboarding.complete": {
      const interests = list(command.interests, "Interests", 30);
      const channelIds = list(command.channelIds, "Channels", 80, 128);
      assert(
        command.replaceChannels === undefined ||
          typeof command.replaceChannels === "boolean",
        "invalid-argument",
        "Choose whether to replace the displayed channel selection.",
      );
      const replacing = command.replaceChannels === true;
      const scopeIds = replacing
        ? list(command.channelScopeIds, "Displayed channel scope", 80, 128)
        : channelIds;
      assert(
        !replacing ||
          channelIds.every((channelId) => scopeIds.includes(channelId)),
        "invalid-argument",
        "Selected channels must be within the displayed channel scope.",
      );
      const subscriptions = { ...prefs.subscriptions };
      for (const channelId of scopeIds) {
        const channel = await channelAccess(channelId);
        const previous = prefs.subscriptions[channelId];
        const effective =
          previous || prefs.subscriptions[channel.conferenceId] || "muted";
        const next = channelIds.includes(channelId)
          ? "following"
          : effective === "following"
            ? "muted"
            : previous;
        if (next !== undefined) subscriptions[channelId] = next;
        const wasExplicitlyFollowing = previous === "following";
        const nowExplicitlyFollowing = next === "following";
        if (
          channel.visibility === "public" &&
          wasExplicitlyFollowing !== nowExplicitlyFollowing
        )
          store.set(`channels/${channel.id}`, {
            ...channel,
            members: Math.max(
              0,
              Number(channel.members || 0) + (nowExplicitlyFollowing ? 1 : -1),
            ),
          });
      }
      assert(
        Object.keys(subscriptions).length <= 1000,
        "resource-exhausted",
        "Subscription limit reached.",
      );
      prefs.interests = interests;
      prefs.onboardingComplete = true;
      prefs.subscriptions = subscriptions;
      profile.interests = interests;
      profileChanged = true;
      savePreferences();
      break;
    }
    case "preferences.update": {
      Object.assign(prefs, validatePreferences(command.preferences));
      savePreferences();
      break;
    }
    case "community.join": {
      const community = await requireDoc("communities", command.communityId);
      assert(
        prefs.joinedCommunityIds.length < 200 ||
          prefs.joinedCommunityIds.includes(community.id),
        "resource-exhausted",
        "Community membership limit reached.",
      );
      const wasJoined = prefs.joinedCommunityIds.includes(community.id);
      assert(
        !(
          wasJoined &&
          community.moderatorIds?.includes(actor.uid) &&
          community.moderatorIds.length === 1
        ),
        "failed-precondition",
        "Assign another moderator before leaving your community.",
      );
      prefs.joinedCommunityIds = toggle(prefs.joinedCommunityIds, community.id);
      savePreferences();
      store.set(`communities/${community.id}`, {
        ...community,
        members: Math.max(
          0,
          Number(community.members || 0) + (wasJoined ? -1 : 1),
        ),
      });
      break;
    }
    case "community.create": {
      assert(
        prefs.joinedCommunityIds.length < 200,
        "resource-exhausted",
        "Community membership limit reached.",
      );
      const created = await store.find(
        "communities",
        "creatorId",
        actor.uid,
        11,
      );
      assert(
        created.length < 10,
        "resource-exhausted",
        "Community creation limit reached.",
      );
      const name = text(command.name, "Community name", 70);
      const description = text(command.description, "Description", 1000);
      const slug = `${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48)}-${requestId.slice(-6)}`;
      store.set(`communities/${entityId}`, {
        id: entityId,
        name,
        slug,
        description,
        members: 1,
        icon: name[0].toUpperCase(),
        rules: [
          "Be respectful. No spam or harassment.",
          "Protect members’ personal information.",
          "Make space for useful, relevant conversations.",
        ],
        moderatorIds: [actor.uid],
        creatorId: actor.uid,
        createdAt: now,
      });
      prefs.joinedCommunityIds = [...prefs.joinedCommunityIds, entityId];
      savePreferences();
      break;
    }
    case "message.send": {
      commandFields(command, [
        "type",
        "channelId",
        "topic",
        "body",
        "replyTo",
        "imageId",
      ]);
      const channel = await channelAccess(command.channelId);
      const body = text(command.body, "Message", 4000);
      const topic = text(command.topic, "Topic", 80);
      assert(
        !channel.topics || channel.topics.includes(topic),
        "failed-precondition",
        "Create this topic before posting in it.",
      );
      const message: Doc = {
        id: entityId,
        channelId: channel.id,
        topic,
        authorId: actor.uid,
        ...authorSnapshot(profile),
        body,
        createdAt: now,
        reactions: {},
      };
      if (command.replyTo) {
        const parent = await requireDoc("messages", command.replyTo);
        assert(
          parent.channelId === channel.id && parent.topic === topic,
          "invalid-argument",
          "Replies must stay in the same group chat and topic.",
        );
        message.replyTo = parent.id;
        await notify(
          parent.authorId,
          `${profile.name} replied`,
          body.slice(0, 180),
          "message",
          channel.id,
          "reply",
        );
      }
      const image = await linkImage(
        store,
        actor.uid,
        user,
        command.imageId,
        { kind: "channel", id: channel.id },
        "messages",
        entityId,
        body,
        now,
      );
      if (image) {
        message.image = image;
        savePreferences();
      }
      store.set(`messages/${entityId}`, message);
      // Sending a message deliberately does not subscribe a muted/hidden channel or topic.
      break;
    }
    case "message.pin": {
      commandFields(command, ["type", "channelId", "messageId", "pinned"]);
      assert(typeof command.pinned === "boolean", "invalid-argument", "Choose whether to pin or unpin this message.");
      const channel = await channelAccess(command.channelId);
      assert(await canManageChannel(channel), "permission-denied", "Only a group chat moderator can manage pinned messages.");
      const messageId = id(command.messageId);
      await updatePins(store, channel, messageId, command.pinned);
      store.set(`moderationAudit/${requestId}`, { id: requestId, actorId: actor.uid, action: command.pinned ? "message.pin" : "message.unpin", targetType: "message", targetId: messageId, channelId: channel.id, createdAt: now });
      break;
    }
    case "message.edit":
    case "message.delete":
    case "message.react": {
      const message = await requireDoc("messages", command.messageId);
      await channelAccess(message.channelId);
      if (commandType === "message.edit") {
        assert(
          message.authorId === actor.uid,
          "permission-denied",
          "Only the author can edit this message.",
        );
        store.set(`messages/${message.id}`, {
          ...message,
          body: text(command.body, "Message", 4000),
          editedAt: now,
        });
      } else if (commandType === "message.delete") {
        assert(
          message.authorId === actor.uid ||
            user.role === "moderator" ||
            user.role === "admin",
          "permission-denied",
          "Only the author or a moderator can remove this message.",
        );
        await removeMessagePin(store, message);
        store.remove(`messages/${message.id}`);
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
        const reactions: Doc = { ...message.reactions };
        const people = reactions[emoji] || [];
        assert(
          people.length < 500 || people.includes(actor.uid),
          "resource-exhausted",
          "Reaction limit reached.",
        );
        reactions[emoji] = toggle(people, actor.uid);
        store.set(`messages/${message.id}`, { ...message, reactions });
      }
      break;
    }
    case "channel.read": {
      commandFields(command, ["type", "channelId", "topic", "visibleTopics"]);
      const channel = await channelAccess(command.channelId);
      const topic = command.topic === undefined ? undefined : text(command.topic, "Topic", 80);
      const available: string[] = channel.topics || [];
      assert(command.visibleTopics === undefined || typeof command.visibleTopics === "boolean", "invalid-argument", "Choose a valid read scope.");
      assert(topic === undefined || !command.visibleTopics, "invalid-argument", "Choose one read scope.");
      assert(topic === undefined || available.includes(topic), "invalid-argument", "Choose a topic in this group chat.");
      const topics = topic !== undefined ? [topic] : available.filter(name => !["muted", "hidden"].includes(prefs.subscriptions[`${channel.id}:${name}`]));
      // Older installed clients still use the channel-wide marker.
      const keys = topic === undefined && !command.visibleTopics ? [channel.id] : topics.map(name => `${channel.id}:${name}`);
      prefs.readChannels = { ...prefs.readChannels };
      for (const key of keys) if (now > (prefs.readChannels[key] || "")) prefs.readChannels[key] = now;
      savePreferences();
      break;
    }
    case "post.create": {
      commandFields(command, [
        "type",
        "communityId",
        "title",
        "body",
        "kind",
        "tags",
        "options",
        "url",
        "imageId",
      ]);
      const community = await communityAccess(command.communityId);
      const kind = command.kind;
      assert(
        ["discussion", "win", "opportunity", "poll", "link"].includes(kind),
        "invalid-argument",
        "Invalid post type.",
      );
      const post: Doc = {
        id: entityId,
        communityId: community.id,
        authorId: actor.uid,
        ...authorSnapshot(profile),
        title: text(command.title, "Title", 180),
        body: text(command.body, "Post", 10000, kind === "poll" ? 0 : 1),
        kind,
        createdAt: now,
        votes: {},
        comments: [],
        tags: command.tags ? list(command.tags, "Tags", 6, 30) : [],
      };
      if (kind === "poll") {
        const options = list(command.options, "Poll options", 6, 120);
        assert(
          options.length >= 2,
          "invalid-argument",
          "A poll needs at least two distinct options.",
        );
        post.poll = {
          options: options.map((label, index) => ({
            id: `option-${index}`,
            label,
            voterIds: [],
          })),
          closesAt: new Date(Date.parse(now) + 7 * 86_400_000).toISOString(),
        };
      }
      if (command.url) post.url = httpsUrl(command.url);
      if (kind === "link")
        assert(post.url, "invalid-argument", "Add a link for this post.");
      const image = await linkImage(
        store,
        actor.uid,
        user,
        command.imageId,
        { kind: "community", id: post.communityId },
        "posts",
        entityId,
        post.body,
        now,
      );
      if (image) {
        post.image = image;
        savePreferences();
      }
      store.set(`posts/${entityId}`, withContributors(post));
      break;
    }
    case "post.edit": {
      commandFields(command, ["type", "postId", "post"]);
      const post = await requireDoc("posts", command.postId);
      assert(
        post.authorId === actor.uid,
        "permission-denied",
        "Only the author can edit this post.",
      );
      const { patch, removeUrl } = editablePost(command.post, post.kind);
      const updated: Doc = { ...post, ...patch, editedAt: now };
      if (updated.image) text(updated.body, "Image caption", 10000);
      if (removeUrl) delete updated.url;
      assert(
        updated.kind !== "link" || updated.url,
        "invalid-argument",
        "Link posts must retain a valid HTTPS URL.",
      );
      store.set(`posts/${post.id}`, withContributors(updated));
      break;
    }
    case "post.delete": {
      commandFields(command, ["type", "postId"]);
      const post = await requireDoc("posts", command.postId);
      assert(
        post.authorId === actor.uid ||
          user.role === "admin" ||
          user.role === "moderator",
        "permission-denied",
        "Only the author or a global moderator can remove this post.",
      );
      auditRemoval("post", post.id, post.authorId, post.id);
      store.remove(`posts/${post.id}`);
      break;
    }
    case "comment.edit":
    case "comment.delete": {
      commandFields(
        command,
        commandType === "comment.edit"
          ? ["type", "postId", "commentId", "body"]
          : ["type", "postId", "commentId"],
      );
      const post = await requireDoc("posts", command.postId);
      const commentId = id(command.commentId);
      const comment = (post.comments || []).find(
        (item: Doc) => item.id === commentId,
      );
      assert(comment, "not-found", "This reply is no longer available.");
      assert(
        comment.authorId === actor.uid ||
          (commandType === "comment.delete" &&
            (user.role === "admin" || user.role === "moderator")),
        "permission-denied",
        commandType === "comment.edit"
          ? "Only the author can edit this reply."
          : "Only the reply author or a global moderator can remove it.",
      );
      const comments =
        commandType === "comment.edit"
          ? post.comments.map((item: Doc) =>
              item.id === commentId
                ? {
                    ...item,
                    body: text(command.body, "Reply", 3000),
                    editedAt: now,
                  }
                : item,
            )
          : post.comments.filter((item: Doc) => item.id !== commentId);
      if (commandType === "comment.delete")
        auditRemoval("comment", commentId, comment.authorId, post.id);
      store.set(`posts/${post.id}`, withContributors({ ...post, comments }));
      break;
    }
    case "post.save": {
      const postId = id(command.postId);
      if (prefs.savedPostIds.includes(postId))
        prefs.savedPostIds = prefs.savedPostIds.filter(
          (savedId: string) => savedId !== postId,
        );
      else {
        await requireDoc("posts", postId);
        assert(
          prefs.savedPostIds.length < 1000,
          "resource-exhausted",
          "Saved post limit reached.",
        );
        prefs.savedPostIds = [...prefs.savedPostIds, postId];
      }
      savePreferences();
      break;
    }
    case "post.vote":
    case "post.comment":
    case "poll.vote": {
      const post = await requireDoc("posts", command.postId);
      await communityAccess(post.communityId);
      if (commandType === "post.vote") {
        assert(
          command.value === 1 || command.value === -1,
          "invalid-argument",
          "Invalid vote.",
        );
        const votes = { ...post.votes };
        if (votes[actor.uid] === command.value) delete votes[actor.uid];
        else votes[actor.uid] = command.value;
        assert(
          Object.keys(votes).length <= 3000,
          "resource-exhausted",
          "Vote limit reached.",
        );
        store.set(`posts/${post.id}`, withContributors({ ...post, votes }));
      } else if (commandType === "post.comment") {
        commandFields(command, ["type", "postId", "body"]);
        assert(
          post.comments?.length < 200,
          "resource-exhausted",
          "This discussion has reached its reply limit. Start a related discussion.",
        );
        const body = text(command.body, "Comment", 3000);
        store.set(
          `posts/${post.id}`,
          withContributors({
            ...post,
            comments: [
              ...post.comments,
              {
                id: entityId,
                authorId: actor.uid,
                ...authorSnapshot(profile),
                body,
                createdAt: now,
              },
            ],
          }),
        );
        await notify(
          post.authorId,
          `${profile.name} joined your discussion`,
          body.slice(0, 180),
          "community",
          post.id,
          "comment",
        );
      } else {
        assert(
          post.poll && Date.parse(post.poll.closesAt) > Date.parse(now),
          "failed-precondition",
          "This poll is closed.",
        );
        assert(
          post.poll.options.some((o: Doc) => o.id === command.optionId),
          "invalid-argument",
          "Poll option not found.",
        );
        const options = post.poll.options.map((option: Doc) => ({
          ...option,
          voterIds: [
            ...option.voterIds.filter((uid: string) => uid !== actor.uid),
            ...(option.id === command.optionId ? [actor.uid] : []),
          ],
        }));
        assert(
          options.every((o: Doc) => o.voterIds.length < 3000),
          "resource-exhausted",
          "Poll response limit reached.",
        );
        store.set(
          `posts/${post.id}`,
          withContributors({
            ...post,
            poll: { ...post.poll, options },
          }),
        );
      }
      break;
    }
    case "event.create": {
      commandFields(command, ["type", "event"]);
      const event = command.event;
      assert(
        event && typeof event === "object",
        "invalid-argument",
        "Provide event details.",
      );
      commandFields(event, [
        "conferenceId",
        "title",
        "description",
        "startAt",
        "endAt",
        "timezone",
        "location",
        "kind",
        "capacity",
        "tags",
        "url",
      ]);
      const conference = await requireDoc("conferences", event.conferenceId);
      const startAt = absoluteEventInstant(event.startAt, "Start time");
      const endAt = absoluteEventInstant(event.endAt, "End time");
      assert(
        Number.isFinite(Date.parse(startAt)) &&
          Number.isFinite(Date.parse(endAt)) &&
          Date.parse(endAt) > Date.parse(startAt),
        "invalid-argument",
        "Choose a valid event time range.",
      );
      assert(
        Date.parse(endAt) > Date.parse(now),
        "invalid-argument",
        "Events must finish in the future.",
      );
      assert(
        Number.isInteger(event.capacity) &&
          event.capacity >= 0 &&
          event.capacity <= 1000,
        "invalid-argument",
        "Capacity must be 0 (open) through 1,000.",
      );
      assert(
        ["conference", "meetup", "workshop", "social"].includes(event.kind),
        "invalid-argument",
        "Invalid event type.",
      );
      const timezone = text(event.timezone, "Timezone", 80);
      try {
        new Intl.DateTimeFormat("en", { timeZone: timezone });
      } catch {
        throw new DomainError("invalid-argument", "Use a valid timezone.");
      }
      const safe: Doc = {
        id: entityId,
        conferenceId: conference.id,
        title: text(event.title, "Title", 160),
        description: text(event.description, "Description", 5000, 0),
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        timezone,
        location: text(event.location, "Location", 240),
        kind: event.kind,
        hostId: actor.uid,
        capacity: event.capacity,
        attendeeIds: [actor.uid],
        waitlistIds: [],
        tags: event.tags ? list(event.tags, "Tags", 6, 30) : [],
        createdAt: now,
        updatedAt: now,
        status: "scheduled",
        sequence: 0,
      };
      if (event.url) safe.url = httpsUrl(event.url);
      store.set(`events/${entityId}`, safe);
      break;
    }
    case "event.edit":
    case "event.cancel": {
      commandFields(
        command,
        commandType === "event.edit"
          ? ["type", "eventId", "expectedSequence", "event"]
          : ["type", "eventId", "expectedSequence", "reason"],
      );
      const event = await requireDoc("events", command.eventId);
      const mutation =
        commandType === "event.edit"
          ? editEvent(
              event,
              actor.uid,
              user,
              command.event,
              command.expectedSequence,
              now,
            )
          : cancelEvent(
              event,
              actor.uid,
              user,
              command.expectedSequence,
              command.reason,
              now,
            );
      if (mutation.changed) {
        store.set(`events/${event.id}`, mutation.event);
        const job = eventChangeJob(
          mutation.event,
          actor.uid,
          mutation.promotedIds,
          mutation.changedFields,
          now,
        );
        store.set(`eventChangeJobs/${job.id}`, job);
      }
      result = {
        ...result,
        id: event.id,
        sequence: mutation.event.sequence || 0,
        status: mutation.event.status || "scheduled",
        unchanged: !mutation.changed,
        promotedCount: mutation.promotedIds.length,
      };
      break;
    }
    case "event.rsvp": {
      commandFields(command, ["type", "eventId"]);
      const event = await requireDoc("events", command.eventId);
      const update = eventRsvpTransition(event, actor.uid, now);
      const { promotedId, ...participants } = update;
      store.set(`events/${event.id}`, { ...event, ...participants });
      if (promotedId)
        await notify(
          promotedId,
          "You’re off the waitlist",
          `A spot opened for ${event.title}. You’re now going.`,
          "event",
          event.id,
          "promoted",
        );
      result = {
        ...result,
        status: participants.attendeeIds.includes(actor.uid)
          ? "going"
          : participants.waitlistIds.includes(actor.uid)
            ? "waitlisted"
            : "none",
      };
      break;
    }
    case "connection.request": {
      const peer = await requirePeer(command.userId);
      const connectionId = pairId(actor.uid, peer.userId);
      const existing = await store.get(`connections/${connectionId}`);
      assert(
        !existing,
        "already-exists",
        "A connection or request already exists.",
      );
      store.set(`connections/${connectionId}`, {
        id: connectionId,
        fromId: actor.uid,
        toId: peer.userId,
        participantIds: [actor.uid, peer.userId],
        status: "pending",
        createdAt: now,
      });
      await notify(
        peer.userId,
        `${profile.name} wants to connect`,
        profile.headline || "Build your community together.",
        "connection",
        connectionId,
        "connect",
      );
      result.id = connectionId;
      break;
    }
    case "connection.respond": {
      const connectionId = text(command.connectionId, "Connection ID", 260);
      assert(
        /^[A-Za-z0-9_~-]+$/.test(connectionId),
        "invalid-argument",
        "Invalid connection ID.",
      );
      const connection = await store.get(`connections/${connectionId}`);
      assert(
        connection &&
          connection.toId === actor.uid &&
          connection.status === "pending",
        "permission-denied",
        "Only the recipient can respond to this request.",
      );
      assert(
        typeof command.accept === "boolean",
        "invalid-argument",
        "Choose accept or decline.",
      );
      const peer = await requirePeer(connection.fromId);
      if (command.accept) {
        const peerSignals =
          (await store.get(`trustSignals/${peer.userId}`)) || {};
        store.set(`connections/${connectionId}`, {
          ...connection,
          status: "accepted",
          acceptedAt: now,
        });
        store.set(`profileAccess/${actor.uid}/members/${peer.userId}`, {
          userId: peer.userId,
          createdAt: now,
        });
        store.set(`profileAccess/${peer.userId}/members/${actor.uid}`, {
          userId: actor.uid,
          createdAt: now,
        });
        serverSignals.acceptedConnections =
          Number(serverSignals.acceptedConnections || 0) + 1;
        signalsChanged = true;
        peerSignals.acceptedConnections =
          Number(peerSignals.acceptedConnections || 0) + 1;
        store.set(`trustSignals/${peer.userId}`, peerSignals);
        store.set(`profiles/${peer.userId}`, {
          ...peer.profile,
          trust: calculateTrust(peer.profile, peerSignals, now),
        });
        await notify(
          peer.userId,
          `${profile.name} accepted your connection`,
          "Say hello and keep the conversation going.",
          "connection",
          connectionId,
          "accepted",
        );
      } else store.remove(`connections/${connectionId}`);
      break;
    }
    case "profile.follow": {
      const peer = await requirePeer(command.userId);
      const followId = `${actor.uid}~${peer.userId}`;
      const edge = await store.get(`follows/${followId}`);
      const wasFollowing = !!edge || prefs.followingIds.includes(peer.userId);
      assert(
        prefs.followingIds.length < 1000 ||
          prefs.followingIds.includes(peer.userId),
        "resource-exhausted",
        "Following limit reached.",
      );
      prefs.followingIds = wasFollowing
        ? prefs.followingIds.filter((uid: string) => uid !== peer.userId)
        : [...prefs.followingIds, peer.userId];
      profile.followingCount = prefs.followingIds.length;
      profileChanged = true;
      if (wasFollowing) {
        store.remove(`follows/${followId}`);
        if (edge)
          store.set(`profiles/${peer.userId}`, {
            ...peer.profile,
            followerCount: Math.max(
              0,
              Number(peer.profile.followerCount || 0) - 1,
            ),
          });
      } else {
        store.set(`follows/${followId}`, {
          id: followId,
          followerId: actor.uid,
          followingId: peer.userId,
          participantIds: [actor.uid, peer.userId],
          createdAt: now,
        });
        store.set(`profiles/${peer.userId}`, {
          ...peer.profile,
          followerCount: Number(peer.profile.followerCount || 0) + 1,
        });
        await notify(
          peer.userId,
          `${profile.name} is following you`,
          "Your community keeps growing.",
          "community",
          actor.uid,
          "follow",
        );
      }
      savePreferences();
      break;
    }
    case "profile.block": {
      const peerId = id(command.userId);
      assert(
        peerId !== actor.uid,
        "invalid-argument",
        "You cannot block yourself.",
      );
      const connection = await store.get(
        `connections/${pairId(actor.uid, peerId)}`,
      );
      const blocking = !prefs.blockedIds.includes(peerId);
      assert(
        prefs.blockedIds.length < 500 || !blocking,
        "resource-exhausted",
        "Block list limit reached.",
      );
      prefs.blockedIds = toggle(prefs.blockedIds, peerId);
      prefs.followingIds = prefs.followingIds.filter(
        (uid: string) => uid !== peerId,
      );
      savePreferences();
      if (blocking) {
        const [outgoing, incoming, peerProfile, peerUser] = await Promise.all([
          store.get(`follows/${actor.uid}~${peerId}`),
          store.get(`follows/${peerId}~${actor.uid}`),
          store.get(`profiles/${peerId}`),
          store.get(`users/${peerId}`),
        ]);
        if (outgoing) {
          store.remove(`follows/${actor.uid}~${peerId}`);
          if (peerProfile)
            peerProfile.followerCount = Math.max(
              0,
              Number(peerProfile.followerCount || 0) - 1,
            );
        }
        if (incoming) {
          store.remove(`follows/${peerId}~${actor.uid}`);
          profile.followerCount = Math.max(
            0,
            Number(profile.followerCount || 0) - 1,
          );
          if (peerProfile)
            peerProfile.followingCount = Math.max(
              0,
              Number(peerProfile.followingCount || 0) - 1,
            );
        }
        profile.followingCount = prefs.followingIds.length;
        profileChanged = true;
        if (peerProfile && (incoming || outgoing))
          store.set(`profiles/${peerId}`, peerProfile);
        if (
          peerUser &&
          (incoming || peerUser.preferences?.followingIds?.includes(actor.uid))
        )
          store.set(`users/${peerId}`, {
            ...peerUser,
            preferences: {
              ...peerUser.preferences,
              followingIds: (peerUser.preferences?.followingIds || []).filter(
                (uid: string) => uid !== actor.uid,
              ),
            },
            updatedAt: now,
          });
      }
      if (blocking && connection) {
        store.remove(`connections/${connection.id}`);
        store.remove(`profileAccess/${actor.uid}/members/${peerId}`);
        store.remove(`profileAccess/${peerId}/members/${actor.uid}`);
        if (connection.status === "accepted") {
          serverSignals.acceptedConnections = Math.max(
            0,
            Number(serverSignals.acceptedConnections || 0) - 1,
          );
          signalsChanged = true;
          const peerSignals = await store.get(`trustSignals/${peerId}`);
          const peerProfile = await store.get(`profiles/${peerId}`);
          if (peerSignals && peerProfile) {
            peerSignals.acceptedConnections = Math.max(
              0,
              Number(peerSignals.acceptedConnections || 0) - 1,
            );
            store.set(`trustSignals/${peerId}`, peerSignals);
            store.set(`profiles/${peerId}`, {
              ...peerProfile,
              trust: calculateTrust(peerProfile, peerSignals, now),
            });
          }
        }
      }
      if (blocking)
        await revokeBlockedSquadInvites(
          store,
          actor.uid,
          user,
          peerId,
          await store.get(`users/${peerId}`),
          now,
        );
      break;
    }
    case "profile.update": {
      Object.assign(profile, validateProfile(command.profile));
      profileChanged = true;
      break;
    }
    case "dm.send": {
      commandFields(command, ["type", "userId", "body", "imageId"]);
      const peer = await requirePeer(command.userId);
      const connection = await store.get(
        `connections/${pairId(actor.uid, peer.userId)}`,
      );
      assert(
        await canSendDirectMessage(
          store,
          actor.uid,
          peer.userId,
          user,
          peer.user,
          connection,
        ),
        "permission-denied",
        "This member only accepts messages according to their privacy settings.",
      );
      const body = text(command.body, "Message", 4000);
      const image = await linkImage(
        store,
        actor.uid,
        user,
        command.imageId,
        { kind: "directMessage", id: peer.userId },
        "directMessages",
        entityId,
        body,
        now,
      );
      if (image) savePreferences();
      const from = participationIdentity(profile),
        to = participationIdentity(peer.profile);
      await catalogDirectMessage(store, {
        id: entityId,
        fromId: actor.uid,
        toId: peer.userId,
        fromName: from.name,
        fromInitials: from.initials,
        toName: to.name,
        toInitials: to.initials,
        participantIds: [actor.uid, peer.userId],
        conversationId: pairId(actor.uid, peer.userId),
        unreadRecipientId: peer.userId,
        body,
        createdAt: now,
        read: false,
        ...(image ? { image } : {}),
      });
      await notify(
        peer.userId,
        `${profile.name} sent you a message`,
        body.slice(0, 180),
        "message",
        actor.uid,
        "dm",
      );
      break;
    }
    case "dm.edit":
    case "dm.delete": {
      commandFields(
        command,
        commandType === "dm.edit"
          ? ["type", "messageId", "body"]
          : ["type", "messageId"],
      );
      const message = await requireDoc("directMessages", command.messageId);
      assert(
        message.fromId === actor.uid,
        "permission-denied",
        "Only the sender can change or remove this private message.",
      );
      if (commandType === "dm.edit") {
        const peer = await requirePeer(message.toId),
          connection = await store.get(
            `connections/${pairId(actor.uid, message.toId)}`,
          );
        assert(
          await canSendDirectMessage(
            store,
            actor.uid,
            peer.userId,
            user,
            peer.user,
            connection,
          ),
          "permission-denied",
          "This person's current privacy settings do not allow editing this message.",
        );
        const edited = {
          ...message,
          body: text(command.body, "Message", 4000),
          editedAt: now,
        };
        store.set(`directMessages/${message.id}`, edited);
        await updateDirectPreview(store, edited);
      } else {
        await updateDirectPreview(store, message, true);
        store.remove(`directMessages/${message.id}`);
        store.set(`moderationAudit/${requestId}`, {
          id: requestId,
          actorId: actor.uid,
          action: "directMessage.delete",
          targetType: "directMessage",
          targetId: message.id,
          subjectAuthorId: actor.uid,
          authorization: "author",
          createdAt: now,
        });
      }
      break;
    }
    case "dm.mute": {
      commandFields(command, ["type", "userId", "muted"]);
      const peerId = id(command.userId);
      assert(
        peerId !== actor.uid && typeof command.muted === "boolean",
        "invalid-argument",
        "Choose whether to mute another person's messages.",
      );
      const mutedIds: string[] = prefs.dmMutedIds || [];
      if (command.muted && !mutedIds.includes(peerId)) {
        const peer = await store.get(`users/${peerId}`);
        assert(
          peer && !peer.disabled && !peer.deletionPending,
          "not-found",
          "This member is unavailable.",
        );
        assert(
          mutedIds.length < 500,
          "resource-exhausted",
          "Muted conversation limit reached.",
        );
      }
      prefs.dmMutedIds = mutedIds.filter((uid) => uid !== peerId);
      if (command.muted) prefs.dmMutedIds.push(peerId);
      savePreferences();
      break;
    }
    case "dm.read": {
      commandFields(command, ["type", "userId"]);
      const peer = await requirePeer(command.userId);
      result = {
        ...result,
        ...(await readDirectConversation(store, actor.uid, peer.userId, now)),
      };
      break;
    }
    case "notification.read": {
      if (command.notificationId) {
        const notification = await requireDoc(
          "notifications",
          command.notificationId,
        );
        assert(
          notification.userId === actor.uid,
          "permission-denied",
          "This notification is private.",
        );
        store.set(`notifications/${notification.id}`, {
          ...notification,
          read: true,
          unreadUserId: "",
        });
      } else {
        const notifications = await store.find(
          "notifications",
          "unreadUserId",
          actor.uid,
          100,
        );
        for (const notification of notifications)
          store.set(`notifications/${notification.id}`, {
            ...notification,
            read: true,
            unreadUserId: "",
          });
        result = { ...result, hasMore: notifications.length === 100 };
      }
      break;
    }
    case "report.create": {
      const targetType = command.targetType;
      assert(
        [
          "message",
          "post",
          "profile",
          "comment",
          "directMessage",
          "squadMessage",
        ].includes(targetType),
        "invalid-argument",
        "Invalid report target.",
      );
      const targetId = id(command.targetId);
      let target: Doc;
      let postId: string | undefined;
      if (targetType === "comment") {
        const post = await requireDoc("posts", command.postId);
        postId = post.id;
        target = (post.comments || []).find(
          (comment: Doc) => comment.id === targetId,
        );
        assert(target, "not-found", "This reply is no longer available.");
      } else
        target = await requireDoc(
          targetType === "message"
            ? "messages"
            : targetType === "post"
              ? "posts"
              : targetType === "directMessage"
                ? "directMessages"
                : targetType === "squadMessage"
                  ? "squadMessages"
                  : "profiles",
          targetId,
        );
      if (targetType === "message") await channelAccess(target.channelId);
      if (targetType === "squadMessage")
        await readableSquadMessage(store, actor.uid, target);
      if (targetType === "directMessage")
        assert(
          target.participantIds?.includes(actor.uid),
          "permission-denied",
          "Only a participant can report this private message.",
        );
      if (
        targetType === "profile" &&
        target.visibility !== "public" &&
        target.id !== actor.uid
      ) {
        const connection = await store.get(
          `connections/${pairId(actor.uid, target.id)}`,
        );
        assert(
          connection?.status === "accepted",
          "permission-denied",
          "This profile is visible to connections only.",
        );
      }
      const snapshotBody =
        targetType === "profile"
          ? [target.headline, target.bio].filter(Boolean).join("\n")
          : target.body;
      const snapshot = {
        body: String(snapshotBody || "").slice(0, 2000),
        authorId: target.authorId || target.fromId || target.id,
        capturedAt: now,
        ...(targetType === "post"
          ? { title: String(target.title || "").slice(0, 180) }
          : {}),
      };
      if (target.image && !["profile", "comment"].includes(targetType)) {
        const media = await store.get(`privateMedia/${id(target.image.id)}`);
        const collection =
          targetType === "message"
            ? "messages"
            : targetType === "directMessage"
              ? "directMessages"
              : targetType === "squadMessage"
                ? "squadMessages"
                : "posts";
        if (
          media?.state === "ready" &&
          media.linkedCollection === collection &&
          media.linkedId === targetId
        )
          Object.assign(snapshot, { image: media.image });
      }
      store.set(`reports/${entityId}`, {
        id: entityId,
        reporterId: actor.uid,
        targetId,
        targetType,
        ...(postId ? { postId } : {}),
        targetAuthorId: snapshot.authorId,
        snapshot,
        reason: text(command.reason, "Reason", 2000),
        createdAt: now,
        status: "open",
      });
      break;
    }
    case "report.review": {
      assert(
        user.role === "admin" || user.role === "moderator",
        "permission-denied",
        "Moderation access required.",
      );
      const report = await requireDoc("reports", command.reportId);
      assert(
        ["dismiss", "remove"].includes(command.outcome),
        "invalid-argument",
        "Choose dismiss or remove.",
      );
      assert(
        report.targetType !== "profile" || command.outcome !== "remove",
        "failed-precondition",
        "Profile reports require an account review; this action only removes messages, posts or replies.",
      );
      if (command.outcome === "remove" && report.targetType === "comment") {
        const postId = id(report.postId);
        const post = await store.get(`posts/${postId}`);
        const comment = (post?.comments || []).find(
          (item: Doc) => item.id === report.targetId,
        );
        auditRemoval(
          "comment",
          report.targetId,
          comment?.authorId || report.targetAuthorId || "unavailable",
          postId,
        );
        if (post && comment)
          store.set(
            `posts/${post.id}`,
            withContributors({
              ...post,
              comments: post.comments.filter(
                (item: Doc) => item.id !== report.targetId,
              ),
            }),
          );
      } else if (
        command.outcome === "remove" &&
        report.targetType !== "profile"
      ) {
        if (report.targetType === "directMessage") {
          const message = await store.get(
            `directMessages/${id(report.targetId)}`,
          );
          if (message) await updateDirectPreview(store, message, true);
          auditRemoval(
            "directMessage",
            report.targetId,
            message?.fromId || report.targetAuthorId || "unavailable",
            report.targetId,
          );
        }
        if (report.targetType === "message") {
          const message = await store.get(`messages/${id(report.targetId)}`);
          if (message) await removeMessagePin(store, message);
        }
        if (report.targetType === "post") {
          const post = await store.get(`posts/${id(report.targetId)}`);
          auditRemoval(
            "post",
            report.targetId,
            post?.authorId || report.targetAuthorId || "unavailable",
            report.targetId,
          );
        }
        store.remove(
          `${report.targetType === "message" ? "messages" : report.targetType === "directMessage" ? "directMessages" : report.targetType === "squadMessage" ? "squadMessages" : "posts"}/${report.targetId}`,
        );
      }
      store.set(`reports/${report.id}`, {
        ...report,
        status: "reviewed",
        reviewerId: actor.uid,
        reviewedAt: now,
        outcome: command.outcome,
        note: text(command.note || "", "Moderator note", 1000, 0),
      });
      break;
    }
    case "event.checkin": {
      commandFields(command, ["type", "eventId", "userId"]);
      const event = await requireDoc("events", command.eventId);
      const targetId = id(command.userId);
      const conference = await requireDoc("conferences", event.conferenceId);
      assert(
        user.role === "admin" ||
          user.role === "moderator" ||
          (event.hostId === actor.uid &&
            conference.organizerIds?.includes(actor.uid)),
        "permission-denied",
        "Only an approved conference organizer hosting this event or a global moderator can confirm trust-bearing attendance.",
      );
      assert(
        event.attendeeIds?.includes(targetId),
        "failed-precondition",
        "The member must RSVP before checking in.",
      );
      assert(
        targetId !== actor.uid,
        "permission-denied",
        "An organizer cannot confirm their own attendance.",
      );
      const checkinPath = `events/${event.id}/checkins/${targetId}`;
      const checkin = await store.get(checkinPath);
      assert(!checkin, "already-exists", "Attendance is already confirmed.");
      const [targetSignals, targetProfile, targetUser] = await Promise.all([
        store.get(`trustSignals/${targetId}`),
        store.get(`profiles/${targetId}`),
        store.get(`users/${targetId}`),
      ]);
      assertEventCheckinWindow(event, targetUser, now);
      assert(targetProfile, "not-found", "Profile not found.");
      const updated = {
        ...(targetSignals || {}),
        verifiedAttendance: Number(targetSignals?.verifiedAttendance || 0) + 1,
      };
      store.set(checkinPath, {
        userId: targetId,
        confirmedBy: actor.uid,
        createdAt: now,
      });
      store.set(`trustSignals/${targetId}`, updated);
      store.set(`profiles/${targetId}`, {
        ...targetProfile,
        trust: calculateTrust(targetProfile, updated, now),
      });
      break;
    }
    default:
      if (commandType.startsWith("squad.")) {
        result = await executeSquad(
          store,
          actor,
          user,
          profile,
          prefs,
          command,
          requestId,
          now,
        );
        savePreferences();
      } else throw new DomainError("invalid-argument", "Unknown command.");
  }
  if (prefsChanged)
    store.set(`users/${actor.uid}`, {
      ...user,
      preferences: prefs,
      updatedAt: now,
    });
  if (
    profileChanged ||
    signalsChanged ||
    signals?.emailVerified !== actor.emailVerified
  ) {
    profile.trust = calculateTrust(profile, serverSignals, now);
    Object.assign(profile, directoryFields(profile));
    store.set(`profiles/${actor.uid}`, profile);
    store.set(`trustSignals/${actor.uid}`, serverSignals);
  }
  if (profileChanged) {
    // Only the consented name/initials card is shared, never professional profile fields.
    for (const squadId of (user.activeSquadIds || []).slice(0, 50)) {
      const squad = await store.get(`squads/${squadId}`);
      if (!squad?.memberIds?.includes(actor.uid)) continue;
      const member = squad.memberProfiles?.[actor.uid];
      if (
        !member ||
        (member.name === profile.name && member.initials === profile.initials)
      )
        continue;
      store.set(`squads/${squad.id}`, {
        ...squad,
        memberProfiles: {
          ...squad.memberProfiles,
          [actor.uid]: {
            ...member,
            name: profile.name,
            initials: profile.initials,
          },
        },
      });
    }
  }
  store.set(`users/${actor.uid}/system/rate`, {
    bucket,
    count: count + 1,
    day,
    dailyCount: dailyCount + 1,
  });
  store.set(receiptPath, {
    type: commandType,
    result,
    createdAt: now,
    expiresAt: new Date(Date.parse(now) + 7 * 86_400_000),
  });
  return result;
}
