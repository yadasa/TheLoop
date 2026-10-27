import React, { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLoop, type SavedMessageRow } from "@theloop/client";
import { savedMessages } from "@theloop/core";
import {
  Avatar,
  Button,
  displayIdentity,
  Empty,
  LinkifiedText,
  MotionScene,
  RelativeTime,
  s,
} from "./ui";
import type { Nav } from "./navigation";

export function SavedMessages({ nav }: { nav: Nav }) {
  const { state, mode, watchSavedMessages } = useLoop();
  const [page, setPage] = useState(0),
    [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{
    scope: string;
    rows: SavedMessageRow[];
  }>({ scope: "", rows: [] });
  const watch = useRef(watchSavedMessages);
  watch.current = watchSavedMessages;
  const references = savedMessages(state),
    currentPage = Math.min(
      page,
      Math.max(0, Math.ceil(references.length / 20) - 1),
    );
  const selected = references.slice(currentPage * 20, (currentPage + 1) * 20);
  const scope = JSON.stringify([
    state.currentUserId,
    mode,
    selected,
    state.preferences.blockedIds,
    state.preferences.subscriptions,
    revision,
    mode === "demo" ? [state.messages, state.channels] : null,
  ]);
  useEffect(() => {
    let active = true;
    const stop = watch.current(selected, (rows) => {
      if (active) setResult({ scope, rows });
    });
    return () => {
      active = false;
      stop();
    };
  }, [scope]);
  const rows: SavedMessageRow[] =
    result.scope === scope
      ? result.rows
      : selected.map((reference) => ({ reference, status: "loading" }));
  return (
    <ScrollView
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={s.overline}>KEEP FOR LATER</Text>
      <Text style={s.title}>Saved messages</Text>
      <Text style={s.body}>
        Your private list of useful messages. Hidden topics, blocked members and
        chats you can no longer access stay out of view.
      </Text>
      {!!references.length && (
        <Text style={s.small}>
          {references.length} of 100 saved · newest saves first
        </Text>
      )}
      <MotionScene identity={`${currentPage}:${revision}`} style={{ gap: 14 }}>
        {rows.map((row) => {
          const { message, channel, reference, status } = row;
          const author = message
            ? displayIdentity(
                state.profiles.find((p) => p.id === message.authorId),
                message.authorName,
                message.authorInitials,
              )
            : null;
          return (
            <View key={reference.messageId} style={[s.card, { gap: 13 }]}>
              {status === "ready" && message && channel && author ? (
                <>
                  <Text style={s.overline}>
                    {channel.name} · {message.topic}
                  </Text>
                  <View style={s.row}>
                    <Avatar profile={author} size={32} />
                    <View style={s.grow}>
                      <Text style={s.h3}>
                        {message.authorId === state.currentUserId
                          ? "You"
                          : author.name}
                      </Text>
                      <RelativeTime date={message.createdAt} />
                    </View>
                  </View>
                  <LinkifiedText text={message.body} />
                  {message.editedAt && (
                    <Text style={s.small}>
                      Edited message · showing the current version
                    </Text>
                  )}
                  {message.image && (
                    <Text style={s.small}>
                      Image attached · open the topic to view it
                    </Text>
                  )}
                  <Button
                    secondary
                    title="Open topic"
                    disabled={!!busy}
                    onPress={() =>
                      nav.open({
                        kind: "channel",
                        id: channel.id,
                        topic: message.topic,
                      })
                    }
                  />
                </>
              ) : (
                <>
                  <Text style={s.h3}>
                    {status === "loading"
                      ? "Loading saved message…"
                      : status === "error"
                        ? "Couldn't load this message"
                        : "Message unavailable"}
                  </Text>
                  {status !== "loading" && (
                    <Text style={s.small}>
                      {status === "error"
                        ? "Check your connection and try refreshing. Your saved reference is still here."
                        : "It may have been removed, hidden by your settings, or posted in a chat you can no longer access."}
                    </Text>
                  )}
                </>
              )}
              <Button
                small
                secondary
                title={
                  busy === reference.messageId
                    ? "Removing…"
                    : "Remove from saved"
                }
                disabled={!!busy}
                onPress={async () => {
                  setBusy(reference.messageId);
                  try {
                    await nav.run(
                      {
                        type: "message.save",
                        messageId: reference.messageId,
                        saved: false,
                      },
                      "Removed from saved messages",
                    );
                  } finally {
                    setBusy(null);
                  }
                }}
              />
            </View>
          );
        })}
      </MotionScene>
      {!references.length && (
        <Empty
          title="Keep the useful messages"
          body="Open a message's options in any group chat and choose Save message. Only you can see this list."
          action="Go to group chats"
          onPress={() => nav.navigate("Chat")}
        />
      )}
      {references.length > 20 && (
        <View style={s.between}>
          <Button
            small
            secondary
            title="Previous"
            disabled={currentPage === 0 || !!busy}
            onPress={() => setPage(currentPage - 1)}
          />
          <Text style={s.small}>
            {currentPage * 20 + 1}–
            {Math.min((currentPage + 1) * 20, references.length)} of{" "}
            {references.length}
          </Text>
          <Button
            small
            secondary
            title="Next"
            disabled={(currentPage + 1) * 20 >= references.length || !!busy}
            onPress={() => setPage(currentPage + 1)}
          />
        </View>
      )}
      {!!references.length && (
        <Button
          secondary
          title="Refresh saved messages"
          disabled={!!busy}
          onPress={() => setRevision((value) => value + 1)}
        />
      )}
    </ScrollView>
  );
}
