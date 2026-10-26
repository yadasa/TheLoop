import type { Command, CommandContext, LoopState } from "./types";
import { connected, safeURL } from "./selectors";
import {applySquadCommand} from './squads';
import {bindPreviewImage,prunePreviewImages} from './previewImages';
const clean = (v: string, max: number, required = true) => {
  const value = v.trim();
  if ((required && !value) || value.length > max)
    throw new Error(`Please enter ${required ? "1" : "0"}–${max} characters.`);
  return value;
};
export function applyCommand(
  state: LoopState,
  cmd: Command,
  ctx: CommandContext,
): LoopState {
  const s: LoopState = JSON.parse(JSON.stringify(state));
  const uid = s.currentUserId;
  if (!uid) throw new Error("Sign in to join the conversation.");
  const me = s.profiles.find((p) => p.id === uid);
  const person = (id: string) => {
    const p = s.profiles.find((x) => x.id === id);
    if (!p || id === uid) throw new Error("Choose another community member.");
    return p;
  };
  const post = (id: string) => {
    const p = s.posts.find((x) => x.id === id);
    if (!p) throw new Error("This post is no longer available.");
    return p;
  };
  if(cmd.type.startsWith('squad.')){applySquadCommand(s,cmd as Extract<Command,{type:`squad.${string}`}>,ctx);prunePreviewImages(s,ctx.now);return s;}
  switch (cmd.type) {
    case "topic.create": {
      const channel = s.channels.find((c) => c.id === cmd.channelId);
      if (
        !channel ||
        (channel.visibility === "private" && !channel.memberIds?.includes(uid))
      )
        throw new Error("You do not have access to this channel.");
      const following =
        s.preferences.subscriptions[channel.id] ??
        s.preferences.subscriptions[channel.conferenceId];
      if (
        channel.visibility === "public" &&
        following !== "following" &&
        !channel.moderatorIds?.includes(uid)
      )
        throw new Error("Follow this channel before starting a topic.");
      const name = clean(cmd.name, 80);
      if (
        channel.topics.length >= 30 ||
        channel.topics.some((t) => t.toLowerCase() === name.toLowerCase())
      )
        throw new Error(
          "Choose a new topic; this channel supports up to 30 topics.",
        );
      channel.topics.push(name);
      break;
    }
    case "subscription.set":
      s.preferences.subscriptions[clean(cmd.targetId, 200)] = cmd.value;
      break;
    case "community.join":
      if (!s.communities.some((c) => c.id === cmd.communityId))
        throw new Error("Community not found.");
      s.preferences.joinedCommunityIds =
        s.preferences.joinedCommunityIds.includes(cmd.communityId)
          ? s.preferences.joinedCommunityIds.filter(
              (id) => id !== cmd.communityId,
            )
          : [...s.preferences.joinedCommunityIds, cmd.communityId];
      break;
    case "community.create": {
      const name = clean(cmd.name, 60);
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      if (!slug || s.communities.some((c) => c.slug === slug))
        throw new Error("Choose a unique community name.");
      s.communities.push({
        id: ctx.id,
        slug,
        name,
        description: clean(cmd.description, 500),
        members: 1,
        icon: "◎",
        rules: ["Be respectful.", "No spam or unsolicited pitches."],
        moderatorIds: [uid],
      });
      s.preferences.joinedCommunityIds.push(ctx.id);
      break;
    }
    case "message.send": {
      const channel = s.channels.find((c) => c.id === cmd.channelId);
      if (
        !channel ||
        (channel.visibility === "private" && !channel.memberIds?.includes(uid))
      )
        throw new Error("You do not have access to this channel.");
      if (
        cmd.replyTo &&
        !s.messages.some(
          (m) => m.id === cmd.replyTo && m.channelId === cmd.channelId,
        )
      )
        throw new Error("Reply target not found.");
      s.messages.push({
        id: ctx.id,
        channelId: cmd.channelId,
        topic: clean(cmd.topic, 80),
        authorId: uid,
        body: clean(cmd.body, 4000),
        createdAt: ctx.now,
        reactions: {},
        ...(cmd.imageId!==undefined?{image:bindPreviewImage(s,cmd.imageId,{kind:'channel',id:cmd.channelId},{kind:'message',id:ctx.id},ctx.now)}:{}),
        ...(cmd.replyTo ? { replyTo: cmd.replyTo } : {}),
      });
      break;
    }
    case "message.edit": {
      const m = s.messages.find((x) => x.id === cmd.messageId);
      if (!m || m.authorId !== uid)
        throw new Error("Only the author can edit a message.");
      m.body = clean(cmd.body, 4000);
      m.editedAt = ctx.now;
      break;
    }
    case "message.delete": {
      const m = s.messages.find((x) => x.id === cmd.messageId);
      if (!m || m.authorId !== uid)
        throw new Error("Only the author can delete a message.");
      s.messages = s.messages.filter((x) => x.id !== cmd.messageId);
      break;
    }
    case "message.react": {
      const m = s.messages.find((x) => x.id === cmd.messageId);
      if (!m) throw new Error("Message not found.");
      const c = s.channels.find((x) => x.id === m.channelId);
      if (!c || (c.visibility === "private" && !c.memberIds?.includes(uid)))
        throw new Error("You do not have access to this channel.");
      const emoji = clean(cmd.emoji, 16);
      m.reactions[emoji] = (m.reactions[emoji] ?? []).includes(uid)
        ? m.reactions[emoji].filter((x) => x !== uid)
        : [...(m.reactions[emoji] ?? []), uid];
      break;
    }
    case "channel.read":
      s.preferences.readChannels[cmd.channelId] = ctx.now;
      break;
    case "post.create": {
      if (!s.preferences.joinedCommunityIds.includes(cmd.communityId))
        throw new Error("Join this community before posting.");
      if (cmd.url && !safeURL(cmd.url))
        throw new Error("Use a valid http or https link.");
      const options = cmd.options?.map((x) => clean(x, 100));
      if (
        cmd.kind === "poll" &&
        (!options ||
          options.length < 2 ||
          options.length > 6 ||
          new Set(options).size !== options.length)
      )
        throw new Error("Polls need 2–6 different options.");
      s.posts.unshift({
        id: ctx.id,
        communityId: cmd.communityId,
        authorId: uid,
        title: clean(cmd.title, 180),
        body: clean(cmd.body, 10000),
        kind: cmd.kind,
        createdAt: ctx.now,
        votes: {},
        comments: [],
        tags: (cmd.tags ?? []).slice(0, 5),
        ...(cmd.imageId!==undefined?{image:bindPreviewImage(s,cmd.imageId,{kind:'community',id:cmd.communityId},{kind:'post',id:ctx.id},ctx.now)}:{}),
        ...(cmd.url ? { url: cmd.url } : {}),
        ...(cmd.kind === "poll"
          ? {
              poll: {
                closesAt: new Date(
                  Date.parse(ctx.now) + 7 * 86400000,
                ).toISOString(),
                options: options!.map((label, i) => ({
                  id: `${ctx.id}-${i}`,
                  label,
                  voterIds: [],
                })),
              },
            }
          : {}),
      });
      break;
    }
    case 'post.edit': {
      const p=post(cmd.postId);if(p.authorId!==uid)throw new Error('Only the author can edit this post.');
      if(Object.keys(cmd.post).some(key=>!['title','body','tags','url'].includes(key)))throw new Error('Only the post text, tags and link can be edited.');
      if(cmd.post.title!==undefined)p.title=clean(cmd.post.title,180);
      if(cmd.post.body!==undefined)p.body=clean(cmd.post.body,10000);
      if(cmd.post.tags!==undefined){if(cmd.post.tags.length>5)throw new Error('Use up to five tags.');p.tags=cmd.post.tags.map(tag=>clean(tag,40));}
      if(cmd.post.url!==undefined){if(cmd.post.url===''){if(p.kind==='link')throw new Error('A shared link post needs its link.');delete p.url;}else{if(!safeURL(cmd.post.url))throw new Error('Use a valid HTTPS link.');p.url=cmd.post.url;}}
      p.editedAt=ctx.now;break;
    }
    case 'post.delete': {
      const p=post(cmd.postId);if(p.authorId!==uid)throw new Error('Only the author can delete this post.');s.posts=s.posts.filter(p=>p.id!==cmd.postId);s.preferences.savedPostIds=s.preferences.savedPostIds.filter(id=>id!==cmd.postId);break;
    }
    case 'comment.edit': {
      const p=post(cmd.postId);const comment=p.comments.find(c=>c.id===cmd.commentId);if(!comment||comment.authorId!==uid)throw new Error('Only the author can edit this reply.');comment.body=clean(cmd.body,2000);comment.editedAt=ctx.now;break;
    }
    case 'comment.delete': {
      const p=post(cmd.postId);const comment=p.comments.find(c=>c.id===cmd.commentId);if(!comment||comment.authorId!==uid)throw new Error('Only the author can delete this reply.');p.comments=p.comments.filter(c=>c.id!==cmd.commentId);break;
    }
    case "post.vote": {
      const p = post(cmd.postId);
      if(!s.preferences.joinedCommunityIds.includes(p.communityId))throw new Error('Join this community before voting.');
      if (p.votes[uid] === cmd.value) delete p.votes[uid];
      else p.votes[uid] = cmd.value;
      break;
    }
    case "post.save":
      s.preferences.savedPostIds = s.preferences.savedPostIds.includes(
        cmd.postId,
      )
        ? s.preferences.savedPostIds.filter((x) => x !== cmd.postId)
        : [...s.preferences.savedPostIds, post(cmd.postId).id];
      break;
    case "post.comment":
      if(!s.preferences.joinedCommunityIds.includes(post(cmd.postId).communityId))throw new Error('Join this community before replying.');
      post(cmd.postId).comments.push({
        id: ctx.id,
        authorId: uid,
        body: clean(cmd.body, 2000),
        createdAt: ctx.now,
      });
      break;
    case "poll.vote": {
      const p = post(cmd.postId);
      if(!s.preferences.joinedCommunityIds.includes(p.communityId))throw new Error('Join this community before voting.');
      if (!p.poll || p.poll.closesAt <= ctx.now)
        throw new Error("This poll has closed.");
      if (!p.poll.options.some((o) => o.id === cmd.optionId))
        throw new Error("Choose a poll option.");
      p.poll.options.forEach(
        (o) => (o.voterIds = o.voterIds.filter((id) => id !== uid)),
      );
      p.poll.options.find((o) => o.id === cmd.optionId)!.voterIds.push(uid);
      break;
    }
    case "event.rsvp": {
      const e = s.events.find((x) => x.id === cmd.eventId);
      if (!e) throw new Error("Event not found.");
      if (e.endAt < ctx.now) throw new Error("This event has ended.");
      if (e.attendeeIds.includes(uid)) {
        e.attendeeIds = e.attendeeIds.filter((x) => x !== uid);
        if (e.waitlistIds.length) e.attendeeIds.push(e.waitlistIds.shift()!);
      } else if (e.waitlistIds.includes(uid))
        e.waitlistIds = e.waitlistIds.filter((x) => x !== uid);
      else if (e.capacity === 0 || e.attendeeIds.length < e.capacity)
        e.attendeeIds.push(uid);
      else e.waitlistIds.push(uid);
      break;
    }
    case "event.create": {
      const e = cmd.event;
      if (!s.conferences.some((c) => c.id === e.conferenceId))
        throw new Error("Choose a conference.");
      if (
        !Number.isFinite(Date.parse(e.startAt)) ||
        !Number.isFinite(Date.parse(e.endAt)) ||
        Date.parse(e.endAt) <= Date.parse(e.startAt) ||
        Date.parse(e.startAt) < Date.parse(ctx.now)
      )
        throw new Error("Choose a future event with an end after its start.");
      if (!Number.isInteger(e.capacity) || e.capacity < 0 || e.capacity > 10000)
        throw new Error("Capacity must be between 0 and 10,000.");
      if (e.url && !safeURL(e.url)) throw new Error("Use a valid event link.");
      new Intl.DateTimeFormat("en-US", { timeZone: e.timezone });
      s.events.push({
        ...e,
        id: ctx.id,
        title: clean(e.title, 160),
        description: clean(e.description, 3000, false),
        location: clean(e.location, 300),
        startAt: new Date(e.startAt).toISOString(),
        endAt: new Date(e.endAt).toISOString(),
        hostId: uid,
        attendeeIds: [uid],
        waitlistIds: [],
      });
      break;
    }
    case "connection.request":
      person(cmd.userId);
      if (s.preferences.blockedIds.includes(cmd.userId))
        throw new Error("Unblock this member before connecting.");
      if (
        s.connections.some(
          (c) =>
            [c.fromId, c.toId].includes(uid) &&
            [c.fromId, c.toId].includes(cmd.userId),
        )
      )
        throw new Error("A connection or request already exists.");
      s.connections.push({
        id: ctx.id,
        fromId: uid,
        toId: cmd.userId,
        status: "pending",
        createdAt: ctx.now,
      });
      break;
    case "connection.respond": {
      const c = s.connections.find((x) => x.id === cmd.connectionId);
      if (!c || c.toId !== uid || c.status !== "pending")
        throw new Error("This request is not available.");
      if (cmd.accept) c.status = "accepted";
      else s.connections = s.connections.filter((x) => x.id !== c.id);
      break;
    }
    case "profile.follow":
      person(cmd.userId);
      if (s.preferences.blockedIds.includes(cmd.userId))
        throw new Error("Unblock this member before following.");
      s.preferences.followingIds = s.preferences.followingIds.includes(
        cmd.userId,
      )
        ? s.preferences.followingIds.filter((x) => x !== cmd.userId)
        : [...s.preferences.followingIds, cmd.userId];
      if (s.preferences.followingIds.includes(cmd.userId))
        s.follows.push({
          id: ctx.id,
          followerId: uid,
          followingId: cmd.userId,
          participantIds:[uid,cmd.userId],
          createdAt: ctx.now,
        });
      else
        s.follows = s.follows.filter(
          (f) => !(f.followerId === uid && f.followingId === cmd.userId),
        );
      break;
    case "profile.block":
      person(cmd.userId);
      if (s.preferences.blockedIds.includes(cmd.userId))
        s.preferences.blockedIds = s.preferences.blockedIds.filter(
          (x) => x !== cmd.userId,
        );
      else {
        s.preferences.blockedIds.push(cmd.userId);
        s.preferences.followingIds = s.preferences.followingIds.filter(
          (x) => x !== cmd.userId,
        );
        s.follows = s.follows.filter(
          (f) =>
            !(
              (f.followerId === uid && f.followingId === cmd.userId) ||
              (f.followerId === cmd.userId && f.followingId === uid)
            ),
        );
        s.connections = s.connections.filter(
          (c) =>
            !(
              [c.fromId, c.toId].includes(uid) &&
              [c.fromId, c.toId].includes(cmd.userId)
            ),
        );
        for(const invite of s.squadInvites)if(invite.status==='pending'&&[invite.fromId,invite.toId].includes(uid)&&[invite.fromId,invite.toId].includes(cmd.userId)){invite.status='revoked';invite.respondedAt=ctx.now;const squad=s.squads.find(g=>g.id===invite.squadId);if(squad)squad.pendingInviteeIds=squad.pendingInviteeIds.filter(id=>id!==invite.toId);}
      }
      break;
    case "profile.update": {
      if (!me) throw new Error("Profile not available.");
      const p = cmd.profile;
      if (p.name !== undefined) me.name = clean(p.name, 80);
      for (const key of ["headline", "company", "location", "bio"] as const)
        if (p[key] !== undefined)
          me[key] = clean(p[key]!, key === "bio" ? 1500 : 160, false);
      for (const key of ["skills", "interests", "openTo"] as const)
        if (p[key]) me[key] = p[key]!.slice(0, 12).map((v) => clean(v, 50));
      if (p.links) {
        if (p.links.length > 5 || p.links.some((l) => !safeURL(l.url)))
          throw new Error("Add up to five valid http or https links.");
        me.links = p.links.map((l) => ({
          label: clean(l.label, 40),
          url: l.url,
        }));
      }
      if (p.visibility) me.visibility = p.visibility;
      me.initials = me.name
        .split(" ")
        .slice(0, 2)
        .map((x) => x[0])
        .join("");
      break;
    }
    case "dm.send":
      person(cmd.userId);
      if (s.preferences.blockedIds.includes(cmd.userId))
        throw new Error("You have blocked this member.");
      if (!connected(s, cmd.userId))
        throw new Error("Connect before sending a private message.");
      s.directMessages.push({
        id: ctx.id,
        fromId: uid,
        toId: cmd.userId,
        body: clean(cmd.body, 4000),
        createdAt: ctx.now,
        read: false,
        ...(cmd.imageId!==undefined?{image:bindPreviewImage(s,cmd.imageId,{kind:'directMessage',id:cmd.userId},{kind:'directMessage',id:ctx.id},ctx.now)}:{}),
      });
      break;
    case "dm.read":
      s.directMessages.forEach((message) => {
        if (message.fromId === cmd.userId && message.toId === uid)
          message.read = true;
      });
      break;
    case "notification.read":
      s.notifications.forEach((n) => {
        if (
          n.userId === uid &&
          (!cmd.notificationId || n.id === cmd.notificationId)
        )
          n.read = true;
      });
      break;
    case "preferences.update":
      for (const key of [
        "quietHours",
        "quietStart",
        "quietEnd",
        "digest",
        "dmPolicy",
        "hideUnsubscribed",
        "eventReminders",
        "timezone",
      ] as const) {
        const value = cmd.preferences[key];
        if (value !== undefined) {
          if (key === "timezone")
            new Intl.DateTimeFormat("en-US", { timeZone: String(value) });
          (s.preferences as unknown as Record<string, unknown>)[key] = value;
        }
      }
      break;
    case "onboarding.complete":
      s.preferences.interests = cmd.interests.slice(0, 12);
      s.preferences.onboardingComplete = true;
      if(cmd.replaceChannels){if(!cmd.channelScopeIds||cmd.channelIds.some(id=>!cmd.channelScopeIds!.includes(id)))throw new Error('Choose channels from the displayed scope.');for(const id of cmd.channelScopeIds){const channel=s.channels.find(c=>c.id===id);if(!channel||(channel.visibility==='private'&&!channel.memberIds?.includes(uid)))throw new Error('Choose channels you can access.');if(!cmd.channelIds.includes(id)&&(s.preferences.subscriptions[id]??s.preferences.subscriptions[channel.conferenceId]??'muted')==='following')s.preferences.subscriptions[id]='muted';}}
      cmd.channelIds.forEach((id) => {
        if (s.channels.some((c) => c.id === id))
          s.preferences.subscriptions[id] = "following";
      });
      if (me) me.interests = s.preferences.interests;
      break;
    case "report.create": {
      if(cmd.targetType==='comment'&&(!cmd.postId||!s.posts.find(p=>p.id===cmd.postId)?.comments.some(c=>c.id===cmd.targetId)))throw new Error('Choose a reply that is still available.');
      const target=cmd.targetType==='post'?s.posts.find(p=>p.id===cmd.targetId):cmd.targetType==='comment'?s.posts.find(p=>p.id===cmd.postId)?.comments.find(c=>c.id===cmd.targetId):cmd.targetType==='message'?s.messages.find(m=>m.id===cmd.targetId):cmd.targetType==='directMessage'?s.directMessages.find(d=>d.id===cmd.targetId&&[d.fromId,d.toId].includes(uid)):cmd.targetType==='squadMessage'?s.squadMessages.find(m=>m.id===cmd.targetId&&m.audienceIds.includes(uid)&&s.squads.some(g=>g.id===m.squadId&&!g.archived&&g.memberIds.includes(uid))):s.profiles.find(p=>p.id===cmd.targetId);
      if(!target)throw new Error('Choose content that is still available to you.');
      const body='body' in target?target.body:'bio' in target?target.bio:'';
      const authorId='authorId' in target?target.authorId:'fromId' in target?target.fromId:target.id;
      s.reports.push({
        id: ctx.id,
        reporterId: uid,
        targetId: cmd.targetId,
        targetType: cmd.targetType,
        ...(cmd.postId?{postId:cmd.postId}:{}),
        reason: clean(cmd.reason, 1500),
        createdAt: ctx.now,
        status: "open",
          snapshot:{body:body.slice(0,2000),authorId,capturedAt:ctx.now,...('title' in target&&typeof target.title==='string'?{title:target.title}: {}),...('image' in target&&target.image?{image:target.image}:{})},
      });
      break;
    }
    default:
      throw new Error(
        "This moderation action is available in the connected live app.",
      );
  }
  prunePreviewImages(s,ctx.now);
  s.profiles.forEach((p) => {
    p.followerCount = s.follows.filter((f) => f.followingId === p.id).length;
    p.followingCount = s.follows.filter((f) => f.followerId === p.id).length;
  });
  return s;
}
