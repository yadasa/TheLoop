import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLoop } from "@theloop/client";
import { subscriptionFor } from "@theloop/core";
import {
  Avatar,
  Chip,
  Empty,
  Field,
  Horizontal,
  Label,
  s,
  Section,
  Touch,
} from "./ui";
import type { Nav } from "./navigation";

export function Search({ nav }: { nav: Nav }) {
  const { state } = useLoop();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("Everything");
  const q = query.trim().toLowerCase();
  const posts = q
    ? state.posts
        .filter(
          (p) =>
            !state.preferences.blockedIds.includes(p.authorId) &&
            state.preferences.subscriptions[p.communityId] !== "hidden" &&
            `${p.title} ${p.body} ${p.tags.join(" ")}`
              .toLowerCase()
              .includes(q),
        )
        .slice(0, 20)
    : [];
  const messages = q
    ? state.messages
        .filter((m) => {
          const channel = state.channels.find((c) => c.id === m.channelId);
          return (
            !!channel &&
            (channel.visibility === "public" ||
              channel.memberIds?.includes(state.currentUserId)) &&
            subscriptionFor(state, channel.id, channel.conferenceId) !==
              "hidden" &&
            state.preferences.subscriptions[`${channel.id}:${m.topic}`] !==
              "hidden" &&
            !state.preferences.blockedIds.includes(m.authorId) &&
            `${m.body} ${m.topic}`.toLowerCase().includes(q)
          );
        })
        .slice(-20)
        .reverse()
    : [];
  const people = q
    ? state.profiles
        .filter(
          (p) =>
            !state.preferences.blockedIds.includes(p.id) &&
            `${p.name} ${p.headline} ${p.skills.join(" ")}`
              .toLowerCase()
              .includes(q),
        )
        .slice(0, 20)
    : [];
  const events = q
    ? state.events
        .filter((e) =>
          `${e.title} ${e.location} ${e.description}`.toLowerCase().includes(q),
        )
        .slice(0, 20)
    : [];
  const total =
    (scope === "Everything" || scope === "Posts" ? posts.length : 0) +
    (scope === "Everything" || scope === "Messages" ? messages.length : 0) +
    (scope === "Everything" || scope === "People" ? people.length : 0) +
    (scope === "Everything" || scope === "Events" ? events.length : 0);
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.content}
    >
      <Text style={s.title}>Find the good stuff.</Text>
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder="People, recent conversations, events…"
      />
      <Horizontal>
        {["Everything", "Posts", "Messages", "People", "Events"].map(
          (value) => (
            <Chip
              key={value}
              title={value}
              selected={scope === value}
              onPress={() => setScope(value)}
            />
          ),
        )}
      </Horizontal>
      {!q && (
        <Empty
          title="A name. An idea. An open door."
          body="Search recent conversations, community posts, people, and events. Hidden spaces stay outside your results."
        />
      )}
      {!!q && total === 0 && (
        <Empty
          title="No matches just yet"
          body="Try a different phrase, a skill, or a city."
        />
      )}
      {(scope === "Everything" || scope === "Posts") && posts.length > 0 && (
        <>
          <Section title="Conversations" />
          {posts.map((p) => (
            <Touch
              key={p.id}
              label={p.title}
              onPress={() => nav.open({ kind: "post", id: p.id })}
              style={s.card}
            >
              <Label>
                l/
                {state.communities.find((c) => c.id === p.communityId)?.slug ||
                  "community"}
              </Label>
              <Text style={s.h3}>{p.title}</Text>
              <Text numberOfLines={2} style={s.small}>
                {p.body}
              </Text>
            </Touch>
          ))}
        </>
      )}
      {(scope === "Everything" || scope === "Messages") &&
        messages.length > 0 && (
          <>
            <Section title="In the rooms" />
            {messages.map((m) => (
              <Touch
                key={m.id}
                label={`Open message in ${m.topic}`}
                onPress={() => nav.open({ kind: "channel", id: m.channelId })}
                style={s.card}
              >
                <Text style={s.overline}>
                  # {state.channels.find((c) => c.id === m.channelId)?.name} /{" "}
                  {m.topic}
                </Text>
                <Text numberOfLines={3} style={s.body}>
                  {m.body}
                </Text>
                <Text style={s.small}>
                  {state.profiles.find((p) => p.id === m.authorId)?.name ||
                    "Loop member"}
                </Text>
              </Touch>
            ))}
          </>
        )}
      {(scope === "Everything" || scope === "People") && people.length > 0 && (
        <>
          <Section title="Your people" />
          {people.map((p) => (
            <Touch
              key={p.id}
              label={`View ${p.name}`}
              onPress={() => nav.open({ kind: "profile", id: p.id })}
              style={[s.row, { paddingVertical: 10 }]}
            >
              <Avatar profile={p} />
              <View style={s.grow}>
                <Text style={s.h3}>{p.name}</Text>
                <Text style={s.small}>{p.headline}</Text>
              </View>
              <Text>↗</Text>
            </Touch>
          ))}
        </>
      )}
      {(scope === "Everything" || scope === "Events") && events.length > 0 && (
        <>
          <Section title="Good reasons to show up" />
          {events.map((e) => (
            <Touch
              key={e.id}
              label={e.title}
              onPress={() => nav.open({ kind: "event", id: e.id })}
              style={s.card}
            >
              <Text style={s.h3}>{e.title}</Text>
              <Text style={s.small}>
                {new Date(e.startAt).toLocaleDateString()} · {e.location}
              </Text>
            </Touch>
          ))}
        </>
      )}
    </ScrollView>
  );
}
