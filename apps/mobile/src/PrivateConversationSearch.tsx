import React, { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import {
  canSearchPrivate,
  emptyHistorySearch,
  HistorySearch,
  readableError,
  useLoop,
  validMessageSearch,
  type PrivateHistoryRequest,
  type PrivateSearchHit,
} from "@theloop/client";
import { Sheet } from "./Sheet";
import { Avatar, Button, displayIdentity, Field, LinkifiedText, s } from "./ui";
import { dayLabel } from "./chatPresentation";

export function PrivateConversationSearch({
  kind,
  id,
  name,
  visible,
  onClose,
}: {
  kind: "dm" | "squad";
  id: string;
  name: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { state, mode, ready, readPrivateSearchPage } = useLoop();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(emptyHistorySearch<PrivateSearchHit>);
  const [resultScope, setResultScope] = useState("");
  const read = useRef(readPrivateSearchPage);
  read.current = readPrivateSearchPage;
  const search = useMemo(
    () =>
      new HistorySearch<PrivateHistoryRequest, PrivateSearchHit>({
        readPage: (request) => read.current(request),
        publish: setResult,
        errorText: readableError,
      }),
    [],
  );
  const accessible = canSearchPrivate(state, { kind, id });
  const squad =
    kind === "squad"
      ? state.squads.find((value) => value.id === id)
      : undefined;
  const scope = JSON.stringify([
    state.currentUserId,
    mode,
    ready,
    kind,
    id,
    visible,
    accessible,
    squad?.memberIds,
    query,
    state.preferences.blockedIds,
  ]);
  useEffect(() => {
    search.reset();
    return () => search.reset();
  }, [scope, search]);
  useEffect(() => {
    if (visible) setQuery("");
  }, [visible, kind, id]);
  const current =
    resultScope === scope ? result : emptyHistorySearch<PrivateSearchHit>();
  const run = () => {
    if (!accessible || !validMessageSearch(query) || current.loading) return;
    setResultScope(scope);
    void search.start({ kind, id, query });
  };
  return (
    <Sheet
      visible={visible}
      title="Search messages"
      description={name}
      onClose={onClose}
    >
      {!accessible ? (
        <Text style={s.body}>
          This conversation is no longer available to you.
        </Text>
      ) : (
        <>
          <Field
            label="Words or phrase"
            value={query}
            onChangeText={setQuery}
            placeholder="Try a place, plan, or recommendation"
            maxLength={100}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmit={run}
          />
          <Button
            title={current.loading ? "Searching…" : "Search history"}
            disabled={!validMessageSearch(query) || current.loading}
            onPress={run}
          />
          <Text style={s.small}>
            {kind === "squad"
              ? "Only messages shared with you while you belong to this Squad appear here. Blocked members stay hidden."
              : "Searches this private conversation only."}{" "}
            Each search checks up to 300 messages, newest first.
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
          {!!current.error && (
            <Text accessibilityRole="alert" style={s.body}>
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
                  <View style={s.grow}>
                    <Text style={s.h3}>
                      {message.authorId === state.currentUserId
                        ? "You"
                        : author.name}
                    </Text>
                    <Text style={s.small}>
                      {dayLabel(message.createdAt)} ·{" "}
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
              </View>
            );
          })}
          {current.started &&
            !current.loading &&
            !current.error &&
            !current.matches.length && (
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
                You've searched all messages available to you in this
                conversation.
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
