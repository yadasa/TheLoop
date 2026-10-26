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
import { connected, type SquadInvite } from "@theloop/core";
import {
  Avatar,
  Button,
  Chip,
  color,
  Empty,
  Field,
  Horizontal,
  Label,
  LinkifiedText,
  RelativeTime,
  s,
  Section,
  Touch,
  useReducedMotion,
  useAppActive,
  isAppActive,
} from "./ui";
import type { Nav } from "./navigation";
import { ImageAttachmentPicker, MediaImage, useImageAttachment } from "./Media";

const capacity = 12;
const activeInvite = (invite: SquadInvite) =>
  invite.status === "pending" && Date.parse(invite.expiresAt) > Date.now();

function Initials({
  name,
  initials,
  size = 36,
}: {
  name: string;
  initials: string;
  size?: number;
}) {
  return (
    <View
      accessible
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color.soft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: size / 3, fontWeight: "600", color: color.ink }}>
        {initials.slice(0, 2)}
      </Text>
    </View>
  );
}

export function SquadSummary({ nav }: { nav: Nav }) {
  const { state } = useLoop();
  const invites = (state.squadInvites ?? []).filter(
    (invite) => invite.toId === state.currentUserId && activeInvite(invite),
  );
  const squads = (state.squads ?? []).filter(
    (squad) => squad.memberIds.includes(state.currentUserId) && !squad.archived,
  );
  return (
    <View style={[s.card, { backgroundColor: color.soft }]}>
      <View style={s.between}>
        <View style={s.grow}>
          <Text style={s.overline}>A SMALLER CIRCLE</Text>
          <Text style={[s.h2, { marginTop: 5 }]}>Your squads.</Text>
        </View>
        <Button
          small
          secondary
          title="Open"
          onPress={() => nav.open({ kind: "squads" })}
        />
      </View>
      <Text style={s.small}>
        Private group chats for up to 12 people. Members join by invitation.
      </Text>
      {invites.length > 0 && (
        <Touch
          label={`Review ${invites.length} squad invitations`}
          style={{ paddingVertical: 7 }}
          onPress={() => nav.open({ kind: "squads" })}
        >
          <Text style={s.h3}>
            {invites.length} invitation{invites.length === 1 ? "" : "s"} waiting
            ↗
          </Text>
        </Touch>
      )}
      {squads.slice(0, 3).map((squad) => (
        <Touch
          key={squad.id}
          label={`Open squad ${squad.name}`}
          onPress={() => nav.open({ kind: "squad", id: squad.id })}
          style={[s.between, { paddingVertical: 8 }]}
        >
          <Text style={[s.h3, s.grow]}>{squad.name}</Text>
          <Text style={s.small}>
            {squad.memberIds.length}{" "}
            {squad.memberIds.length === 1 ? "person" : "people"} ↗
          </Text>
        </Touch>
      ))}
      {squads.length === 0 && (
        <Button
          small
          title="Start a squad ＋"
          onPress={() => nav.open({ kind: "create-squad" })}
        />
      )}
    </View>
  );
}

