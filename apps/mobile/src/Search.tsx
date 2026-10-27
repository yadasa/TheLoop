import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLoop } from "@theloop/client";
import { subscriptionFor } from "@theloop/core";
import {
  Avatar,
  color,
  displayIdentity,
  Chip,
  Empty,
  Field,
  Horizontal,
  Label,
  MotionScene,
  Button,
  s,
  Section,
  Touch,
} from "./ui";
import type { Nav } from "./navigation";
import { searchDestinations, searchText } from "./searchDestinations";
import { conferenceDateRange } from "./conferencePresentation";

export function Search({ nav }: { nav: Nav }) {
  const { state } = useLoop();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("Everything");
  const q = searchText(query);
  const destinations = searchDestinations(state, query);
  const posts = q
    ? state.posts
        .filter(
          (p) =>
            !state.preferences.blockedIds.includes(p.authorId) &&
            state.preferences.subscriptions[p.communityId] !== "hidden" &&
            searchText(`${p.title} ${p.body} ${p.tags.join(" ")}`).includes(q),
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
            searchText(`${m.body} ${m.topic}`).includes(q)
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
            searchText(
              `${p.name} ${p.headline} ${p.company} ${p.skills.join(" ")}`,
            ).includes(q),
        )
        .slice(0, 20)
    : [];
  const events = q
    ? state.events
        .filter(
          (e) =>
            state.preferences.subscriptions[e.conferenceId] !== "hidden" &&
            searchText(`${e.title} ${e.location} ${e.description}`).includes(q),
        )
        .slice(0, 20)
    : [];
  const total =
    (scope === "Everything" || scope === "Chats"
      ? destinations.chats.length + destinations.conferences.length
      : 0) +
    (scope === "Everything" || scope === "Communities"
      ? destinations.communities.length
      : 0) +
    (scope === "Everything" || scope === "Posts" ? posts.length : 0) +
    (scope === "Everything" || scope === "Messages" ? messages.length : 0) +
    (scope === "Everything" || scope === "People" ? people.length : 0) +
    (scope === "Everything" || scope === "Events" ? events.length : 0);
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.content}
    >
      <View>
        <Text style={s.overline}>FIND YOUR PEOPLE</Text>
        <Text style={[s.title, { marginTop: 8 }]}>Search TheLoop</Text>
      </View>
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder="Chats, topics, people, events…"
        autoCapitalize="none"
        returnKeyType="search"
        maxLength={100}
      />
      <Horizontal>
        {[
          "Everything",
          "Chats",
          "Communities",
          "People",
          "Events",
          "Posts",
          "Messages",
        ].map((value) => (
          <Chip
            key={value}
            title={value}
            selected={scope === value}
            onPress={() => setScope(value)}
          />
        ))}
      </Horizontal>
      {!q && (
        <>
          <View style={s.card}>
            <Text style={s.h3}>Looking for the group chat?</Text>
            <Text style={s.body}>
              Search a conference or topic, or browse your chats.
            </Text>
            <Button
              title="Browse group chats"
              onPress={() => nav.navigate("Chat")}
            />
            <Button
              secondary
              title="Browse communities"
              onPress={() => nav.open({ kind: "communities" })}
            />
          </View>
          <Empty
            title="Start with a name or an interest"
            body="Search conferences, topics, communities and content loaded on this device. Hidden conversations stay out. For older messages, open Search inside a group chat, DM or Squad."
          />
        </>
      )}
      {!!q && (
        <View style={s.between}>
          <Text style={s.small}>
            {total} {total === 1 ? "result" : "results"} · loaded content
          </Text>
          <Button small secondary title="Clear" onPress={() => setQuery("")} />
        </View>
      )}
      {!!q && total === 0 && (
        <Empty
          title="No results"
          body="Try a conference name, topic or skill. Hidden conversations are excluded, and older content may not be loaded yet."
        />
      )}
      <MotionScene identity={scope} style={{ gap: 18 }}>
        {(scope === "Everything" || scope === "Chats") && (
          <>
            {destinations.conferences.length > 0 && (
              <Section title="Conferences" />
            )}
            {destinations.conferences.map((conference) => (
              <Touch
                key={conference.id}
                label={`Explore ${conference.name}`}
                onPress={() =>
                  nav.open({ kind: "conference", id: conference.id })
                }
                style={s.card}
              >
                <Label>CONFERENCE</Label>
                <Text style={s.h3}>{conference.name}</Text>
                <Text style={s.small}>
                  {conference.city} · {conferenceDateRange(conference)}
                </Text>
                <Text style={s.small}>Group chats and events →</Text>
              </Touch>
            ))}
            {destinations.chats.length > 0 && (
              <Section title="Group chats & topics" />
            )}
            {destinations.chats.map(({ channel, topics }) => (
              <View key={channel.id} style={s.card}>
                <Touch
                  label={`Open ${channel.name} group chat`}
                  onPress={() => nav.open({ kind: "channel", id: channel.id })}
                  style={{ gap: 6, minHeight: 44 }}
                >
                  <Text style={s.overline}>
                    {state.conferences.find(
                      (conference) => conference.id === channel.conferenceId,
                    )?.name || "GROUP CHAT"}
                  </Text>
                  <Text style={s.h3}>{channel.name} →</Text>
                  <Text style={s.small} numberOfLines={2}>
                    {channel.description}
                  </Text>
                </Touch>
                {topics.length > 0 && (
                  <Horizontal>
                    {topics.map((topic) => (
                      <Chip
                        key={topic}
                        title={topic}
                        onPress={() =>
                          nav.open({ kind: "channel", id: channel.id, topic })
                        }
                      />
                    ))}
                  </Horizontal>
                )}
              </View>
            ))}
          </>
        )}
        {(scope === "Everything" || scope === "Communities") &&
          destinations.communities.length > 0 && (
            <>
              <Section title="Communities" />
              {destinations.communities.map((community) => (
                <Touch
                  key={community.id}
                  label={`Open l/${community.slug}`}
                  onPress={() =>
                    nav.open({ kind: "community", id: community.id })
                  }
                  style={s.card}
                >
                  <Label>l/{community.slug}</Label>
                  <Text style={s.h3}>{community.name}</Text>
                  <Text style={s.small} numberOfLines={2}>
                    {community.description}
                  </Text>
                </Touch>
              ))}
            </>
          )}
        {(scope === "Everything" || scope === "Posts") && posts.length > 0 && (
          <>
            <Section title="Posts" />
            {posts.map((p) => (
              <Touch
                key={p.id}
                label={p.title}
                onPress={() => nav.open({ kind: "post", id: p.id })}
                style={s.card}
              >
                <Label>
                  l/
                  {state.communities.find((c) => c.id === p.communityId)
                    ?.slug || "community"}
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
              <Section title="Messages" />
              {messages.map((m) => (
                <Touch
                  key={m.id}
                  label={`Open message in ${m.topic}`}
                  onPress={() =>
                    nav.open({
                      kind: "channel",
                      id: m.channelId,
                      topic: m.topic,
                    })
                  }
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
                    {
                      displayIdentity(
                        state.profiles.find((p) => p.id === m.authorId),
                        m.authorName,
                        m.authorInitials,
                      ).name
                    }
                  </Text>
                </Touch>
              ))}
            </>
          )}
        {(scope === "Everything" || scope === "People") &&
          people.length > 0 && (
            <>
              <Section title="People" />
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
                  <Text style={{ color: color.ink }}>↗</Text>
                </Touch>
              ))}
            </>
          )}
        {(scope === "Everything" || scope === "Events") &&
          events.length > 0 && (
            <>
              <Section title="Events" />
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
      </MotionScene>
    </ScrollView>
  );
}
