import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from "react-native";
import { useLoop } from "@theloop/client";
import type { Message, Subscription } from "@theloop/core";
import { channelUnread } from "@theloop/core";
import {
  Avatar,
  AmbientGradient,
  Button,
  Chip,
  color,
  displayIdentity,
  Empty,
  Field,
  Horizontal,
  Label,
  LinkifiedText,
  MotionScene,
  RelativeTime,
  s,
  Touch,
  useReducedMotion,
  useAppActive,
  isAppActive,
} from "./ui";
import type { Nav } from "./navigation";
import { SquadSummary } from "./Squads";
import { ImageAttachmentPicker, MediaImage, useImageAttachment } from "./Media";
import { Sheet } from "./Sheet";
import { ConversationSearch } from "./ConversationSearch";
import { useSubscriptionPicker } from "./SubscriptionPicker";
import {
  dayKey,
  dayLabel,
  isMessageContinuation,
  visibleQuote,
  topicStarter,
} from "./chatPresentation";

export function Chats({ nav }: { nav: Nav }) {
  const { state } = useLoop();
  const { pickSubscription, subscriptionSheet } = useSubscriptionPicker();
  const [conference, setConference] = useState("all");
  const [search, setSearch] = useState("");
  const [discover, setDiscover] = useState(false);
  const availableChannels = state.channels.filter(
    (c) =>
      c.visibility === "public" || !!c.memberIds?.includes(state.currentUserId),
  );
  const rooms = availableChannels.filter(
    (c) =>
      (conference === "all" || c.conferenceId === conference) &&
      `${c.name} ${c.description} ${c.topics.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (discover ||
        ((state.preferences.subscriptions[c.id] ||
          state.preferences.subscriptions[c.conferenceId] ||
          "muted") !== "hidden" &&
          (!state.preferences.hideUnsubscribed ||
            (state.preferences.subscriptions[c.id] ||
              state.preferences.subscriptions[c.conferenceId]) ===
              "following"))),
  );
  return (
    <ScrollView contentContainerStyle={s.content}>
      {subscriptionSheet}
      <View>
        <Text style={s.overline}>GROUP CHATS</Text>
        <Text style={[s.title, { marginTop: 5 }]}>Group chats</Text>
        <Text style={[s.body, { marginTop: 8, color: color.muted }]}>
          Choose a conference, then a topic. Follow chats you want updates from.
        </Text>
      </View>
      <View style={s.row}>
        <View style={s.grow}>
          <Button
            secondary
            title="Direct messages"
            onPress={() => nav.open({ kind: "inbox" })}
          />
        </View>
        <View style={s.grow}>
          <SquadSummary nav={nav} compact />
        </View>
      </View>
      <Field
        value={search}
        onChangeText={setSearch}
        placeholder="Search group chats or topics…"
      />
      <Horizontal>
        <Chip
          title="All conferences"
          selected={conference === "all"}
          onPress={() => setConference("all")}
        />
        {state.conferences.map((c) => (
          <Chip
            key={c.id}
            title={c.name}
            selected={conference === c.id}
            onPress={() => setConference(c.id)}
          />
        ))}
      </Horizontal>
      {conference !== "all" && (
        <View style={s.between}>
          <Touch
            label="Open conference chats and events"
            onPress={() => nav.open({ kind: "conference", id: conference })}
            style={{ paddingVertical: 10 }}
          >
            <Text style={[s.small, { color: color.ink }]}>
              {state.conferences.find((c) => c.id === conference)?.city} · View
              conference →
            </Text>
          </Touch>
          <Touch
            label="Conference notification preferences"
            onPress={() =>
              pickSubscription(
                "Conference updates",
                state.preferences.subscriptions[conference] || "muted",
                (value) =>
                  void nav.run({
                    type: "subscription.set",
                    targetId: conference,
                    value,
                  }),
              )
            }
            style={{ padding: 8 }}
          >
            <Text style={[s.small, { color: color.ink }]}>
              {state.preferences.subscriptions[conference] || "muted"} ▾
            </Text>
          </Touch>
        </View>
      )}
      <View style={s.between}>
        <Text style={s.h2}>
          {discover ? "Discover chats" : "Your group chats"}
        </Text>
        <Chip
          title={discover ? "Your chats" : "Discover"}
          selected={discover}
          onPress={() => setDiscover(!discover)}
        />
      </View>
      <MotionScene identity={`${conference}:${discover}`} style={{ gap: 22 }}>
        {rooms.map((c) => {
          const pref =
            state.preferences.subscriptions[c.id] ||
            state.preferences.subscriptions[c.conferenceId] ||
            "muted";
          const unread = channelUnread(state, c.id);
          const last = state.messages
            .filter(
              (m) =>
                m.channelId === c.id &&
                state.preferences.subscriptions[`${c.id}:${m.topic}`] !==
                  "hidden" &&
                state.preferences.subscriptions[`${c.id}:${m.topic}`] !==
                  "muted" &&
                !state.preferences.blockedIds.includes(m.authorId),
            )
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          return (
            <Touch
              key={c.id}
              label={`Open ${c.name}`}
              onPress={() => nav.open({ kind: "channel", id: c.id })}
              style={[s.card, { gap: 12 }]}
            >
              <View style={s.between}>
                <View style={[s.row, { flex: 1 }]}>
                  <View
                    style={{
                      width: 45,
                      height: 45,
                      borderRadius: 14,
                      backgroundColor: color.soft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 24, color: color.ink }}>
                      {c.icon || "#"}
                    </Text>
                  </View>
                  <View style={s.grow}>
                    <Text style={s.h3}>{c.name}</Text>
                    <Text style={s.small}>
                      {
                        state.conferences.find((f) => f.id === c.conferenceId)
                          ?.name
                      }
                      {c.members > 0
                        ? ` · ${c.members.toLocaleString()} people`
                        : ""}
                    </Text>
                  </View>
                </View>
                {pref === "following" && unread > 0 ? (
                  <Label dark>{unread}</Label>
                ) : (
                  <Text style={s.small}>
                    {pref === "following"
                      ? "Following"
                      : pref === "hidden"
                        ? "Hidden"
                        : "Muted"}
                  </Text>
                )}
              </View>
              <Text style={s.small} numberOfLines={2}>
                {last
                  ? `${state.profiles.find((p) => p.id === last.authorId)?.name.split(" ")[0] || "Member"}: ${last.body}`
                  : c.description}
              </Text>
              <View style={s.between}>
                <Text style={s.overline}>{c.topics.length} TOPICS</Text>
                <Text style={s.small}>Open group chat</Text>
              </View>
            </Touch>
          );
        })}
        {rooms.length === 0 && (
          <Empty
            title={
              availableChannels.length === 0
                ? "No group chats yet"
                : "No group chats in this view"
            }
            body={
              availableChannels.length === 0
                ? "Organizers add conference group chats. They will appear here when available to you. Direct messages and Squads are available above."
                : discover
                  ? "Try another conference or clear your search."
                  : "Try another conference or search, or use Discover to see chats you have hidden."
            }
            action={
              availableChannels.length === 0
                ? undefined
                : discover
                  ? "Clear filters"
                  : "Discover group chats"
            }
            onPress={
              availableChannels.length === 0
                ? undefined
                : discover
                  ? () => {
                      setConference("all");
                      setSearch("");
                    }
                  : () => setDiscover(true)
            }
          />
        )}
      </MotionScene>
      <SquadSummary nav={nav} />
      <View style={[s.card, { backgroundColor: color.soft }]}>
        <Text style={s.h3}>Choose your notifications</Text>
        <Text style={s.small}>
          Follow a group chat or topic for updates. Mute turns notifications
          off. Hide removes it from your chat list.
        </Text>
      </View>
    </ScrollView>
  );
}

export function ChannelDetail({
  id,
  initialTopic,
  nav,
}: {
  id: string;
  initialTopic?: string;
  nav: Nav;
}) {
  const { state, watchConversation, loadOlderMessages, history } = useLoop();
  const {
    pickSubscription,
    subscriptionSheet,
    isOpen: subscriptionOpen,
  } = useSubscriptionPicker();
  const appActive = useAppActive();
  const attachment = useImageAttachment(nav);
  const channel = state.channels.find((c) => c.id === id);
  const [topic, setTopic] = useState(() =>
    initialTopic &&
    (channel?.topics.includes(initialTopic) ||
      state.messages.some(
        (m) => m.channelId === id && m.topic === initialTopic,
      ))
      ? initialTopic
      : "all",
  );
  const [newTopic, setNewTopic] = useState("");
  const [addingTopic, setAddingTopic] = useState(false);
  const [topicSheet, setTopicSheet] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [topicSearch, setTopicSearch] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const draftBeforeEdit = useRef<{
    body: string;
    reply: Message | null;
    topic: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reacting, setReacting] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [messageAction, setMessageAction] = useState<
    "menu" | "delete" | "report"
  >("menu");
  const scroll = useRef<ScrollViewInstance>(null);
  const composerInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const stickToBottom = useRef(true);
  const firstLayout = useRef(true);
  const loadingOlder = useRef(false);
  const [showJump, setShowJump] = useState(false);
  const reducedMotion = useReducedMotion();
  const newestMessageId = state.messages
    .filter((message) => message.channelId === id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1)?.id;
  useEffect(() => {
    stickToBottom.current = true;
    firstLayout.current = true;
    loadingOlder.current = false;
    setShowJump(false);
    watchConversation(id, topic === "all" ? undefined : topic);
    return () => watchConversation(null);
  }, [id, topic, watchConversation]);
  useEffect(() => {
    if (
      appActive &&
      isAppActive() &&
      !showJump &&
      !topicSheet &&
      !searchVisible &&
      !actionMessage &&
      !subscriptionOpen &&
      !nav.dialogOpen &&
      !history.loading &&
      newestMessageId &&
      channel &&
      (channel.visibility === "public" ||
        channel.memberIds?.includes(state.currentUserId))
    )
      void nav.run({ type: "channel.read", channelId: id });
  }, [
    id,
    newestMessageId,
    appActive,
    showJump,
    history.loading,
    topicSheet,
    searchVisible,
    actionMessage,
    subscriptionOpen,
    nav.dialogOpen,
  ]);
  if (
    !channel ||
    (channel.visibility === "private" &&
      !channel.memberIds?.includes(state.currentUserId))
  )
    return (
      <Empty
        title="Group chat unavailable"
        body="This group chat may have been removed, or you may not have access."
      />
    );
  const allTopicNames = Array.from(
    new Set([
      ...channel.topics,
      ...state.messages.filter((m) => m.channelId === id).map((m) => m.topic),
    ]),
  );
  const topicNames = allTopicNames.filter(
    (t) =>
      t === topic || state.preferences.subscriptions[`${id}:${t}`] !== "hidden",
  );
  const messages = state.messages
    .filter(
      (m) =>
        m.channelId === id &&
        (topic === "all" || m.topic === topic) &&
        (topic !== "all" ||
          (state.preferences.subscriptions[`${id}:${m.topic}`] !== "hidden" &&
            state.preferences.subscriptions[`${id}:${m.topic}`] !== "muted")) &&
        !state.preferences.blockedIds.includes(m.authorId),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const pref =
    state.preferences.subscriptions[id] ||
    state.preferences.subscriptions[channel.conferenceId] ||
    "muted";
  const locked = busy || attachment.busy;
  const restoreDraft = () => {
    const saved = draftBeforeEdit.current;
    setEditing(null);
    draftBeforeEdit.current = null;
    if (saved) {
      setBody(saved.body);
      setReply(saved.reply);
      setTopic(saved.topic);
    }
  };
  const selectTopic = (next: string) => {
    if (locked) return;
    if (editing) {
      setBody(draftBeforeEdit.current?.body || "");
      setEditing(null);
      draftBeforeEdit.current = null;
    }
    if (next !== topic) setReply(null);
    setTopic(next);
    setTopicSheet(false);
    setAddingTopic(false);
  };
  const subscription = (targetId: string, label: string) =>
    pickSubscription(
      label,
      state.preferences.subscriptions[targetId] || pref,
      (value) =>
        void nav
          .run(
            { type: "subscription.set", targetId, value },
            `${label}: ${value}`,
          )
          .then((ok) => {
            if (ok && value === "hidden" && targetId === `${id}:${topic}`)
              selectTopic("all");
          }),
    );
  const send = async () => {
    if (!body.trim() || busy || attachment.busy) return;
    if (!editing && (topic === "all" || !allTopicNames.includes(topic))) {
      setTopicSheet(true);
      return;
    }
    loadingOlder.current = false;
    stickToBottom.current = true;
    setShowJump(false);
    const sendTopic = topic;
    setBusy(true);
    try {
      const image = editing
        ? null
        : await attachment.resolve({ kind: "channel", id });
      const ok = await nav.run(
        editing
          ? { type: "message.edit", messageId: editing.id, body }
          : {
              type: "message.send",
              channelId: id,
              topic: sendTopic,
              body,
              ...(reply ? { replyTo: reply.id } : {}),
              ...(image ? { imageId: image.id } : {}),
            },
      );
      if (ok) {
        if (editing) restoreDraft();
        else {
          attachment.clear();
          setBody("");
          setReply(null);
        }
      }
    } catch (error) {
      nav.toast(
        error instanceof Error
          ? error.message
          : "Could not send this image. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView
      style={s.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
    >
      {subscriptionSheet}
      <ConversationSearch
        channelId={id}
        initialTopic={topic === "all" ? undefined : topic}
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        onReply={(message) => {
          if (editing) restoreDraft();
          setEditing(null);
          setReply(message);
          setTopic(message.topic);
          requestAnimationFrame(() => composerInput.current?.focus());
        }}
      />
      <View
        style={{
          padding: 16,
          gap: 12,
          borderBottomWidth: 1,
          borderColor: color.line,
        }}
      >
        <View style={s.between}>
          <View style={s.grow}>
            <Text style={s.h2}>
              {channel.icon} {channel.name}
            </Text>
            <Text style={s.small}>
              {state.conferences.find((c) => c.id === channel.conferenceId)
                ?.name || "Conference chat"}
              {channel.members > 0
                ? ` · ${channel.members.toLocaleString()} ${channel.members === 1 ? "person" : "people"}`
                : ""}
            </Text>
          </View>
          <Button
            small
            secondary={pref !== "following"}
            title={
              pref === "following"
                ? "Following ✓"
                : pref === "hidden"
                  ? "Hidden ▾"
                  : "Muted ▾"
            }
            onPress={() => subscription(id, channel.name)}
            disabled={locked}
          />
        </View>
        <View style={[s.row, { gap: 6 }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Horizontal>
              <Chip
                title="All topics"
                selected={topic === "all"}
                onPress={() => selectTopic("all")}
                disabled={locked}
              />
              {topicNames.map((t) => (
                <Chip
                  key={t}
                  title={t}
                  selected={topic === t}
                  onPress={() => selectTopic(t)}
                  disabled={locked}
                />
              ))}
            </Horizontal>
          </View>
          <Touch
            label="Browse all topics"
            disabled={locked}
            onPress={() => setTopicSheet(true)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: color.soft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: color.ink, fontSize: 20 }}>☷</Text>
          </Touch>
        </View>
        <View style={s.between}>
          {topic !== "all" ? (
            <Touch
              label={`Manage ${topic} notifications`}
              disabled={locked}
              onPress={() => subscription(`${id}:${topic}`, topic)}
            >
              <Text style={s.small}>
                Topic:{" "}
                {state.preferences.subscriptions[`${id}:${topic}`] ||
                  "uses group chat setting"}{" "}
                ▾
              </Text>
            </Touch>
          ) : (
            <Text style={s.small}>Across your visible topics</Text>
          )}
          <Touch
            label="Search group chat history"
            disabled={locked}
            onPress={() => setSearchVisible(true)}
            style={{
              minHeight: 40,
              paddingHorizontal: 8,
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 12, color: color.ink, fontWeight: "600" }}>
              ⌕ Search
            </Text>
          </Touch>
        </View>
      </View>
      <Sheet
        visible={topicSheet}
        title="Topics"
        description="Pick a conversation. Your draft stays with you when you switch."
        onClose={() => setTopicSheet(false)}
      >
        <Field
          value={topicSearch}
          onChangeText={setTopicSearch}
          placeholder="Find a topic"
        />
        <Touch
          label="Read all topics"
          disabled={locked}
          onPress={() => selectTopic("all")}
          style={[
            s.card,
            {
              padding: 14,
              backgroundColor: topic === "all" ? color.soft : color.card,
            },
          ]}
        >
          <Text style={s.h3}>All topics {topic === "all" ? "✓" : ""}</Text>
          <Text style={s.small}>
            Catch up across the group chat. Muted and hidden topics stay out of
            this view.
          </Text>
        </Touch>
        {allTopicNames
          .filter((name) =>
            name.toLowerCase().includes(topicSearch.trim().toLowerCase()),
          )
          .map((name) => {
            const status = state.preferences.subscriptions[`${id}:${name}`];
            return (
              <Touch
                key={name}
                label={`Open topic ${name}`}
                disabled={locked}
                onPress={() => selectTopic(name)}
                style={[
                  s.card,
                  {
                    padding: 14,
                    backgroundColor: topic === name ? color.soft : color.card,
                  },
                ]}
              >
                <View style={s.between}>
                  <Text style={[s.h3, { flex: 1 }]}>{name}</Text>
                  <Text style={s.small}>{topic === name ? "✓" : "→"}</Text>
                </View>
                <Text style={s.small}>
                  {status === "hidden"
                    ? "Hidden from your topic list"
                    : status === "muted"
                      ? "Muted"
                      : status === "following"
                        ? "Following"
                        : "Uses group chat notifications"}
                </Text>
              </Touch>
            );
          })}
        {!allTopicNames.some((name) =>
          name.toLowerCase().includes(topicSearch.trim().toLowerCase()),
        ) && <Text style={s.small}>No topics match your search.</Text>}
        <Button
          secondary
          title={addingTopic ? "Cancel new topic" : "Create a topic"}
          disabled={locked}
          onPress={() => setAddingTopic(!addingTopic)}
        />
        {addingTopic && (
          <View style={s.row}>
            <View style={s.grow}>
              <Field
                value={newTopic}
                onChangeText={setNewTopic}
                placeholder="Topic name"
                maxLength={80}
              />
            </View>
            <Button
              small
              title={busy ? "…" : "Create topic"}
              disabled={locked || !newTopic.trim()}
              onPress={() => {
                const name = newTopic.trim();
                setBusy(true);
                void nav
                  .run(
                    { type: "topic.create", channelId: id, name },
                    "Topic created",
                  )
                  .then((ok) => {
                    if (ok) {
                      setTopic(name);
                      setAddingTopic(false);
                      setNewTopic("");
                      setReply(null);
                      setTopicSheet(false);
                    }
                  })
                  .finally(() => setBusy(false));
              }}
            />
          </View>
        )}
      </Sheet>
      <Sheet
        visible={!!actionMessage}
        title={
          messageAction === "delete"
            ? "Delete this message?"
            : messageAction === "report"
              ? "Report this message?"
              : "Message"
        }
        description={
          messageAction === "delete"
            ? "It will be removed from the group chat. This cannot be undone."
            : messageAction === "report"
              ? `Moderators will receive this message${actionMessage?.image ? " and its attached image" : ""} for review.`
              : undefined
        }
        onClose={() => !busy && setActionMessage(null)}
      >
        {actionMessage && (
          <>
            <View style={[s.card, { padding: 16 }]}>
              <Text style={s.small} numberOfLines={4}>
                {actionMessage.body}
              </Text>
            </View>
            {messageAction === "menu" ? (
              <>
                <Button
                  secondary
                  title="Reply"
                  disabled={locked}
                  onPress={() => {
                    if (editing) restoreDraft();
                    setReply(actionMessage);
                    setTopic(actionMessage.topic);
                    setEditing(null);
                    setActionMessage(null);
                    requestAnimationFrame(() => composerInput.current?.focus());
                  }}
                />
                {actionMessage.authorId === state.currentUserId ? (
                  <>
                    <Button
                      secondary
                      title="Edit message"
                      disabled={locked}
                      onPress={() => {
                        if (!editing)
                          draftBeforeEdit.current = { body, reply, topic };
                        setEditing(actionMessage);
                        setBody(actionMessage.body);
                        setReply(null);
                        setTopic(actionMessage.topic);
                        setActionMessage(null);
                        requestAnimationFrame(() =>
                          composerInput.current?.focus(),
                        );
                      }}
                    />
                    <Button
                      secondary
                      title="Delete message"
                      disabled={locked}
                      onPress={() => setMessageAction("delete")}
                    />
                  </>
                ) : (
                  <Button
                    secondary
                    title="Report message"
                    disabled={locked}
                    onPress={() => setMessageAction("report")}
                  />
                )}
              </>
            ) : (
              <>
                <Button
                  title={
                    busy
                      ? "Working…"
                      : messageAction === "delete"
                        ? "Delete message"
                        : "Send report"
                  }
                  disabled={locked}
                  onPress={() => {
                    const selected = actionMessage;
                    setBusy(true);
                    void nav
                      .run(
                        messageAction === "delete"
                          ? { type: "message.delete", messageId: selected.id }
                          : {
                              type: "report.create",
                              targetType: "message",
                              targetId: selected.id,
                              reason: "Community guideline concern",
                            },
                        messageAction === "delete"
                          ? "Message deleted"
                          : "Report sent to moderators",
                      )
                      .then((ok) => {
                        if (ok) {
                          if (editing?.id === selected.id) restoreDraft();
                          if (reply?.id === selected.id) setReply(null);
                          setActionMessage(null);
                        }
                      })
                      .finally(() => setBusy(false));
                  }}
                />
                <Button
                  secondary
                  title="Cancel"
                  disabled={locked}
                  onPress={() => setActionMessage(null)}
                />
              </>
            )}
          </>
        )}
      </Sheet>
      <ScrollView
        ref={scroll}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          gap: 6,
          paddingBottom: 24,
          ...(messages.length === 0
            ? { flexGrow: 1, justifyContent: "center" as const }
            : {}),
        }}
        scrollEventThrottle={64}
        onScroll={(event) => {
          if (loadingOlder.current) return;
          const { layoutMeasurement, contentOffset, contentSize } =
            event.nativeEvent;
          stickToBottom.current =
            contentOffset.y + layoutMeasurement.height >=
            contentSize.height - 90;
          setShowJump(!stickToBottom.current);
        }}
        onContentSizeChange={() => {
          if (loadingOlder.current) return;
          if (stickToBottom.current)
            scroll.current?.scrollToEnd({
              animated: !firstLayout.current && !reducedMotion,
            });
          else setShowJump(true);
          firstLayout.current = false;
        }}
      >
        {history.hasMore && (
          <Button
            secondary
            small
            title={
              history.loading ? "Loading history…" : "Load earlier messages ↑"
            }
            disabled={history.loading}
            onPress={() => {
              stickToBottom.current = false;
              loadingOlder.current = true;
              setShowJump(true);
              void loadOlderMessages()
                .catch(() =>
                  nav.toast(
                    "Could not load earlier messages. Please try again.",
                  ),
                )
                .finally(() =>
                  requestAnimationFrame(() =>
                    requestAnimationFrame(() => {
                      loadingOlder.current = false;
                    }),
                  ),
                );
            }}
          />
        )}
        {history.loading && !history.hasMore && (
          <Text style={[s.small, { textAlign: "center" }]}>
            Loading messages…
          </Text>
        )}
        {messages.map((m, i) => {
          const author = displayIdentity(
            state.profiles.find((p) => p.id === m.authorId),
            m.authorName,
            m.authorInitials,
          );
          const mine = m.authorId === state.currentUserId;
          const quoted = visibleQuote(
            m,
            state.messages,
            state.preferences.blockedIds,
          );
          const continuation = isMessageContinuation(messages[i - 1], m);
          const newDay =
            i === 0 ||
            dayKey(messages[i - 1].createdAt) !== dayKey(m.createdAt);
          return (
            <View key={m.id}>
              {newDay && (
                <View style={[s.row, { paddingVertical: 18, gap: 12 }]}>
                  <View
                    style={{ flex: 1, height: 1, backgroundColor: color.line }}
                  />
                  <Text style={[s.small, { fontSize: 11 }]}>
                    {dayLabel(m.createdAt)}
                  </Text>
                  <View
                    style={{ flex: 1, height: 1, backgroundColor: color.line }}
                  />
                </View>
              )}
              <View
                style={[
                  s.row,
                  {
                    alignItems: "flex-start",
                    gap: 10,
                    marginTop: !continuation && !newDay ? 16 : 0,
                  },
                ]}
              >
                {!continuation ? (
                  <Touch
                    label={`View ${author?.name || "member"}`}
                    onPress={() =>
                      nav.open({ kind: "profile", id: m.authorId })
                    }
                  >
                    <Avatar profile={author} size={33} />
                  </Touch>
                ) : (
                  <View style={{ width: 33 }} />
                )}
                <View style={{ flex: 1, gap: 6 }}>
                  <View
                    style={[
                      s.between,
                      continuation && {
                        position: "absolute",
                        right: 0,
                        top: 0,
                        zIndex: 1,
                      },
                    ]}
                  >
                    <View
                      style={[s.row, { gap: 7, flex: 1, flexWrap: "wrap" }]}
                    >
                      {!continuation && (
                        <>
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "600",
                              color: color.ink,
                            }}
                          >
                            {mine ? "You" : author?.name || "Loop member"}
                          </Text>
                          <RelativeTime date={m.createdAt} />
                        </>
                      )}
                      {m.editedAt && <Text style={s.small}>edited</Text>}
                    </View>
                    <Touch
                      label={`Message actions: ${m.body.slice(0, 60)}`}
                      disabled={locked}
                      onPress={() => {
                        setActionMessage(m);
                        setMessageAction("menu");
                      }}
                      style={{
                        minWidth: 44,
                        minHeight: 36,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={s.small}>•••</Text>
                    </Touch>
                  </View>
                  {(i === 0 || messages[i - 1].topic !== m.topic) &&
                    topic === "all" && (
                      <Text style={[s.overline, { fontSize: 9 }]}>
                        {m.topic}
                      </Text>
                    )}
                  {m.replyTo && (
                    <View
                      style={{
                        borderLeftWidth: 2,
                        borderColor: color.line,
                        paddingLeft: 10,
                        paddingVertical: 5,
                      }}
                    >
                      <Text style={s.small} numberOfLines={2}>
                        ↳ {quoted?.body || "Message unavailable"}
                      </Text>
                    </View>
                  )}
                  <LinkifiedText
                    text={m.body}
                    style={
                      continuation
                        ? { paddingRight: 44, minHeight: 36 }
                        : undefined
                    }
                  />
                  <MediaImage image={m.image} caption={m.body} nav={nav} />
                  <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
                    {Object.entries(m.reactions)
                      .filter(([, ids]) => ids.length > 0)
                      .map(([emoji, ids]) => (
                        <Touch
                          key={emoji}
                          label={`React ${emoji}, ${ids.length}`}
                          selected={ids.includes(state.currentUserId)}
                          onPress={() =>
                            void nav.run({
                              type: "message.react",
                              messageId: m.id,
                              emoji,
                            })
                          }
                          style={{
                            borderWidth: 1,
                            borderColor: ids.includes(state.currentUserId)
                              ? color.ink
                              : color.line,
                            paddingHorizontal: 9,
                            minHeight: 36,
                            justifyContent: "center",
                            borderRadius: 20,
                            backgroundColor: color.soft,
                          }}
                        >
                          <Text style={{ fontSize: 12, color: color.ink }}>
                            {emoji} {ids.length}
                          </Text>
                        </Touch>
                      ))}
                    <Touch
                      label="Add reaction"
                      onPress={() =>
                        setReacting(reacting === m.id ? null : m.id)
                      }
                      style={{
                        minWidth: 36,
                        minHeight: 36,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={s.small}>＋</Text>
                    </Touch>
                  </View>
                  {reacting === m.id && (
                    <View style={[s.wrap, { gap: 6 }]}>
                      {["🖤", "🔥", "🙌", "💯", "😂"].map((emoji) => (
                        <Touch
                          key={emoji}
                          label={`React ${emoji}`}
                          onPress={() => {
                            void nav.run({
                              type: "message.react",
                              messageId: m.id,
                              emoji,
                            });
                            setReacting(null);
                          }}
                          style={{
                            padding: 10,
                            borderRadius: 12,
                            backgroundColor: color.soft,
                            minWidth: 39,
                            minHeight: 43,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text style={{ fontSize: 19, color: color.ink }}>
                            {emoji}
                          </Text>
                        </Touch>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        })}
        {messages.length === 0 && !history.loading && (
          <View style={[s.card, { padding: 24, gap: 18, overflow: "hidden" }]}>
            <AmbientGradient variant="hero" animated={false} />
            <View
              style={{
                width: 50,
                height: 50,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: color.line,
                backgroundColor: color.soft,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 26, color: color.ink }}>#</Text>
            </View>
            <View style={{ gap: 8 }}>
              <Text style={s.overline}>
                {topic === "all" ? "YOUR CONVERSATIONS" : topic.toUpperCase()}
              </Text>
              <Text style={s.h2}>
                {topic === "all"
                  ? "Find your conversation"
                  : topicStarter(topic).title}
              </Text>
              <Text style={s.body}>
                {topic === "all"
                  ? channel.description
                  : topicStarter(topic).body}
              </Text>
            </View>
            <Button
              secondary
              disabled={locked}
              title={
                topic === "all"
                  ? "Explore topics"
                  : body.trim()
                    ? "Continue your draft"
                    : "Start a message"
              }
              onPress={() => {
                if (topic === "all") setTopicSheet(true);
                else {
                  if (!body.trim()) setBody(topicStarter(topic).draft);
                  composerInput.current?.focus();
                }
              }}
            />
            <Text style={s.small}>
              {topic === "all"
                ? "Choose a topic to read or write. Muted topics stay out of the combined view."
                : "Nothing posted here yet. Your message stays a draft until you send it."}
            </Text>
          </View>
        )}
      </ScrollView>
      {showJump && (
        <View style={{ padding: 7, alignItems: "center" }}>
          <Button
            small
            title="Jump to latest ↓"
            onPress={() => {
              loadingOlder.current = false;
              stickToBottom.current = true;
              setShowJump(false);
              scroll.current?.scrollToEnd({ animated: !reducedMotion });
            }}
          />
        </View>
      )}
      <View
        style={{
          padding: 14,
          paddingBottom: Platform.OS === "ios" ? 28 : 14,
          borderTopWidth: 1,
          borderColor: color.line,
          backgroundColor: color.paper,
          gap: 8,
        }}
      >
        {(reply || editing) && (
          <View style={s.between}>
            <Text style={[s.small, { flex: 1 }]} numberOfLines={1}>
              {editing
                ? "Editing your message"
                : `Replying to ${state.profiles.find((p) => p.id === reply?.authorId)?.name || "member"}`}
              : {editing?.body || reply?.body}
            </Text>
            <Touch
              label="Cancel reply or edit"
              disabled={locked}
              onPress={() => {
                if (editing) restoreDraft();
                else setReply(null);
              }}
              style={{ padding: 8 }}
            >
              <Text style={{ color: color.ink }}>×</Text>
            </Touch>
          </View>
        )}
        {topic === "all" && !editing ? (
          <>
            <Text style={[s.small, { textAlign: "center" }]}>
              {body.trim()
                ? "Your draft is saved here. Pick its topic before sending."
                : "You're reading across topics. Choose one to join in."}
            </Text>
            <Button
              title="Choose a topic to message"
              onPress={() => setTopicSheet(true)}
              disabled={locked}
            />
          </>
        ) : (
          <>
            {!editing && (
              <ImageAttachmentPicker attachment={attachment} disabled={busy} />
            )}
            <View style={[s.row, { alignItems: "flex-end" }]}>
              <View style={s.grow}>
                <Field
                  inputRef={composerInput}
                  value={body}
                  onChangeText={setBody}
                  disabled={busy}
                  placeholder={`Message ${editing?.topic || topic}…`}
                  multiline
                  compact
                  maxLength={4000}
                />
              </View>
              <Button
                title={busy ? "…" : editing ? "Save" : "Send"}
                disabled={busy || attachment.busy || !body.trim()}
                onPress={send}
              />
            </View>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
