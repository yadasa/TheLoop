import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
  type ScrollViewInstance,
} from "react-native";
import { useLoop } from "@theloop/client";
import type { Message, Subscription } from "@theloop/core";
import { channelUnread } from "@theloop/core";
import {
  Avatar,
  Button,
  Chip,
  color,
  displayIdentity,
  Empty,
  Field,
  Horizontal,
  Label,
  LinkifiedText,
  pickSubscription,
  RelativeTime,
  s,
  Touch,
  useReducedMotion,
  useAppActive,
  isAppActive,
} from "./ui";
import type { Nav } from "./navigation";
import { SquadSummary } from "./Squads";
import {
  confirmContentReport,
  ImageAttachmentPicker,
  MediaImage,
  useImageAttachment,
} from "./Media";

export function Chats({ nav }: { nav: Nav }) {
  const { state } = useLoop();
  const [conference, setConference] = useState("all");
  const [search, setSearch] = useState("");
  const [discover, setDiscover] = useState(false);
  const rooms = state.channels.filter(
    (c) =>
      (c.visibility === "public" ||
        !!c.memberIds?.includes(state.currentUserId)) &&
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
      <View>
        <Text style={s.overline}>GROUP CHATS</Text>
        <Text style={[s.title, { marginTop: 5 }]}>Group chats</Text>
        <Text style={[s.body, { marginTop: 8, color: color.muted }]}>
          Choose a conference, then a topic. Follow chats you want updates from.
        </Text>
      </View>
      <Button
        secondary
        title="Direct messages"
        onPress={() => nav.open({ kind: "inbox" })}
      />
      <SquadSummary nav={nav} />
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
            title={c.shortName}
            selected={conference === c.id}
            onPress={() => setConference(c.id)}
          />
        ))}
      </Horizontal>
      {conference !== "all" && (
        <View style={s.between}>
          <Text style={s.small}>
            {state.conferences.find((c) => c.id === conference)?.city}
          </Text>
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
                        ?.shortName
                    }{" "}
                    · {c.members.toLocaleString()} people
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
          title="No group chats in this view"
          body="Try another conference or search, or use Discover to see chats you have hidden."
          action="Discover group chats"
          onPress={() => setDiscover(true)}
        />
      )}
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
  const [showHiddenTopics, setShowHiddenTopics] = useState(false);
  const [body, setBody] = useState("");
  const [reply, setReply] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [reacting, setReacting] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
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
      !history.loading &&
      newestMessageId &&
      channel &&
      (channel.visibility === "public" ||
        channel.memberIds?.includes(state.currentUserId))
    )
      void nav.run({ type: "channel.read", channelId: id });
  }, [id, newestMessageId, appActive, showJump, history.loading]);
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
      showHiddenTopics ||
      t === topic ||
      state.preferences.subscriptions[`${id}:${t}`] !== "hidden",
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
              setTopic("all");
          }),
    );
  const send = async () => {
    if (!body.trim() || busy || attachment.busy) return;
    loadingOlder.current = false;
    stickToBottom.current = true;
    setShowJump(false);
    const sendTopic = topic === "all" ? topicNames[0] || "General" : topic;
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
        attachment.clear();
        setBody("");
        setReply(null);
        setEditing(null);
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
      <View
        style={{
          padding: 20,
          gap: 15,
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
              {channel.members.toLocaleString()} people ·{" "}
              {
                state.conferences.find((c) => c.id === channel.conferenceId)
                  ?.shortName
              }
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
          />
        </View>
        <Horizontal>
          <Chip
            title="All topics"
            selected={topic === "all"}
            onPress={() => setTopic("all")}
          />
          {topicNames.map((t) => (
            <Chip
              key={t}
              title={t}
              selected={topic === t}
              onPress={() => setTopic(t)}
            />
          ))}
          <Chip title="＋ Topic" onPress={() => setAddingTopic(!addingTopic)} />
          {allTopicNames.some(
            (t) => state.preferences.subscriptions[`${id}:${t}`] === "hidden",
          ) && (
            <Chip
              title={
                showHiddenTopics
                  ? "Hide hidden topics"
                  : "Discover hidden topics"
              }
              selected={showHiddenTopics}
              onPress={() => setShowHiddenTopics(!showHiddenTopics)}
            />
          )}
        </Horizontal>
        {topic !== "all" && (
          <Touch
            label={`Manage ${topic} notifications`}
            onPress={() => subscription(`${id}:${topic}`, topic)}
          >
            <Text style={s.small}>
              Topic:{" "}
              {state.preferences.subscriptions[`${id}:${topic}`] ||
                "uses group chat setting"}{" "}
              ▾
            </Text>
          </Touch>
        )}
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
              disabled={busy || !newTopic.trim()}
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
                    }
                  })
                  .finally(() => setBusy(false));
              }}
            />
          </View>
        )}
      </View>
      <ScrollView
        ref={scroll}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 35 }}
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
        <View style={{ alignItems: "center", paddingVertical: 14, gap: 7 }}>
          <Text style={{ fontSize: 33, color: color.ink }}>◎</Text>
          <Text style={s.h3}>Messages are organized by topic.</Text>
          <Text style={[s.small, { textAlign: "center" }]}>
            {channel.description}
          </Text>
        </View>
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
          const quoted = m.replyTo
            ? state.messages.find((q) => q.id === m.replyTo)
            : undefined;
          return (
            <View
              key={m.id}
              style={[s.row, { alignItems: "flex-start", gap: 10 }]}
            >
              <Touch
                label={`View ${author?.name || "member"}`}
                onPress={() => nav.open({ kind: "profile", id: m.authorId })}
              >
                <Avatar profile={author} size={33} />
              </Touch>
              <View style={{ flex: 1, gap: 6 }}>
                <View style={s.between}>
                  <View style={[s.row, { gap: 7 }]}>
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
                    {m.editedAt && <Text style={s.small}>edited</Text>}
                  </View>
                  <Touch
                    label="Message actions"
                    onPress={() =>
                      Alert.alert(
                        "Message",
                        m.body.length > 160
                          ? `${m.body.slice(0, 160)}…`
                          : m.body,
                        [
                          {
                            text: "Reply",
                            onPress: () => {
                              setReply(m);
                              setTopic(m.topic);
                              setEditing(null);
                            },
                          },
                          ...(mine
                            ? [
                                {
                                  text: "Edit or delete",
                                  onPress: () =>
                                    Alert.alert(
                                      "Your message",
                                      "Make a change or remove this message.",
                                      [
                                        {
                                          text: "Edit",
                                          onPress: () => {
                                            attachment.clear();
                                            setEditing(m);
                                            setBody(m.body);
                                            setReply(null);
                                          },
                                        },
                                        {
                                          text: "Delete",
                                          style: "destructive",
                                          onPress: () =>
                                            Alert.alert(
                                              "Delete your message?",
                                              "This message will be deleted from the group chat.",
                                              [
                                                {
                                                  text: "Keep message",
                                                  style: "cancel",
                                                },
                                                {
                                                  text: "Delete message",
                                                  style: "destructive",
                                                  onPress: () =>
                                                    void nav.run(
                                                      {
                                                        type: "message.delete",
                                                        messageId: m.id,
                                                      },
                                                      "Message deleted",
                                                    ),
                                                },
                                              ],
                                              { cancelable: true },
                                            ),
                                        },
                                        { text: "Cancel", style: "cancel" },
                                      ],
                                      { cancelable: true },
                                    ),
                                },
                              ]
                            : [
                                {
                                  text: "Report",
                                  onPress: () =>
                                    confirmContentReport(
                                      nav,
                                      {
                                        type: "report.create",
                                        targetId: m.id,
                                        targetType: "message",
                                        reason: "Community guideline concern",
                                      },
                                      !!m.image,
                                    ),
                                },
                              ]),
                          { text: "Cancel", style: "cancel" },
                        ],
                        { cancelable: true },
                      )
                    }
                    style={{ padding: 5 }}
                  >
                    <Text style={s.small}>•••</Text>
                  </Touch>
                </View>
                {(i === 0 || messages[i - 1].topic !== m.topic) &&
                  topic === "all" && (
                    <Text style={[s.overline, { fontSize: 9 }]}>{m.topic}</Text>
                  )}
                {quoted && (
                  <View
                    style={{
                      borderLeftWidth: 2,
                      borderColor: color.line,
                      paddingLeft: 10,
                      paddingVertical: 5,
                    }}
                  >
                    <Text style={s.small} numberOfLines={2}>
                      ↳ {quoted.body}
                    </Text>
                  </View>
                )}
                <LinkifiedText text={m.body} />
                <MediaImage image={m.image} caption={m.body} nav={nav} />
                <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
                  {Object.entries(m.reactions)
                    .filter(([, ids]) => ids.length > 0)
                    .map(([emoji, ids]) => (
                      <Touch
                        key={emoji}
                        label={`React ${emoji}, ${ids.length}`}
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
                          paddingVertical: 4,
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
                    onPress={() => setReacting(reacting === m.id ? null : m.id)}
                    style={{ paddingHorizontal: 5, paddingVertical: 4 }}
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
          );
        })}
        {messages.length === 0 && (
          <Empty
            title="No messages in this topic"
            body="Send the first message."
          />
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
              onPress={() => {
                setReply(null);
                setEditing(null);
                setBody("");
              }}
              style={{ padding: 8 }}
            >
              <Text style={{ color: color.ink }}>×</Text>
            </Touch>
          </View>
        )}
        {!editing && (
          <ImageAttachmentPicker attachment={attachment} disabled={busy} />
        )}
        <View style={[s.row, { alignItems: "flex-end" }]}>
          <View style={s.grow}>
            <Field
              value={body}
              onChangeText={setBody}
              disabled={busy}
              placeholder={`Message ${topic === "all" ? topicNames[0] || "General" : topic}…`}
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
        <Text style={[s.small, { fontSize: 10, paddingHorizontal: 3 }]}>
          Follow the group guidelines. Do not share someone else’s private
          information.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
