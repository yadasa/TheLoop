import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, channelUnread, eventICS, initialState, postScore, subscriptionFor, visibleChannels } from '../src/index';
import type { Command } from '../src/types';

const context = { now: '2026-10-26T16:00:00.000Z', id: 'new-record' };

test('an explicit topic mute survives sending a message and remains excluded from unread', () => {
  let state = initialState();
  state = applyCommand(state, { type: 'subscription.set', targetId: 'the-lobby:Introductions', value: 'muted' }, context);
  state = applyCommand(state, { type: 'message.send', channelId: 'the-lobby', topic: 'Introductions', body: 'Hello again.' }, context);
  assert.equal(subscriptionFor(state, 'the-lobby:Introductions', 'the-lobby'), 'muted');
  assert.equal(channelUnread(state, 'the-lobby'), 1, 'only the unmuted Making plans message is unread');
});

test('hidden channels disappear and never contribute unread messages', () => {
  let state = initialState();
  state = applyCommand(state, { type: 'subscription.set', targetId: 'the-lobby', value: 'hidden' }, context);
  assert.ok(!visibleChannels(state).some(channel => channel.id === 'the-lobby'));
  assert.equal(channelUnread(state, 'the-lobby'), 0);
});

test('conference following is inherited by a channel and its topics', () => {
  const state = initialState();
  delete state.preferences.subscriptions['the-lobby'];
  state.preferences.subscriptions.afrotech = 'following';
  assert.ok(visibleChannels(state).some(channel => channel.id === 'the-lobby'));
  assert.equal(channelUnread(state, 'the-lobby'), 4);
});

test('reply targets cannot bypass channel membership or cross channel boundaries', () => {
  const state = initialState();
  const before = JSON.stringify(state);
  assert.throws(() => applyCommand(state, { type: 'message.send', channelId: 'career-moves', topic: 'Open roles', body: 'A reply', replyTo: 'm1' }, context), /reply target/i);
  const lobby = state.channels.find(channel => channel.id === 'the-lobby')!;
  lobby.visibility = 'private'; lobby.memberIds = ['nia'];
  assert.throws(() => applyCommand(state, { type: 'message.send', channelId: 'the-lobby', topic: 'Introductions', body: 'A reply', replyTo: 'm1' }, context), /access/i);
  assert.equal(state.messages.length, JSON.parse(before).messages.length, 'rejected writes leave source state untouched');
});

test('votes are one per member and repeat voting toggles rather than accumulating', () => {
  let state = initialState();
  const before = postScore(state.posts[0].votes);
  state = applyCommand(state, { type: 'post.vote', postId: 'p1', value: 1 }, context);
  assert.equal(postScore(state.posts[0].votes), before + 1);
  state = applyCommand(state, { type: 'post.vote', postId: 'p1', value: 1 }, context);
  assert.equal(postScore(state.posts[0].votes), before);
  state = applyCommand(state, { type: 'post.vote', postId: 'p1', value: -1 }, context);
  state = applyCommand(state, { type: 'post.vote', postId: 'p1', value: 1 }, context);
  assert.equal(postScore(state.posts[0].votes), before + 1);
});

test('poll voters can change their selection without voting twice', () => {
  let state = initialState();
  for (const optionId of ['o1', 'o1', 'o2']) state = applyCommand(state, { type: 'poll.vote', postId: 'p3', optionId }, context);
  const options = state.posts.find(post => post.id === 'p3')!.poll!.options;
  assert.equal(options.flatMap(option => option.voterIds).filter(id => id === state.currentUserId).length, 1);
  assert.ok(options.find(option => option.id === 'o2')!.voterIds.includes(state.currentUserId));
});

test('full events waitlist members once; cancellation promotes first waiting member', () => {
  let state = initialState();
  const event = state.events[0]; event.capacity = 1; event.attendeeIds = ['maya']; event.waitlistIds = ['nia'];
  state = applyCommand(state, { type: 'event.rsvp', eventId: event.id }, context);
  assert.deepEqual(state.events[0].waitlistIds, ['nia', 'me']);
  state.currentUserId = 'maya';
  state = applyCommand(state, { type: 'event.rsvp', eventId: event.id }, context);
  assert.deepEqual(state.events[0].attendeeIds, ['nia']);
  assert.deepEqual(state.events[0].waitlistIds, ['me']);
});

test('a forged profile patch cannot alter identity, verification, tenure, or trust', () => {
  const state = initialState(), me = state.profiles.find(profile => profile.id === 'me')!;
  const forged = { type: 'profile.update', profile: { headline: 'New headline', id: 'admin', verified: true, foundingYear: 2022, joinedAt: '2000-01-01', trust: { score: 100, reasons: ['I said so'] } } } as unknown as Command;
  const changed = applyCommand(state, forged, context).profiles.find(profile => profile.id === 'me')!;
  assert.equal(changed.headline, 'New headline');
  assert.equal(changed.id, 'me'); assert.equal(changed.verified, me.verified);
  assert.equal(changed.joinedAt, me.joinedAt); assert.equal(changed.foundingYear, me.foundingYear);
  assert.deepEqual(changed.trust, me.trust);
});

test('blocking severs connections and follows and prevents private messages', () => {
  let state = initialState();
  state = applyCommand(state, { type: 'profile.block', userId: 'maya' }, context);
  assert.ok(!state.preferences.followingIds.includes('maya'));
  assert.ok(!state.connections.some(connection => [connection.fromId, connection.toId].includes('maya') && [connection.fromId, connection.toId].includes('me')));
  assert.throws(() => applyCommand(state, { type: 'dm.send', userId: 'maya', body: 'Unwanted message' }, context), /blocked/i);
  assert.throws(() => applyCommand(state, { type: 'connection.request', userId: 'maya' }, context), /unblock/i);
});

test('ICS escapes text and folds Unicode lines without splitting characters', () => {
  const event = initialState().events[0];
  event.title = 'Coffee, code; community\\day\r\nNow';
  event.description = '🖤'.repeat(80);
  const ics = eventICS(event), lines = ics.split('\r\n');
  assert.ok(ics.includes('SUMMARY:Coffee\\, code\\; community\\\\day\\nNow'));
  assert.ok(!ics.replace(/\r\n/g, '').includes('\r'), 'bare carriage returns cannot inject properties');
  assert.ok(lines.every(line => new TextEncoder().encode(line).length <= 75));
  const unfolded = ics.replace(/\r\n[ \t]/g, '');
  assert.ok(unfolded.includes(`DESCRIPTION:${event.description}`));
  assert.ok(!unfolded.includes('\uFFFD'));
});
