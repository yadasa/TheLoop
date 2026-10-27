import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { readableError, useLoop } from "@theloop/client";
import {
  canManagePins,
  pinnedIds,
  visiblePinnedMessages,
  type Message,
} from "@theloop/core";
import { Sheet } from "./Sheet";
import { Avatar, Button, displayIdentity, LinkifiedText, s } from "./ui";
import { dayLabel } from "./chatPresentation";
import type { Nav } from "./navigation";

export function PinnedMessages({
  channelId,
  visible,
  onClose,
  onReply,
  nav,
}: {
  channelId: string;
  visible: boolean;
  onClose: () => void;
  onReply: (message: Message) => void;
  nav: Nav;
}) {
  const { state, role, readPinnedMessages } = useLoop();
  const channel = state.channels.find((value) => value.id === channelId);
  const [result, setResult] = useState<{
    scope: string;
    rows: Message[];
    error: string;
    loading: boolean;
  }>({ scope: "", rows: [], error: "", loading: false });
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const read = useRef(readPinnedMessages);
  read.current = readPinnedMessages;
  const ids = channel ? pinnedIds(channel) : [];
  const scope = JSON.stringify([
    state.currentUserId,
    channelId,
    visible,
    channel?.visibility,
    channel?.memberIds,
    ids,
    state.preferences.blockedIds,
    state.preferences.subscriptions,
    revision,
  ]);
  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    setResult({ scope, rows: [], error: "", loading: true });
    void read
      .current(channelId)
      .then((rows) => {
        if (mounted) setResult({ scope, rows, error: "", loading: false });
      })
      .catch((error) => {
        if (mounted)
          setResult({
            scope,
            rows: [],
            error: readableError(error),
            loading: false,
          });
      });
    return () => {
      mounted = false;
    };
  }, [scope, channelId, visible]);
  const current =
    result.scope === scope
      ? result
      : { scope, rows: [], error: "", loading: true };
  const messages = channel
    ? visiblePinnedMessages(state, channel, current.rows)
    : [];
  const manage = channel && canManagePins(state, channel, role);
  return (
    <Sheet
      visible={visible}
      title="Pinned messages"
      description={channel?.name}
      onClose={() => !busy && onClose()}
    >
      <Text style={s.small}>
        Important details kept here by the group chat moderators. Hidden topics
        and blocked members stay out of this view.
      </Text>
      {current.loading && <Text style={s.body}>Loading pinned messages…</Text>}
      {!!current.error && (
        <Text accessibilityRole="alert" style={s.body}>
          {current.error}
        </Text>
      )}
      {!current.loading && !current.error && messages.length === 0 && (
        <View style={[s.card, { gap: 8 }]}>
          <Text style={s.h3}>
            {ids.length ? "No visible pinned messages" : "Nothing pinned yet"}
          </Text>
          <Text style={s.small}>
            {ids.length
              ? "A pinned message may have been removed or hidden by your settings."
              : manage
                ? "Open a message’s options and choose Pin message to keep it here."
                : "Group chat moderators can pin useful details here."}
          </Text>
        </View>
      )}
      {messages.map((message) => {
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
                  {message.topic} · {dayLabel(message.createdAt)}
                </Text>
              </View>
            </View>
            <LinkifiedText text={message.body} />
            {message.image && (
              <Text style={s.small}>
                Includes an image · open the topic to view it
              </Text>
            )}
            <Button
              small
              secondary
              title="Reply in this topic"
              disabled={busy}
              onPress={() => {
                onClose();
                onReply(message);
              }}
            />
            {manage && (
              <Button
                small
                secondary
                title="Unpin message"
                disabled={busy}
                onPress={async () => {
                  setBusy(true);
                  try {
                    await nav.run(
                      {
                        type: "message.pin",
                        channelId,
                        messageId: message.id,
                        pinned: false,
                      },
                      "Message unpinned",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
          </View>
        );
      })}
      <Button
        secondary
        title={current.error ? "Try again" : "Refresh pins"}
        disabled={current.loading || busy}
        onPress={() => setRevision((value) => value + 1)}
      />
    </Sheet>
  );
}