export function Squads({ nav }: { nav: Nav }) {
  const { state } = useLoop();
  const [filter, setFilter] = useState(() =>
    (state.squadInvites ?? []).some(
      (invite) => invite.toId === state.currentUserId && activeInvite(invite),
    )
      ? "Invitations"
      : "Your squads",
  );
  const squads = state.squads
    .filter(
      (squad) =>
        squad.memberIds.includes(state.currentUserId) && !squad.archived,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const invites = (state.squadInvites ?? []).filter(
    (invite) => invite.toId === state.currentUserId && activeInvite(invite),
  );
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.overline}>PRIVATE GROUP CHATS</Text>
      <Text style={s.title}>Squads</Text>
      <Text style={s.body}>
        Plan a dinner, keep up with friends, or start an accountability group.
        Invite your connections; they choose whether to join.
      </Text>
      <Button
        title="Start a squad ＋"
        disabled={squads.length >= 50}
        onPress={() => nav.open({ kind: "create-squad" })}
      />
      <Horizontal>
        {["Your squads", "Invitations"].map((value) => (
          <Chip
            key={value}
            title={
              value === "Invitations"
                ? `Invitations · ${invites.length}`
                : value
            }
            selected={filter === value}
            onPress={() => setFilter(value)}
          />
        ))}
      </Horizontal>
      {filter === "Invitations" ? (
        <>
          {invites.map((invite) => (
            <Invitation key={invite.id} invite={invite} nav={nav} />
          ))}
          {!invites.length && (
            <Empty
              title="No invitations yet"
              body="Squad invitations from your connections appear here. You decide when to join."
            />
          )}
        </>
      ) : (
        <>
          {invites.length > 0 && (
            <Button
              secondary
              title={`${invites.length} invitation${invites.length === 1 ? "" : "s"} to review`}
              onPress={() => setFilter("Invitations")}
            />
          )}
          {squads.map((squad) => (
            <Touch
              key={squad.id}
              label={`Open squad ${squad.name}`}
              onPress={() => nav.open({ kind: "squad", id: squad.id })}
              style={s.card}
            >
              <View style={s.between}>
                <Label>PRIVATE SQUAD</Label>
                <RelativeTime date={squad.updatedAt} />
              </View>
              <Text style={s.h2}>{squad.name}</Text>
              <Text style={s.small} numberOfLines={2}>
                {squad.description || "Private group chat"}
              </Text>
              <View style={s.between}>
                <Text style={s.small}>
                  {squad.memberIds.length}/{capacity} people ·{" "}
                  {squad.ownerId === state.currentUserId
                    ? "You’re the host"
                    : "Member"}
                </Text>
                <Text style={s.h3}>↗</Text>
              </View>
            </Touch>
          ))}
          {!squads.length && (
            <Empty
              title="No squads yet"
              body="Create a squad and invite your connections. They must accept before joining the chat."
              action="Start a squad"
              onPress={() => nav.open({ kind: "create-squad" })}
            />
          )}
        </>
      )}
      <View style={s.card}>
        <Text style={s.h3}>Everyone opts in.</Text>
        <Text style={s.small}>
          Squad members see your name and initials. New members receive messages
          sent after they join. Messages already shared stay with their original
          audience.
        </Text>
      </View>
    </ScrollView>
  );
}

