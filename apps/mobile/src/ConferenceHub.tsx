import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLoop } from "@theloop/client";
import { AmbientGradient, Button, color, Empty, s, Touch } from "./ui";
import type { Nav } from "./navigation";
import {
  conferenceChannels,
  conferenceDateRange,
  conferenceTiming,
} from "./conferencePresentation";
import { useSubscriptionPicker } from "./SubscriptionPicker";
import { ShareSheet } from "./ShareSheet";

export function ConferenceHub({
  id,
  nav,
  initialDiscover = false,
}: {
  id: string;
  nav: Nav;
  initialDiscover?: boolean;
}) {
  const { state, hasMore, loadMore } = useLoop();
  const [discover, setDiscover] = useState(initialDiscover);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { pickSubscription, subscriptionSheet } = useSubscriptionPicker();
  const conference = state.conferences.find((item) => item.id === id);
  if (!conference)
    return (
      <Empty
        title="Conference unavailable"
        body="Return to Group chats to browse the available conferences."
      />
    );
  const subscription = state.preferences.subscriptions[id] || "muted";
  const available = conferenceChannels(state, id);
  const status = (channelId: string) =>
    state.preferences.subscriptions[channelId] || subscription;
  const channels = available.filter(
    (channel) =>
      discover ||
      (status(channel.id) !== "hidden" &&
        (!state.preferences.hideUnsubscribed ||
          status(channel.id) === "following")),
  );
  const events = state.events
    .filter(
      (event) =>
        event.conferenceId === id &&
        event.status !== "cancelled" &&
        new Date(event.endAt).getTime() > Date.now(),
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  return (
    <ScrollView contentContainerStyle={s.content}>
      {subscriptionSheet}
      <ShareSheet
        target={sharing ? { kind: "conference", id } : null}
        title={conference.name}
        description={`${conference.city} · ${conferenceDateRange(conference)}`}
        onClose={() => setSharing(false)}
      />
      <View
        style={[
          s.card,
          {
            backgroundColor: color.hero,
            borderColor: color.heroLine,
            overflow: "hidden",
            padding: 24,
          },
        ]}
      >
        <AmbientGradient variant="hero" animated={false} />
        <Text style={[s.overline, { color: color.heroMuted }]}>
          {conferenceTiming(conference)}
        </Text>
        <Text style={[s.title, { color: color.onHero }]}>
          {conference.name}
        </Text>
        <Text style={[s.body, { color: color.onHero }]}>{conference.city}</Text>
        <Text style={[s.small, { color: color.heroMuted }]}>
          {conferenceDateRange(conference)}
        </Text>
      </View>
      <Text style={s.body}>{conference.description}</Text>
      <Button
        secondary
        title="Share conference"
        onPress={() => setSharing(true)}
      />
      <Button
        secondary
        title={`Conference updates: ${subscription}`}
        onPress={() =>
          pickSubscription(
            "Conference updates",
            subscription,
            (value) =>
              void nav.run({ type: "subscription.set", targetId: id, value }),
          )
        }
      />
      <View style={s.between}>
        <Text style={s.h2}>{discover ? "Discover chats" : "Group chats"}</Text>
        <Button
          small
          secondary
          title={discover ? "Your chats" : "Discover"}
          onPress={() => setDiscover(!discover)}
        />
      </View>
      {channels.map((channel) => (
        <Touch
          key={channel.id}
          label={`Open ${channel.name}`}
          onPress={() => nav.open({ kind: "channel", id: channel.id })}
          style={[s.card, { gap: 12 }]}
        >
          <View style={s.between}>
            <Text style={[s.h3, { flex: 1 }]}>{channel.name}</Text>
            <Text style={s.small}>
              {status(channel.id) === "following"
                ? "Following"
                : status(channel.id) === "hidden"
                  ? "Hidden"
                  : "Muted"}
            </Text>
          </View>
          <Text style={s.small}>{channel.description}</Text>
          <Text style={[s.small, { color: color.ink }]}>
            {channel.topics.length} topics · Open group chat →
          </Text>
        </Touch>
      ))}
      {channels.length === 0 && (
        <Empty
          title={
            available.length ? "Choose a group chat" : "No group chats yet"
          }
          body={
            available.length
              ? "Your notification settings keep these chats out of your usual view. Discover lets you browse them without changing those settings."
              : "Group chats will appear here when an organizer creates them."
          }
          {...(available.length
            ? {
                action: "Discover group chats",
                onPress: () => setDiscover(true),
              }
            : {})}
        />
      )}
      <Text style={s.h2}>Upcoming community events</Text>
      <Text style={s.small}>
        Events shared in TheLoop for this conference. This is not the official
        conference agenda.
      </Text>
      {events.slice(0, 5).map((event) => (
        <Touch
          key={event.id}
          label={`View ${event.title}`}
          onPress={() => nav.open({ kind: "event", id: event.id })}
          style={[s.card, { gap: 8 }]}
        >
          <Text style={s.h3}>{event.title}</Text>
          <Text style={s.small}>
            {new Date(event.startAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            · your local time
          </Text>
          <Text style={s.small}>{event.location}</Text>
        </Touch>
      ))}
      {events.length === 0 && (
        <Text style={s.body}>
          No upcoming events in the loaded listings yet.
        </Text>
      )}
      {hasMore.events && (
        <Button
          secondary
          title={loading ? "Loading events…" : "Check more event listings"}
          disabled={loading}
          onPress={async () => {
            setLoading(true);
            try {
              await loadMore("events");
            } catch {
              nav.toast("Could not load more events. Try again.");
            } finally {
              setLoading(false);
            }
          }}
        />
      )}
      <Button
        title="View conference calendar"
        onPress={() => nav.open({ kind: "conference-calendar", id })}
      />
      <Button
        secondary
        title="Open global calendar"
        onPress={() => nav.navigate("Events")}
      />
      {conference.id === "afrotech" && (
        <Button
          secondary
          title="Explore AfroTech.guide side events"
          onPress={() => nav.open({ kind: "guide" })}
        />
      )}
      <Text style={s.small}>
        Opening a chat does not change your notification preferences.
      </Text>
    </ScrollView>
  );
}
