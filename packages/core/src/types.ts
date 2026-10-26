export type Subscription = 'following' | 'muted' | 'hidden';
export type Profile = { id: string; name: string; handle: string; headline: string; company: string; location: string; bio: string; initials: string; skills: string[]; interests: string[]; links: { label: string; url: string }[]; joinedAt: string; verified: boolean; foundingYear?: number; trust: { score: number; reasons: string[] }; visibility: 'public' | 'connections'; openTo: string[]; followerCount?: number; followingCount?: number; nameKey?: string; searchKeys?: string[] };
export type Conference = { id: string; name: string; shortName: string; city: string; startDate: string; endDate: string; description: string; members: number; tagline: string; organizerIds?: string[] };
export type Channel = { id: string; conferenceId: string; name: string; description: string; icon: string; members: number; topics: string[]; visibility: 'public' | 'private'; memberIds?: string[]; communityId?: string; moderatorIds?: string[]; creatorId?: string };
export type Message = { id: string; channelId: string; topic: string; authorId: string; body: string; createdAt: string; replyTo?: string; reactions: Record<string, string[]>; editedAt?: string; attachment?: { name: string; url: string; type: string; size: number } };
export type Community = { id: string; slug: string; name: string; description: string; members: number; icon: string; rules: string[]; moderatorIds: string[] };
export type Poll = { options: { id: string; label: string; voterIds: string[] }[]; closesAt: string };
export type Post = { id: string; communityId: string; authorId: string; title: string; body: string; kind: 'discussion' | 'win' | 'opportunity' | 'poll' | 'link'; createdAt: string; editedAt?: string; votes: Record<string, number>; comments: Comment[]; tags: string[]; poll?: Poll; url?: string };
export type Comment = { id: string; authorId: string; body: string; createdAt: string; editedAt?: string };
export type LoopEvent = { id: string; conferenceId: string; title: string; description: string; startAt: string; endAt: string; timezone: string; location: string; kind: 'conference' | 'meetup' | 'workshop' | 'social'; hostId: string; capacity: number; attendeeIds: string[]; waitlistIds: string[]; tags: string[]; url?: string };
export type Connection = { id: string; fromId: string; toId: string; status: 'pending' | 'accepted'; createdAt: string };
export type Follow = { id: string; followerId: string; followingId: string; participantIds: string[]; createdAt: string };
export type Notification = { id: string; userId: string; title: string; body: string; kind: 'message' | 'connection' | 'event' | 'community'; targetId: string; createdAt: string; read: boolean };
export type Report = { id: string; reporterId: string; targetId: string; targetType: 'message' | 'post' | 'profile' | 'comment' | 'directMessage'; postId?: string; reason: string; createdAt: string; status: 'open' | 'reviewed'; snapshot?: { body: string; authorId: string; capturedAt: string; title?: string } };
export type Preferences = { subscriptions: Record<string, Subscription>; joinedCommunityIds: string[]; followingIds: string[]; blockedIds: string[]; savedPostIds: string[]; readChannels: Record<string, string>; interests: string[]; onboardingComplete: boolean; quietHours: boolean; quietStart: string; quietEnd: string; timezone: string; digest: 'off' | 'daily' | 'weekly'; dmPolicy: 'connections' | 'everyone' | 'nobody'; hideUnsubscribed: boolean; eventReminders: boolean };
export type DirectMessage = { id: string; fromId: string; toId: string; body: string; createdAt: string; read: boolean };
export type LoopState = { version: number; currentUserId: string; profiles: Profile[]; conferences: Conference[]; channels: Channel[]; messages: Message[]; communities: Community[]; posts: Post[]; events: LoopEvent[]; connections: Connection[]; follows: Follow[]; notifications: Notification[]; directMessages: DirectMessage[]; reports: Report[]; preferences: Preferences };
export type Command =
  | { type: 'conference.create'; conference: Omit<Conference, 'id' | 'members'> }
  | { type: 'channel.create'; channel: Omit<Channel, 'id' | 'members' | 'moderatorIds' | 'creatorId'> }
  | { type: 'topic.create'; channelId: string; name: string }
  | { type: 'channel.member'; channelId: string; userId: string; add: boolean }
  | { type: 'subscription.set'; targetId: string; value: Subscription }
  | { type: 'community.join'; communityId: string }
  | { type: 'community.create'; name: string; description: string }
  | { type: 'message.send'; channelId: string; topic: string; body: string; replyTo?: string }
  | { type: 'message.edit'; messageId: string; body: string }
  | { type: 'message.delete'; messageId: string }
  | { type: 'message.react'; messageId: string; emoji: string }
  | { type: 'channel.read'; channelId: string }
  | { type: 'post.create'; communityId: string; title: string; body: string; kind: Post['kind']; tags?: string[]; options?: string[]; url?: string }
  | { type: 'post.edit'; postId: string; post: Partial<Pick<Post, 'title' | 'body' | 'tags' | 'url'>> }
  | { type: 'post.delete'; postId: string }
  | { type: 'comment.edit'; postId: string; commentId: string; body: string }
  | { type: 'comment.delete'; postId: string; commentId: string }
  | { type: 'post.vote'; postId: string; value: 1 | -1 }
  | { type: 'post.save'; postId: string }
  | { type: 'post.comment'; postId: string; body: string }
  | { type: 'poll.vote'; postId: string; optionId: string }
  | { type: 'event.rsvp'; eventId: string }
  | { type: 'event.checkin'; eventId: string; userId: string }
  | { type: 'event.create'; event: Omit<LoopEvent, 'id' | 'hostId' | 'attendeeIds' | 'waitlistIds'> }
  | { type: 'connection.request'; userId: string }
  | { type: 'connection.respond'; connectionId: string; accept: boolean }
  | { type: 'profile.follow'; userId: string }
  | { type: 'profile.block'; userId: string }
  | { type: 'profile.update'; profile: Partial<Pick<Profile, 'name' | 'headline' | 'company' | 'location' | 'bio' | 'skills' | 'interests' | 'links' | 'visibility' | 'openTo'>> }
  | { type: 'dm.send'; userId: string; body: string }
  | { type: 'dm.read'; userId: string }
  | { type: 'notification.read'; notificationId?: string }
  | { type: 'preferences.update'; preferences: Partial<Preferences> }
  | { type: 'onboarding.complete'; interests: string[]; channelIds: string[]; replaceChannels?: boolean; channelScopeIds?: string[] }
  | { type: 'report.create'; targetId: string; targetType: Report['targetType']; postId?: string; reason: string }
  | { type: 'report.review'; reportId: string; outcome: 'dismiss' | 'remove'; note?: string };
export type CommandContext = { now: string; id: string };
