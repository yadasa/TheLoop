import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import {
  canSearchChannel,
  emptyReplyThread,
  readableError,
  useLoop,
  type ReplyThreadHandle,
  type ReplyThreadState,
} from "@theloop/client";
import type { Message } from "@theloop/core";
import { Sheet } from "./Sheet";
import { Avatar, Button, color, displayIdentity, LinkifiedText, s } from "./ui";
import { MediaImage } from "./Media";
import { dayLabel } from "./chatPresentation";
import type { Nav } from "./navigation";

export function MessageReplies({
  channelId,
  messageId,
  onClose,
  onReply,
  onOpen,
  nav,
}: {
  nav: Nav;
  channelId: string;
  messageId: string | null;
  onClose(): void;
  onReply(message: Message): void;
  onOpen(id: string): void;
}) {
  const { state, mode, ready, watchReplyThread } = useLoop();
  const watch = useRef(watchReplyThread);
  watch.current = watchReplyThread;
  const handle = useRef<ReplyThreadHandle | null>(null);
  const [result, setResult] = useState<{
    scope: string;
    value: ReplyThreadState;
    error: string;
  }>({ scope: "", value: emptyReplyThread(), error: "" });
  const [retry, setRetry] = useState(0);
  const channel = state.channels.find((value) => value.id === channelId);
  const scope = JSON.stringify([
    state.currentUserId,
    mode,
    ready,
    channelId,
    messageId,
    canSearchChannel(state, channelId),
    state.preferences.blockedIds,
    state.preferences.subscriptions,
    retry,
    mode === "demo" ? state.messages : null,
  ]);
  useEffect(() => {
    if (!messageId) return;
    let active = true;
    setResult({ scope, value: emptyReplyThread(), error: "" });
    const thread = watch.current(
      channelId,
      messageId,
      (value) => {
        if (active) setResult({ scope, value, error: "" });
      },
      (error) => {
        if (active)
          setResult({
            scope,
            value: { ...emptyReplyThread(), loading: false },
            error: readableError(error),
          });
      },
    );
    handle.current = thread;
    return () => {
      active = false;
      thread.close();
      if (handle.current === thread) handle.current = null;
    };
  }, [scope, channelId, messageId]);
  const current =
    result.scope === scope ? result : { value: emptyReplyThread(), error: "" };
  const { parent, parentLoaded, replies, loading, hasMore } = current.value;
  const messageCard = (message: Message, original: boolean) => {
    const author = displayIdentity(
      state.profiles.find((profile) => profile.id === message.authorId),
      message.authorName,
      message.authorInitials,
    );
    return (
      <View
        key={message.id}
        style={[
          s.card,
          {
            padding: 16,
            gap: 12,
            ...(original
              ? { borderLeftWidth: 3, borderLeftColor: color.ink }
              : {}),
          },
        ]}
      >
        <View style={s.row}>
          <Avatar profile={author} size={30} />
          <View style={s.grow}>
            <Text style={s.h3}>
              {message.authorId === state.currentUserId ? "You" : author.name}
            </Text>
            <Text style={s.small}>
              {dayLabel(message.createdAt)}
              {message.editedAt ? " · edited" : ""}
            </Text>
          </View>
        </View>
        <LinkifiedText text={message.body} />
        {message.image && (
          <MediaImage
            image={message.image}
            caption={message.body || "Photo in conversation"}
            nav={nav}
          />
        )}
        <View style={s.row}>
          <View style={s.grow}>
            <Button
              small
              secondary
              title={original ? "Reply in topic" : "Reply"}
              onPress={() => {
                onClose();
                onReply(message);
              }}
            />
          </View>
          {!original && (
            <Button
              small
              secondary
              title="View replies"
              onPress={() => onOpen(message.id)}
            />
          )}
        </View>
      </View>
    );
  };
  return (
    <Sheet
      visible={!!messageId}
      title="Replies"
      description={
        parent
          ? `${channel?.name || "Group chat"} · ${parent.topic}`
          : channel?.name
      }
      onClose={onClose}
    >
      <Text style={s.small}>
        Replies to this message, together in one place. New replies appear here
        while this view is open.
      </Text>
      {!!current.error && (
        <>
          <Text accessibilityRole="alert" style={s.body}>
            {current.error}
          </Text>
          <Button
            secondary
            title="Try again"
            onPress={() => setRetry((value) => value + 1)}
          />
        </>
      )}
      {!current.error && !parentLoaded && (
        <Text style={s.body}>Loading conversation…</Text>
      )}
      {!current.error && parentLoaded && !parent && (
        <View style={s.card}>
          <Text style={s.h3}>Message unavailable</Text>
          <Text style={s.small}>
            It may have been removed, or hidden by your settings.
          </Text>
        </View>
      )}
      {parent && (
        <>
          <Text style={s.overline}>ORIGINAL MESSAGE</Text>
          {!!parent.replyTo && (
            <Button
              small
              secondary
              title="Back to parent conversation"
              onPress={() => onOpen(parent.replyTo!)}
            />
          )}
          {messageCard(parent, true)}
          <View style={s.between}>
            <Text style={s.h3}>
              {replies.length} visible{" "}
              {replies.length === 1 ? "reply" : "replies"}
            </Text>
            {hasMore && (
              <Button
                small
                secondary
                title={loading ? "Loading…" : "Earlier replies"}
                disabled={loading}
                onPress={() => {
                  void handle.current?.loadMore().catch(() => {});
                }}
              />
            )}
          </View>
          {loading && <Text style={s.small}>Loading replies…</Text>}
          {!loading && !replies.length && (
            <Text style={s.body}>
              {hasMore
                ? "No visible replies in this part of the conversation. Try earlier replies."
                : "No replies here yet. Add one in the topic."}
            </Text>
          )}
          {replies.map((message) => messageCard(message, false))}
          <Text style={s.small}>
            Replies stay in the original topic. View replies on a response to
            follow that branch. Blocked members and hidden topics are excluded.
          </Text>
        </>
      )}
    </Sheet>
  );
}