function Invitation({ invite, nav }: { invite: SquadInvite; nav: Nav }) {
  const { state } = useLoop();
  const [busy, setBusy] = useState(false);
  const from = state.profiles.find((profile) => profile.id === invite.fromId);
  const respond = (accept: boolean) => {
    setBusy(true);
    void nav
      .run(
        { type: "squad.respond", inviteId: invite.id, accept },
        accept ? "Welcome to the squad" : "Invitation declined",
      )
      .then((ok) => {
        if (ok && accept) nav.open({ kind: "squad", id: invite.squadId });
      })
      .finally(() => setBusy(false));
  };
  return (
    <View style={s.card}>
      <View style={s.between}>
        <Label>YOU’RE INVITED</Label>
        <Text style={s.small}>
          Until{" "}
          {new Date(invite.expiresAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </Text>
      </View>
      <Text style={s.h2}>{invite.squadName}</Text>
      <Text style={s.body}>
        {invite.description || "Private group chat for up to 12 people."}
      </Text>
      <View style={s.row}>
        <Avatar profile={from} size={32} />
        <Text style={[s.small, s.grow]}>
          {from?.name || "A connection"} invited you.
        </Text>
      </View>
      <Text style={s.small}>
        By joining, you share your name and initials with members. You will see
        messages sent after you join. You can leave anytime.
      </Text>
      <View style={s.row}>
        <View style={s.grow}>
          <Button
            title={busy ? "One moment…" : "Join squad"}
            disabled={busy}
            onPress={() => respond(true)}
          />
        </View>
        <Button
          secondary
          title="Decline"
          disabled={busy}
          onPress={() => respond(false)}
        />
      </View>
    </View>
  );
}

export function CreateSquad({ nav }: { nav: Nav }) {
  const { state } = useLoop();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const friends = state.profiles.filter(
    (profile) =>
      profile.id !== state.currentUserId &&
      connected(state, profile.id) &&
      !state.preferences.blockedIds.includes(profile.id),
  );
  const visible = friends.filter((profile) =>
    `${profile.name} ${profile.headline}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const joined = (state.squads ?? []).filter(
    (squad) => !squad.archived && squad.memberIds.includes(state.currentUserId),
  );
  const limitReached =
    joined.length >= 50 ||
    joined.filter((squad) => squad.ownerId === state.currentUserId).length >=
      20;
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.content}
    >
      <Text style={s.overline}>PRIVATE GROUP CHAT</Text>
      <Text style={s.title}>Create squad</Text>
      <Text style={s.body}>
        Name your group and invite up to 11 connections. You can invite more
        people later if there’s space.
      </Text>
      <Field
        label="Squad name"
        value={name}
        onChangeText={setName}
        maxLength={60}
        placeholder="The dinner crew"
        disabled={busy}
      />
      <Field
        label="What brings you together?"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={500}
        placeholder="What is this group for?"
        disabled={busy}
      />
      <Section
        title="Invite your connections"
        subtitle={`${selected.length} invited · ${1 + selected.length}/${capacity} places reserved`}
      />
      {selected.length > 0 && (
        <Button
          small
          secondary
          title="Clear invitation choices"
          disabled={busy}
          onPress={() => setSelected([])}
        />
      )}
      <Text style={s.small}>
        Invitations reserve a place for seven days. Your connections choose
        whether to join; they are not added automatically.
      </Text>
      <Field
        value={search}
        onChangeText={setSearch}
        placeholder="Find a connection…"
        disabled={busy}
      />
      {visible.map((profile) => (
        <Touch
          key={profile.id}
          label={`Invite ${profile.name}`}
          selected={selected.includes(profile.id)}
          disabled={
            busy ||
            (!selected.includes(profile.id) && selected.length >= capacity - 1)
          }
          onPress={() =>
            setSelected((current) =>
              current.includes(profile.id)
                ? current.filter((id) => id !== profile.id)
                : [...current, profile.id],
            )
          }
          style={[s.between, { paddingVertical: 12 }]}
        >
          <View style={[s.row, s.grow]}>
            <Avatar profile={profile} size={38} />
            <View style={s.grow}>
              <Text style={s.h3}>{profile.name}</Text>
              <Text style={s.small}>{profile.headline}</Text>
            </View>
          </View>
          <Text style={s.h3}>{selected.includes(profile.id) ? "●" : "○"}</Text>
        </Touch>
      ))}
      {!friends.length && (
        <Empty
          title="Invite a connection"
          body="Accept a connection request or meet someone in People, then invite them here. You can also start a squad just for yourself and invite people later."
        />
      )}
      <Text style={s.small}>
        Squads are private. Members consent to sharing their name and initials.
        Future members cannot read earlier messages.
      </Text>
      {limitReached && (
        <Text style={s.small}>
          You can join 50 squads and host 20. Leave a squad before starting
          another.
        </Text>
      )}
      <Button
        title={busy ? "Creating your squad…" : "Create squad"}
        disabled={busy || !name.trim() || limitReached}
        onPress={() => {
          setBusy(true);
          void nav
            .run(
              {
                type: "squad.create",
                name: name.trim(),
                description: description.trim(),
                inviteeIds: selected,
              },
              "Squad created",
            )
            .then((ok) => {
              if (ok) {
                nav.closeIfTop("create-squad");
                nav.open({ kind: "squads" });
              }
            })
            .finally(() => setBusy(false));
        }}
      />
    </ScrollView>
  );
}

export function SquadDetail({ id, nav }: { id: string; nav: Nav }) {
  const appActive = useAppActive();
  const { state, watchSquad, loadOlderSquadMessages, squadHistory } = useLoop();
  const attachment = useImageAttachment(nav);
  const squad = (state.squads ?? []).find(
    (value) =>
      value.id === id &&
      value.memberIds.includes(state.currentUserId) &&
      !value.archived,
  );
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [actions, setActions] = useState<string | null>(null);
  const [reacting, setReacting] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const stickToBottom = useRef(true);
  const loadingOlder = useRef(false);
  const firstLayout = useRef(true);
  const reducedMotion = useReducedMotion();
  const messages = state.squadMessages
    .filter(
      (message) =>
        message.squadId === id &&
        message.audienceIds.includes(state.currentUserId) &&
        !state.preferences.blockedIds.includes(message.authorId),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  useEffect(() => {
    stickToBottom.current = true;
    firstLayout.current = true;
    loadingOlder.current = false;
    setShowJump(false);
    watchSquad(id);
    return () => watchSquad(null);
  }, [id, watchSquad]);
  useEffect(() => {
    if (
      appActive &&
      isAppActive() &&
      !showJump &&
      !squadHistory.loading &&
      messages.length &&
      squad
    )
      void nav.run({ type: "squad.read", squadId: id });
  }, [
    id,
    messages.at(-1)?.id,
    !!squad,
    appActive,
    showJump,
    squadHistory.loading,
  ]);
  if (!squad)
    return (
      <Empty
        title="Squad unavailable"
        body="Accept an invitation to join, or return to your squads. If you just joined, your squad will appear as it syncs."
        action="Your squads"
        onPress={() => nav.open({ kind: "squads" })}
      />
    );
  const muted = state.preferences.squadMutedIds?.includes(id) || false;
  const quoted = reply
    ? messages.find((message) => message.id === reply)
    : undefined;
  return (
    <KeyboardAvoidingView
      style={s.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={60}
    >
      <View
        style={{
          padding: 20,
          gap: 12,
          borderBottomWidth: 1,
          borderColor: color.line,
        }}
      >
        <View style={s.between}>
          <View style={s.grow}>
            <Text style={s.h2}>{squad.name}</Text>
            <Text style={s.small}>
              PRIVATE SQUAD · {squad.memberIds.length}/{capacity} people
            </Text>
          </View>
          <Button
            small
            secondary
            title="Members"
            onPress={() => nav.open({ kind: "squad-members", id })}
          />
        </View>
        <Text style={s.small}>
          Shared only with the members present when each message is sent.
        </Text>
        <View style={{ alignSelf: "flex-start" }}>
          <Button
            small
            secondary
            title={muted ? "Message alerts muted" : "Message alerts on"}
            onPress={() =>
              void nav.run(
                { type: "squad.mute", squadId: id, muted: !muted },
                muted
                  ? "Squad message alerts on"
                  : "Squad message alerts muted",
              )
            }
          />
        </View>
      </View>
      <ScrollView
        ref={scroll}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={64}
        contentContainerStyle={{ padding: 20, gap: 23, paddingBottom: 35 }}
        onScroll={(event) => {
          if (loadingOlder.current) return;
          const { layoutMeasurement, contentOffset, contentSize } =
            event.nativeEvent;
          stickToBottom.current =
            contentOffset.y + layoutMeasurement.height >=
            contentSize.height - 80;
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
        <View style={{ alignItems: "center", gap: 7, padding: 16 }}>
          <Text style={{ fontSize: 35, color: color.ink }}>◎</Text>
          <Text style={s.h3}>Private group chat</Text>
          <Text style={[s.small, { textAlign: "center" }]}>
            {squad.description || "Only squad members can read this chat."}
          </Text>
        </View>
        {squadHistory.hasMore && (
          <Button
            small
            secondary
            disabled={squadHistory.loading}
            title={
              squadHistory.loading ? "Loading…" : "Earlier in your squad ↑"
            }
            onPress={() => {
              loadingOlder.current = true;
              stickToBottom.current = false;
              setShowJump(true);
              void loadOlderSquadMessages()
                .catch(() => nav.toast("Could not load earlier messages."))
                .finally(() =>
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      loadingOlder.current = false;
                    });
                  }),
                );
            }}
          />
        )}
        {!messages.length && (
          <Empty
            title="No messages yet"
            body="Start the conversation. You only receive messages sent while you are part of the squad's audience."
          />
        )}
        {messages.map((message) => {
          const mine = message.authorId === state.currentUserId;
          const quote = message.replyTo
            ? messages.find((value) => value.id === message.replyTo)
            : undefined;
          return (
            <View
              key={message.id}
              style={[s.row, { alignItems: "flex-start", gap: 10 }]}
            >
              <Initials
                name={message.authorName}
                initials={message.authorInitials}
                size={33}
              />
              <View style={[s.grow, { gap: 7 }]}>
                <View style={s.between}>
                  <Text style={[s.h3, { fontSize: 13, flex: 1 }]}>
                    {mine ? "You" : message.authorName}
                  </Text>
                  <RelativeTime date={message.editedAt || message.createdAt} />
                  <Touch
                    label="Squad message actions"
                    onPress={() =>
                      setActions(actions === message.id ? null : message.id)
                    }
                    style={{ padding: 6 }}
                  >
                    <Text style={s.small}>•••</Text>
                  </Touch>
                </View>
                {message.editedAt && (
                  <Text style={[s.small, { fontSize: 10 }]}>edited</Text>
                )}
                {quote && (
                  <View
                    style={{
                      borderLeftWidth: 2,
                      borderColor: color.line,
                      paddingLeft: 10,
                    }}
                  >
                    <Text style={s.small} numberOfLines={2}>
                      ↳ {quote.body}
                    </Text>
                  </View>
                )}
                <LinkifiedText text={message.body} />
                <MediaImage
                  image={message.image}
                  caption={message.body}
                  nav={nav}
                />
                <View style={[s.wrap, { gap: 6 }]}>
                  {Object.entries(message.reactions)
                    .filter(([, ids]) => ids.length)
                    .map(([emoji, ids]) => (
                      <Chip
                        key={emoji}
                        title={`${emoji} ${ids.length}`}
                        selected={ids.includes(state.currentUserId)}
                        onPress={() =>
                          void nav.run({
                            type: "squad.message.react",
                            messageId: message.id,
                            emoji,
                          })
                        }
                      />
                    ))}
                  <Touch
                    label="Add squad reaction"
                    onPress={() =>
                      setReacting(reacting === message.id ? null : message.id)
                    }
                    style={{ padding: 5 }}
                  >
                    <Text style={s.small}>＋</Text>
                  </Touch>
                </View>
                {reacting === message.id && (
                  <View style={s.wrap}>
                    {["🖤", "🔥", "🙌", "💯", "😂"].map((emoji) => (
                      <Chip
                        key={emoji}
                        title={emoji}
                        onPress={() => {
                          setReacting(null);
                          void nav.run({
                            type: "squad.message.react",
                            messageId: message.id,
                            emoji,
                          });
                        }}
                      />
                    ))}
                  </View>
                )}
                {actions === message.id && (
                  <View style={s.wrap}>
                    <Button
                      small
                      secondary
                      title="Reply"
                      onPress={() => {
                        setReply(message.id);
                        setEditing(null);
                        setActions(null);
                      }}
                    />
                    {mine ? (
                      <>
                        <Button
                          small
                          secondary
                          title="Edit"
                          onPress={() => {
                            attachment.clear();
                            setEditing(message.id);
                            setBody(message.body);
                            setReply(null);
                            setActions(null);
                          }}
                        />
                        <Button
                          small
                          secondary
                          title="Delete"
                          onPress={() =>
                            Alert.alert(
                              "Delete your message?",
                              "This message will be removed from the squad.",
                              [
                                { text: "Keep it", style: "cancel" },
                                {
                                  text: "Delete message",
                                  style: "destructive",
                                  onPress: () =>
                                    void nav.run(
                                      {
                                        type: "squad.message.delete",
                                        messageId: message.id,
                                      },
                                      "Message deleted",
                                    ),
                                },
                              ],
                              { cancelable: true },
                            )
                          }
                        />
                      </>
                    ) : (
                      <Button
                        small
                        secondary
                        title="Report"
                        onPress={() =>
                          Alert.alert(
                            "Report this squad message?",
                            "The selected message and any attached image will be shared with moderators. The rest of the squad conversation stays private.",
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Send report",
                                onPress: () =>
                                  void nav.run(
                                    {
                                      type: "report.create",
                                      targetType: "squadMessage",
                                      targetId: message.id,
                                      reason:
                                        "Safety concern in this squad message",
                                    },
                                    "Squad message reported",
                                  ),
                              },
                            ],
                            { cancelable: true },
                          )
                        }
                      />
                    )}
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
      {showJump && (
        <View style={{ alignItems: "center", padding: 7 }}>
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
          padding: 15,
          paddingBottom: Platform.OS === "ios" ? 28 : 15,
          borderTopWidth: 1,
          borderColor: color.line,
          gap: 9,
        }}
      >
        {(editing || quoted) && (
          <View style={s.between}>
            <Text style={[s.small, s.grow]} numberOfLines={1}>
              {editing ? "Editing your message" : `Replying: ${quoted?.body}`}
            </Text>
            <Button
              small
              secondary
              title="Cancel"
              onPress={() => {
                setEditing(null);
                setReply(null);
                setBody("");
              }}
            />
          </View>
        )}
        {!editing && (
          <ImageAttachmentPicker attachment={attachment} disabled={busy} />
        )}
        <View style={s.row}>
          <View style={s.grow}>
            <Field
              value={body}
              onChangeText={setBody}
              disabled={busy}
              multiline
              compact
              maxLength={4000}
              placeholder="Message this squad…"
            />
          </View>
          <Button
            title={busy ? "…" : editing ? "Save" : "Send"}
            disabled={busy || attachment.busy || !body.trim()}
            onPress={() => {
              loadingOlder.current = false;
              stickToBottom.current = true;
              setShowJump(false);
              setBusy(true);
              void (
                editing
                  ? Promise.resolve(null)
                  : attachment.resolve({ kind: "squad", id })
              )
                .then((image) =>
                  nav.run(
                    editing
                      ? { type: "squad.message.edit", messageId: editing, body }
                      : {
                          type: "squad.message.send",
                          squadId: id,
                          body,
                          ...(reply ? { replyTo: reply } : {}),
                          ...(image ? { imageId: image.id } : {}),
                        },
                  ),
                )
                .then((ok) => {
                  if (ok) {
                    setBody("");
                    setReply(null);
                    setEditing(null);
                    attachment.clear();
                  }
                })
                .catch((error) =>
                  nav.toast(
                    error instanceof Error
                      ? error.message
                      : "Could not send this image.",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

export function SquadMembers({ id, nav }: { id: string; nav: Nav }) {
  const { state, watchSquad } = useLoop();
  useEffect(() => {
    watchSquad(id);
    return () => watchSquad(null);
  }, [id, watchSquad]);
  const squad = (state.squads ?? []).find(
    (value) =>
      value.id === id &&
      value.memberIds.includes(state.currentUserId) &&
      !value.archived,
  );
  const [name, setName] = useState(squad?.name || "");
  const [description, setDescription] = useState(squad?.description || "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inviting, setInviting] = useState(false);
  if (!squad)
    return (
      <Empty
        title="Squad unavailable"
        body="You no longer have access to this squad."
        action="Back to your squads"
        onPress={() => {
          nav.close();
          nav.open({ kind: "squads" });
        }}
      />
    );
  const mine = squad.ownerId === state.currentUserId;
  const friends = state.profiles.filter(
    (profile) =>
      connected(state, profile.id) &&
      !state.preferences.blockedIds.includes(profile.id) &&
      !squad.memberIds.includes(profile.id) &&
      !squad.pendingInviteeIds.includes(profile.id),
  );
  const seats = squad.memberIds.length + squad.pendingInviteeIds.length;
  const pending = (state.squadInvites ?? []).filter(
    (invite) => invite.squadId === id && activeInvite(invite),
  );
  const manageMember = (userId: string) => {
    const name = squad.memberProfiles[userId]?.name || "this member";
    Alert.alert(
      name,
      "Choose a member action.",
      [
        {
          text: "Make squad host",
          onPress: () =>
            Alert.alert(
              "Transfer your squad?",
              `${name} will become the host and manage squad details and membership. You will stay as a member.`,
              [
                { text: "Keep hosting", style: "cancel" },
                {
                  text: "Transfer ownership",
                  onPress: () => {
                    setBusy(true);
                    void nav
                      .run(
                        { type: "squad.transfer", squadId: id, userId },
                        "Squad host updated",
                      )
                      .finally(() => setBusy(false));
                  },
                },
              ],
              { cancelable: true },
            ),
        },
        {
          text: "Remove member",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              "Remove this member?",
              "They will no longer receive new squad messages. Messages already shared keep their original audience.",
              [
                { text: "Keep member", style: "cancel" },
                {
                  text: "Remove member",
                  style: "destructive",
                  onPress: () => {
                    setBusy(true);
                    void nav
                      .run(
                        { type: "squad.remove", squadId: id, userId },
                        "Member removed",
                      )
                      .finally(() => setBusy(false));
                  },
                },
              ],
              { cancelable: true },
            ),
        },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true },
    );
  };
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.overline}>SQUAD MEMBERS</Text>
      <Text style={s.title}>{squad.name}</Text>
      <Text style={s.body}>
        {squad.description || "Private group chat for up to 12 people."}
      </Text>
      <Label>
        {squad.memberIds.length}/{capacity} MEMBERS ·{" "}
        {squad.pendingInviteeIds.length} INVITED
      </Label>
      {mine && (
        <>
          <Button
            secondary
            title={editing ? "Cancel changes" : "Edit squad details"}
            onPress={() => {
              setEditing(!editing);
              setName(squad.name);
              setDescription(squad.description);
            }}
          />
          {editing && (
            <>
              <Field
                label="Squad name"
                value={name}
                onChangeText={setName}
                maxLength={60}
                disabled={busy}
              />
              <Field
                label="Description"
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={500}
                disabled={busy}
              />
              <Button
                title={busy ? "Saving…" : "Save squad details"}
                disabled={busy || !name.trim()}
                onPress={() => {
                  setBusy(true);
                  void nav
                    .run(
                      {
                        type: "squad.update",
                        squadId: id,
                        squad: {
                          name: name.trim(),
                          description: description.trim(),
                        },
                      },
                      "Squad updated",
                    )
                    .then((ok) => {
                      if (ok) setEditing(false);
                    })
                    .finally(() => setBusy(false));
                }}
              />
            </>
          )}
        </>
      )}
      <Section
        title="Members"
        subtitle="Names and initials are visible to squad members"
      />
      {squad.memberIds.map((userId) => {
        const member = squad.memberProfiles[userId];
        return (
          <View key={userId} style={s.between}>
            <View style={[s.row, s.grow]}>
              <Initials
                name={member?.name || "Squad member"}
                initials={member?.initials || "?"}
              />
              <View style={s.grow}>
                <Text style={s.h3}>
                  {userId === state.currentUserId
                    ? "You"
                    : member?.name || "Squad member"}
                </Text>
                <Text style={s.small}>
                  {userId === squad.ownerId ? "Squad host" : "Member"}
                </Text>
                {userId !== state.currentUserId && (
                  <Touch
                    label={`${state.preferences.blockedIds.includes(userId) ? "Unblock" : "Block"} ${member?.name || "squad member"}`}
                    disabled={busy}
                    style={{ paddingVertical: 6 }}
                    onPress={() => {
                      const blocked =
                        state.preferences.blockedIds.includes(userId);
                      Alert.alert(
                        blocked ? "Unblock this member?" : "Block this member?",
                        blocked
                          ? "Their new content can appear again, subject to your message privacy settings."
                          : "Their content will be hidden, and they will not receive your new squad messages. Your squad membership stays the same.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: blocked ? "Unblock" : "Block member",
                            style: blocked ? "default" : "destructive",
                            onPress: () => {
                              setBusy(true);
                              void nav
                                .run(
                                  { type: "profile.block", userId },
                                  blocked
                                    ? "Member unblocked"
                                    : "Member blocked",
                                )
                                .finally(() => setBusy(false));
                            },
                          },
                        ],
                        { cancelable: true },
                      );
                    }}
                  >
                    <Text style={[s.small, { fontSize: 10 }]}>
                      {state.preferences.blockedIds.includes(userId)
                        ? "Unblock member"
                        : "Block member"}
                    </Text>
                  </Touch>
                )}
              </View>
            </View>
            {mine && userId !== state.currentUserId && (
              <Button
                small
                secondary
                disabled={busy}
                title="Manage"
                onPress={() => manageMember(userId)}
              />
            )}
          </View>
        );
      })}
      <Button
        title={inviting ? "Hide invitations" : "Invite a connection ＋"}
        secondary
        disabled={busy}
        onPress={() => setInviting(!inviting)}
      />
      {seats >= capacity && (
        <Text style={s.small}>
          All 12 places appear reserved. Expired invitations are released
          automatically; sending an invitation checks availability again.
        </Text>
      )}
      {inviting && (
        <>
          <Text style={s.small}>
            Invite your accepted connections. They have seven days to choose
            whether to join.
          </Text>
          {friends.map((profile) => (
            <View key={profile.id} style={s.between}>
              <Text style={[s.h3, s.grow]}>{profile.name}</Text>
              <Button
                small
                disabled={busy}
                title="Invite"
                onPress={() => {
                  setBusy(true);
                  void nav
                    .run(
                      { type: "squad.invite", squadId: id, userId: profile.id },
                      "Invitation sent",
                    )
                    .finally(() => setBusy(false));
                }}
              />
            </View>
          ))}
          {!friends.length && (
            <Text style={s.small}>
              Your available connections are already here or invited. Meet
              someone new in People.
            </Text>
          )}
        </>
      )}
      {pending.length > 0 && (
        <>
          <Section title="Invitations" subtitle="They choose when to join" />
          {pending.map((invite) => (
            <View key={invite.id} style={s.between}>
              <Text style={[s.small, s.grow]}>
                {state.profiles.find((profile) => profile.id === invite.toId)
                  ?.name || "Invited connection"}
              </Text>
              <Label>PENDING</Label>
              {(mine || invite.fromId === state.currentUserId) && (
                <Button
                  small
                  secondary
                  title="Revoke"
                  disabled={busy}
                  onPress={() =>
                    Alert.alert(
                      "Revoke this invitation?",
                      "This invitation will no longer be available to accept.",
                      [
                        { text: "Keep invitation", style: "cancel" },
                        {
                          text: "Revoke",
                          style: "destructive",
                          onPress: () => {
                            setBusy(true);
                            void nav
                              .run(
                                { type: "squad.revoke", inviteId: invite.id },
                                "Invitation revoked",
                              )
                              .finally(() => setBusy(false));
                          },
                        },
                      ],
                      { cancelable: true },
                    )
                  }
                />
              )}
            </View>
          ))}
        </>
      )}
      <View style={s.card}>
        <Text style={s.h3}>Who can see messages</Text>
        <Text style={s.small}>
          New members receive messages sent after they join. Removing a member
          or leaving stops future messages; messages already shared may remain
          with their original audience. Blocked members do not receive your new
          squad messages.
        </Text>
        <Text style={s.small}>
          You can report an individual message to moderators without opening the
          rest of the squad conversation.
        </Text>
      </View>
      <Button
        secondary
        title="Leave this squad"
        disabled={busy}
        onPress={() =>
          Alert.alert(
            "Leave your squad?",
            mine
              ? squad.memberIds.length > 1
                ? "Ownership will pass to the longest-standing remaining member. You stop receiving new messages."
                : "You are the last member, so this squad will be archived. You stop receiving new messages."
              : "You stop receiving new messages. Messages already shared keep their original audience.",
            [
              { text: "Stay", style: "cancel" },
              {
                text: "Leave squad",
                style: "destructive",
                onPress: () => {
                  setBusy(true);
                  void nav
                    .run(
                      { type: "squad.leave", squadId: id },
                      "You left the squad",
                    )
                    .then((ok) => {
                      if (ok) {
                        nav.closeIfTop("squad-members");
                        nav.open({ kind: "squads" });
                      }
                    })
                    .finally(() => setBusy(false));
                },
              },
            ],
            { cancelable: true },
          )
        }
      />
    </ScrollView>
  );
}
