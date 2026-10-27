import React, { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import {
  canSearchChannel,
  emptyHistorySearch,
  HistorySearch,
  readableError,
  useLoop,
  validMessageSearch,
} from "@theloop/client";
import type { Message } from "@theloop/core";
import { Sheet } from "./Sheet";
import {
  Avatar,
  Button,
  Chip,
  color,
  displayIdentity,
  Field,
  Horizontal,
  LinkifiedText,
  s,
} from "./ui";
import { dayLabel } from "./chatPresentation";

export function ConversationSearch({
  channelId,
  initialTopic,
  visible,
  onClose,
  onReply,
}: {
  channelId: string;
  initialTopic?: string;
  visible: boolean;
  onClose: () => void;
  onReply: (message: Message) => void;
}) {
  const { state, readChannelSearchPage } = useLoop();
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<string | null>(initialTopic || null);
  const [result, setResult] = useState(emptyHistorySearch<Message>);
  const [resultScope, setResultScope] = useState("");
  const readPage = useRef(readChannelSearchPage);
  readPage.current = readChannelSearchPage;
  const search = useMemo(
    () =>
      new HistorySearch({
        readPage: (request) => readPage.current(request),
        publish: setResult,
        errorText: readableError,
      }),
    [],
  );
  const channel = state.channels.find((channel) => channel.id === channelId);
  const accessible = canSearchChannel(state, channelId);
  const scope = JSON.stringify([
    state.currentUserId,
    channelId,
    visible,
    accessible,
    query,
    topic,
    [...state.preferences.blockedIds].sort(),
    Object.entries(state.preferences.subscriptions)
      .filter(([id]) => id.startsWith(`${channelId}:`))
      .sort(),
  ]);
  useEffect(() => {
    search.reset();
    return () => search.reset();
  }, [scope, search]);
  useEffect(() => {
    if (visible) {
      setTopic(initialTopic || null);
      setQuery("");
    }
  }, [visible, channelId]);
  const current = resultScope === scope ? result : emptyHistorySearch();
  const run = () => {
    if (!accessible || !validMessageSearch(query) || current.loading) return;
    setResultScope(scope);
    void search.start({
      channelId,
      query,
      ...(topic !== null ? { topic } : {}),
    });
  };
  return (
    <Sheet
      visible={visible}
      title="Search messages"
      description={channel?.name}
      onClose={onClose}
    >
      {!accessible ? (
        <Text style={s.body}>
          This group chat is no longer available to you.
        </Text>
      ) : (
        <>
          <Field
            label="Words or phrase"
            value={query}
            onChangeText={setQuery}
            placeholder="Try a name, meetup, or recommendation"
            maxLength={100}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmit={run}
          />
          <Horizontal>
            <Chip
              title="All topics"
              selected={topic === null}
              onPress={() => setTopic(null)}
            />
            {channel?.topics.map((name) => (
              <Chip
                key={name}
                title={name}
                selected={topic === name}
                onPress={() => setTopic(name)}
              />
            ))}
          </Horizontal>
          <Button
            title={current.loading ? "Searching…" : "Search history"}
            disabled={!validMessageSearch(query) || current.loading}
            onPress={run}
          />
          <Text style={s.small}>
            Searches message text, newest first. Hidden topics stay out unless
            you select one. Each search checks up to 300 messages; you can keep
            going further back.
          </Text>
          {current.started && (
            <View style={[s.between, { paddingVertical: 8 }]}>
              <Text style={s.h3}>
                {current.matches.length}{" "}
                {current.matches.length === 1 ? "match" : "matches"}
              </Text>
              <Text style={s.small}>
                {current.scanned.toLocaleString()} checked
              </Text>
            </View>
          )}
          {current.error && (
            <Text
              accessibilityRole="alert"
              style={[
                s.body,
                { borderLeftWidth: 2, borderColor: color.ink, paddingLeft: 12 },
              ]}
            >
              {current.error}
            </Text>
          )}
          {current.matches.map((message) => {
            const author = displayIdentity(
              state.profiles.find((profile) => profile.id === message.authorId),
              message.authorName,
              message.authorInitials,
            );
            return (
              <View key={message.id} style={[s.card, { padding: 16, gap: 12 }]}>
                <View style={s.row}>
                  <Avatar profile={author} size={30} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={s.h3}>
                      {message.authorId === state.currentUserId
                        ? "You"
                        : author.name}
                    </Text>
                    <Text style={s.small}>
                      {message.topic} · {dayLabel(message.createdAt)} ·{" "}
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                </View>
                <LinkifiedText text={message.body} />
                {message.image && (
                  <Text style={s.small}>Includes an image</Text>
                )}
                <Button
                  small
                  secondary
                  title="Reply in this topic"
                  onPress={() => {
                    onClose();
                    onReply(message);
                  }}
                />
              </View>
            );
          })}
          {current.started &&
            !current.loading &&
            current.matches.length === 0 &&
            !current.error && (
              <Text style={s.body}>
                {current.hasMore
                  ? "No matches in the messages checked so far. Search older messages or try another phrase."
                  : "No messages match this search."}
              </Text>
            )}
          {current.started && current.hasMore && (
            <Button
              secondary
              title={
                current.loading
                  ? "Searching older messages…"
                  : current.error
                    ? "Retry older messages"
                    : "Search older messages"
              }
              disabled={current.loading}
              onPress={() => void search.more()}
            />
          )}
          {current.started &&
            !current.hasMore &&
            !current.loading &&
            !current.error && (
              <Text
                style={[s.small, { textAlign: "center", paddingVertical: 8 }]}
              >
                You've searched to the beginning of this{" "}
                {topic === null ? "group chat" : "topic"}.
              </Text>
            )}
          {current.loading && (
            <Button
              small
              secondary
              title="Stop searching"
              onPress={() => search.pause()}
            />
          )}
        </>
      )}
    </Sheet>
  );
}
