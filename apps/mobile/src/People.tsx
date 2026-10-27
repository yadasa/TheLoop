import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Share,
  Text,
  View,
  type ScrollViewInstance,
} from "react-native";
import { directParticipantSnapshot, useLoop } from "@theloop/client";
import {
  connected,
  suggestedConnections,
  trustLabel,
  safeURL,
  type Profile,
  type DirectMessage,
} from "@theloop/core";
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
  RelativeTime,
  s,
  Section,
  Touch,
  useReducedMotion,
  useAppActive,
  isAppActive,
} from "./ui";
import type { Nav } from "./navigation";
import { useNavigationBusy } from "./useNavigationBusy";
import { useConversationDraft } from "./DraftProvider";
import { shareTargetURL } from "./sharedLinks";
import { ImageAttachmentPicker, MediaImage, useImageAttachment } from "./Media";

export function People({ nav }: { nav: Nav }) {
  const { state, directory, setDirectoryQuery, loadMoreDirectory } = useLoop();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("For you");
  useEffect(() => {
    const timeout = setTimeout(() => setDirectoryQuery(search), 250);
    return () => clearTimeout(timeout);
  }, [search, setDirectoryQuery]);
  useEffect(() => () => setDirectoryQuery(""), [setDirectoryQuery]);
  const requests = state.connections.filter(
    (c) =>
      c.toId === state.currentUserId &&
      c.status === "pending" &&
      !state.preferences.blockedIds.includes(c.fromId),
  );
  let people =
    filter === "Connections"
      ? state.profiles.filter((p) => connected(state, p.id))
      : filter === "Followers"
        ? state.profiles.filter((p) =>
            state.follows.some(
              (f) =>
                f.followingId === state.currentUserId && f.followerId === p.id,
            ),
          )
        : filter === "Following"
          ? state.profiles.filter((p) =>
              state.preferences.followingIds.includes(p.id),
            )
          : search.trim()
            ? directory.results
            : suggestedConnections({ ...state, profiles: directory.results });
  people = people.filter(
    (p) =>
      p.id !== state.currentUserId &&
      !state.preferences.blockedIds.includes(p.id) &&
      `${p.name} ${p.headline} ${p.company} ${p.location} ${p.skills.join(" ")}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <ScrollView contentContainerStyle={s.content}>
      <View>
        <Text style={s.overline}>COMMUNITY DIRECTORY</Text>
        <Text style={[s.title, { marginTop: 5 }]}>
          People
        </Text>
      </View>
      <Field
        value={search}
        onChangeText={setSearch}
        placeholder="Search by name, role, or skill"
      />
      {requests.length > 0 && (
        <>
          <Section
            title="Connection requests"
            subtitle={`${requests.length} ${requests.length === 1 ? "person wants" : "people want"} to connect`}
          />
          {requests.map((c) => {
            const p = state.profiles.find((p) => p.id === c.fromId);
            return (
              <View key={c.id} style={s.card}>
                <View style={s.row}>
                  <Avatar profile={p} />
                  <View style={s.grow}>
                    <Text style={s.h3}>{p?.name || "Loop member"}</Text>
                    <Text style={s.small}>{p?.headline}</Text>
                  </View>
                </View>
                <View style={s.row}>
                  <Button
                    title="Accept"
                    onPress={() =>
                      void nav.run(
                        {
                          type: "connection.respond",
                          connectionId: c.id,
                          accept: true,
                        },
                        "Connection accepted",
                      )
                    }
                  />
                  <Button
                    secondary
                    title="Not now"
                    onPress={() =>
                      void nav.run({
                        type: "connection.respond",
                        connectionId: c.id,
                        accept: false,
                      })
                    }
                  />
                </View>
              </View>
            );
          })}
        </>
      )}
      <Horizontal>
        {["For you", "Connections", "Following", "Followers"].map((f) => (
          <Chip
            key={f}
            title={f}
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </Horizontal>
      {filter === "For you" && people.length > 0 && (
        <View
          style={[
            s.card,
            { backgroundColor: color.hero, borderColor: color.heroLine },
          ]}
        >
          <Text style={[s.overline, { color: color.heroMuted }]}>
            MEET SOMEONE NEW
          </Text>
          <Text style={[s.h2, { color: color.onHero }]}>
            Start with a profile.
          </Text>
          <Text style={[s.small, { color: color.heroMuted }]}>
            See what someone is working on before you reach out.
          </Text>
          <Button
            title="Meet someone new"
            secondary
            onPress={() =>
              nav.open({
                kind: "profile",
                id: people[Math.floor(Math.random() * people.length)].id,
              })
            }
          />
        </View>
      )}
      <Section
        title={filter === "For you" ? "Suggested connections" : filter}
        subtitle={
          filter === "For you"
            ? "Suggestions based on your shared interests"
            : `${people.length} ${people.length === 1 ? "person" : "people"}`
        }
      />
      {people.map((p) => (
        <PersonCard key={p.id} profile={p} nav={nav} />
      ))}
      {filter === "For you" && directory.loading && (
        <Text style={s.small}>Loading people…</Text>
      )}
      {filter === "For you" && directory.hasMore && (
        <Button
          secondary
          title={directory.loading ? "Loading people…" : "Load more people"}
          disabled={directory.loading}
          onPress={loadMoreDirectory}
        />
      )}
      {people.length === 0 && !(filter === "For you" && directory.loading) && (
        <Empty
          title={search ? "No matching people" : filter === "For you" ? "No suggested connections yet" : `No ${filter.toLowerCase()} yet`}
          body={
            search
              ? "Try another name, role, or skill."
              : "Browse suggested connections to find people to connect with or follow."
          }
        />
      )}
    </ScrollView>
  );
}

export function PersonCard({
  profile: p,
  nav,
}: {
  profile: Profile;
  nav: Nav;
}) {
  const { state } = useLoop();
  const connection = state.connections.find(
    (c) =>
      [c.fromId, c.toId].includes(state.currentUserId) &&
      [c.fromId, c.toId].includes(p.id),
  );
  const shared = p.interests.filter((i) =>
    state.preferences.interests.includes(i),
  );
  return (
    <View style={s.card}>
      <Touch
        label={`View ${p.name}`}
        onPress={() => nav.open({ kind: "profile", id: p.id })}
        style={[s.row, { alignItems: "flex-start" }]}
      >
        <Avatar profile={p} size={53} />
        <View style={[s.grow, { gap: 4 }]}>
          <Text style={s.h3}>
            {p.name}
            {p.verified ? " ✓" : ""}
          </Text>
          <Text style={s.small}>{p.headline}</Text>
          <Text style={s.small}>{p.location}</Text>
        </View>
        <Text style={{ fontSize: 12, fontWeight: "700", color: color.ink }}>
          {p.trust.score}
        </Text>
      </Touch>
      {shared.length > 0 && (
        <Text style={s.small}>
          Shared interests: {shared.slice(0, 2).join(" + ")}
        </Text>
      )}
      <View style={s.wrap}>
        {p.skills.slice(0, 3).map((skill) => (
          <Label key={skill}>{skill}</Label>
        ))}
      </View>
      <View style={s.between}>
        <Button
          small
          title={
            connection?.status === "accepted"
              ? "Message"
              : connection
                ? "Request pending"
                : "Connect ＋"
          }
          secondary={!!connection}
          disabled={connection?.status === "pending"}
          onPress={() =>
            connection?.status === "accepted"
              ? nav.open({ kind: "dm", id: p.id })
              : void nav.run(
                  { type: "connection.request", userId: p.id },
                  "Connection request sent",
                )
          }
        />
        <Touch
          label={
            state.preferences.followingIds.includes(p.id)
              ? `Unfollow ${p.name}`
              : `Follow ${p.name}`
          }
          onPress={() => void nav.run({ type: "profile.follow", userId: p.id })}
          style={{ padding: 10 }}
        >
          <Text style={[s.small, { fontWeight: "600", color: color.ink }]}>
            {state.preferences.followingIds.includes(p.id)
              ? "Following ✓"
              : "Follow"}
          </Text>
        </Touch>
      </View>
    </View>
  );
}

export function ProfileDetail({ id, nav }: { id: string; nav: Nav }) {
  const { state, loadProfile } = useLoop();
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    void loadProfile(id)
      .catch(() => nav.toast("Could not load this profile. Please try again."))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [id, loadProfile]);
  const p = state.profiles.find((p) => p.id === id);
  if (!p)
    return (
      <Empty
        title={loading ? "Loading profile…" : "Profile unavailable"}
        body={
          loading
            ? "Checking whether this profile is available to you."
            : "This member may have limited their profile visibility."
        }
      />
    );
  const mine = id === state.currentUserId;
  const connection = state.connections.find(
    (c) =>
      [c.fromId, c.toId].includes(id) &&
      [c.fromId, c.toId].includes(state.currentUserId),
  );
  const blocked = state.preferences.blockedIds.includes(id);
  const incoming =
    connection?.status === "pending" && connection.toId === state.currentUserId;
  const canSee = mine || p.visibility === "public" || connected(state, id);
  return (
    <ScrollView contentContainerStyle={s.content}>
      <View
        style={{
          padding: 25,
          paddingTop: 30,
          borderRadius: 25,
          backgroundColor: color.hero,
          gap: 17,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            position: "absolute",
            right: -30,
            top: -25,
            width: 210,
            height: 210,
            borderRadius: 110,
            borderWidth: 1,
            borderColor: color.heroLine,
            transform: [{ scaleX: 0.7 }, { rotate: "-30deg" }],
          }}
        />
        <Avatar profile={p} size={77} inverse />
        <Text
          style={[
            s.title,
            { color: color.onHero, fontSize: 30, lineHeight: 36 },
          ]}
        >
          {p.name}
          {p.verified ? " ✓" : ""}
        </Text>
        <Text style={{ fontSize: 15, lineHeight: 23, color: color.heroMuted }}>
          {p.headline}
        </Text>
        <Text style={[s.small, { color: color.heroMuted }]}>
          {[p.location, `@${p.handle}`].filter(Boolean).join(" · ")}
        </Text>
        <Text style={[s.small, { color: color.heroMuted }]}>
          {p.followerCount || 0} followers · {p.followingCount || 0} following
        </Text>
        {p.foundingYear && <Label>FOUNDING CIRCLE · {p.foundingYear}</Label>}
      </View>
      {mine ? (
        <Button
          title="Edit your profile"
          onPress={() => nav.open({ kind: "edit-profile" })}
        />
      ) : (
        <View style={s.row}>
          <View style={s.grow}>
            <Button
              title={
                blocked
                  ? "Unblock member"
                  : incoming
                    ? "Accept request"
                    : connection?.status === "accepted"
                      ? "Message"
                      : connection
                        ? "Request pending"
                        : "Connect ＋"
              }
              disabled={
                !blocked && !incoming && connection?.status === "pending"
              }
              onPress={() =>
                blocked
                  ? void nav.run({ type: "profile.block", userId: id })
                  : incoming && connection
                    ? void nav.run(
                        {
                          type: "connection.respond",
                          connectionId: connection.id,
                          accept: true,
                        },
                        "Connection accepted",
                      )
                    : connection?.status === "accepted"
                      ? nav.open({ kind: "dm", id })
                      : void nav.run(
                          { type: "connection.request", userId: id },
                          "Connection request sent",
                        )
              }
            />
          </View>
          <Button
            secondary
            title={
              state.preferences.followingIds.includes(id)
                ? "Following ✓"
                : "Follow"
            }
            disabled={blocked}
            onPress={() => void nav.run({ type: "profile.follow", userId: id })}
          />
        </View>
      )}
      {canSee ? (
        <>
          <Section title="About" />
          <Text style={s.body}>
            {p.bio || "No bio added yet."}
          </Text>
          {p.company && (
            <View style={s.card}>
              <Text style={s.overline}>COMPANY</Text>
              <Text style={s.h3}>{p.company}</Text>
            </View>
          )}
          <Section title="Skills" />
          <View style={s.wrap}>
            {p.skills.map((skill) => (
              <Label key={skill}>{skill}</Label>
            ))}
          </View>
          <Section title="Open to" />
          <View style={s.wrap}>
            {p.openTo.map((v) => (
              <Label key={v}>{v}</Label>
            ))}
          </View>
          {p.links.length > 0 && (
            <>
              <Section title="Links" />
              {p.links.map((link) => (
                <Touch
                  key={link.url}
                  label={`Open ${link.label}`}
                  onPress={() => {
                    if (safeURL(link.url))
                      void Linking.openURL(link.url).catch(() =>
                        nav.toast("Could not open link."),
                      );
                  }}
                  style={[
                    s.between,
                    {
                      paddingVertical: 13,
                      borderBottomWidth: 1,
                      borderColor: color.line,
                    },
                  ]}
                >
                  <Text style={s.h3}>{link.label}</Text>
                  <Text style={{ color: color.ink }}>↗</Text>
                </Touch>
              ))}
            </>
          )}
        </>
      ) : (
        <Empty
          title="Profile limited to connections"
          body="Connect with this member to see their full professional profile."
        />
      )}
      <View style={[s.card, { backgroundColor: color.soft }]}>
        <View style={s.between}>
          <View>
            <Text style={s.overline}>COMMUNITY TRUST</Text>
            <Text style={[s.h2, { marginTop: 5 }]}>
              {trustLabel(p.trust.score)}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 36,
              fontWeight: "500",
              letterSpacing: -1,
              color: color.ink,
            }}
          >
            {p.trust.score}
            <Text style={{ fontSize: 13, color: color.muted }}>/100</Text>
          </Text>
        </View>
        {p.trust.reasons.map((reason) => (
          <Text key={reason} style={s.small}>
            ✓ {reason}
          </Text>
        ))}
        <Text style={s.small}>
          Based on verifiable community activity. Identity verification and
          reputation are separate signals.
        </Text>
        {mine && (
          <Button
            secondary
            title="Understand your trust score"
            onPress={() => nav.open({ kind: "trust" })}
          />
        )}
      </View>
      {!mine && (
        <>
          <Button
            secondary
            title="Share profile"
            onPress={() =>
              void Share.share({
                message: `Meet ${p.name} on TheLoop\n${shareTargetURL({ kind: "profile", id })}`,
              })
            }
          />
          <Touch
            label="Member safety actions"
            onPress={() =>
              nav.alert(p.name, "Block this member or report their profile.", [
                {
                  text: blocked ? "Unblock member" : "Block member",
                  style: "destructive",
                  onPress: () =>
                    void nav.run(
                      { type: "profile.block", userId: id },
                      blocked
                        ? "Member unblocked"
                        : "Member blocked. Their content is hidden.",
                    ),
                },
                {
                  text: "Report profile",
                  onPress: () =>
                    void nav.run(
                      {
                        type: "report.create",
                        targetId: id,
                        targetType: "profile",
                        reason: "Profile safety or authenticity concern",
                      },
                      "Report sent to moderators",
                    ),
                },
                { text: "Cancel", style: "cancel" },
              ])
            }
            style={{ padding: 14, alignItems: "center" }}
          >
            <Text style={s.small}>Block or report this member</Text>
          </Touch>
        </>
      )}
    </ScrollView>
  );
}

export function DirectChat({ id, nav }: { id: string; nav: Nav }) {
  const appActive = useAppActive();
  const {
    state,
    watchDirectConversation,
    loadOlderDirectMessages,
    directHistory,
    directCatalog,
  } = useLoop();
  const attachment = useImageAttachment(nav);
  const draft = useConversationDraft({ kind: "dm", id });
  const [body, setBody] = useState(draft.initial?.body || "");
  const [busy, setBusy] = useState(false);
  useNavigationBusy(nav, `dm:${id}`, busy || attachment.busy);
  const [editing, setEditing] = useState<DirectMessage | null>(null);
  const draftBeforeEdit = useRef<string | null>(null);
  useEffect(() => {
    if (!editing) draft.remember({ body });
  }, [body, editing, draft.remember]);
  const scroll = useRef<ScrollViewInstance>(null);
  const stickToBottom = useRef(true);
  const firstLayout = useRef(true);
  const loadingOlder = useRef(false);
  const [showJump, setShowJump] = useState(false);
  const readInFlight = useRef(false);
  const attemptedRead = useRef<string | null>(null);
  const readMounted = useRef(true);
  const [readRevision, setReadRevision] = useState(0);
  const [readFailed, setReadFailed] = useState(false);
  const reducedMotion = useReducedMotion();
  const p = state.profiles.find((p) => p.id === id);
  const blocked = state.preferences.blockedIds.includes(id);
  const conversation = state.directMessages
    .filter(
      (m) =>
        (m.fromId === id && m.toId === state.currentUserId) ||
        (m.toId === id && m.fromId === state.currentUserId),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const participant = directParticipantSnapshot(
    state.directMessages,
    state.currentUserId,
    id,
  );
  const catalogEntry = directCatalog.results.find(
    (conversation) =>
      conversation.participantIds.includes(id) &&
      conversation.participantIds.includes(state.currentUserId),
  );
  const identity = displayIdentity(
    p,
    participant?.name || catalogEntry?.memberNames[id],
    participant?.initials || catalogEntry?.memberInitials[id],
  );
  const messages = blocked ? [] : conversation;
  const muted = state.preferences.dmMutedIds?.includes(id) || false;
  const incomingUnread = messages.filter(
    (message) => message.toId === state.currentUserId && !message.read,
  );
  const catalogUnread = catalogEntry?.unreadCounts[state.currentUserId] || 0;
  const unreadKey = `${catalogEntry?.sequence || 0}:${catalogEntry?.readThrough[state.currentUserId] || 0}:${catalogUnread}:${incomingUnread.length}:${incomingUnread[0]?.id || ""}:${incomingUnread.at(-1)?.id || ""}`;
  const latestMessageId = messages.at(-1)?.id;
  useEffect(() => {
    readMounted.current = true;
    return () => {
      readMounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (blocked) {
      attachment.clear();
      setEditing(null);
      draftBeforeEdit.current = null;
      setBody("");
    }
    stickToBottom.current = true;
    firstLayout.current = true;
    loadingOlder.current = false;
    setShowJump(false);
    watchDirectConversation(blocked ? null : id);
    return () => watchDirectConversation(null);
  }, [id, blocked, watchDirectConversation]);
  useEffect(() => {
    if (
      nav.dialogOpen ||
      !appActive ||
      !isAppActive() ||
      blocked ||
      showJump ||
      directHistory.loading ||
      !latestMessageId ||
      (!incomingUnread.length && !catalogUnread) ||
      readInFlight.current
    )
      return;
    const signature = `${id}:${latestMessageId}:${unreadKey}`;
    if (attemptedRead.current === signature) return;
    attemptedRead.current = signature;
    readInFlight.current = true;
    void nav.run({ type: "dm.read", userId: id }).then((ok) => {
      readInFlight.current = false;
      if (!readMounted.current) return;
      setReadFailed(!ok);
      // A newer unread key arriving while this request was pending gets its turn.
      // The attempted signature prevents repeated writes while snapshots catch up.
      if (ok) setReadRevision((value) => value + 1);
    });
  }, [
    id,
    latestMessageId,
    unreadKey,
    blocked,
    showJump,
    directHistory.loading,
    nav.dialogOpen,
    readRevision,
    appActive,
  ]);
  return (
    <KeyboardAvoidingView
      style={s.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={65}
    >
      <View
        style={[
          s.row,
          { padding: 19, borderBottomWidth: 1, borderColor: color.line },
        ]}
      >
        <View style={s.grow}>
          <Touch
            label={`View ${identity.name} profile`}
            onPress={() => nav.open({ kind: "profile", id })}
            style={s.row}
          >
            <Avatar profile={identity} />
            <View style={s.grow}>
              <Text style={s.h3}>{identity.name}</Text>
              <Text style={s.small}>
                {connected(state, id)
                  ? "Connected"
                  : "Not connected"}
              </Text>
            </View>
          </Touch>
        </View>
        {!blocked && (
          <Button
            small
            secondary
            title={muted ? "Muted" : "Alerts on"}
            disabled={busy}
            onPress={() =>
              void nav.run(
                { type: "dm.mute", userId: id, muted: !muted },
                muted ? "Message alerts on" : "Message alerts muted",
              )
            }
          />
        )}
      </View>
      {readFailed && !blocked && (
        <View
          style={{ paddingHorizontal: 20, paddingVertical: 10, gap: 8 }}
          accessibilityRole="alert"
        >
          <Text style={s.small}>Your read status could not be updated.</Text>
          <Button
            small
            secondary
            title="Jump to latest & retry"
            onPress={() => {
              attemptedRead.current = null;
              loadingOlder.current = false;
              stickToBottom.current = true;
              setShowJump(false);
              scroll.current?.scrollToEnd({ animated: !reducedMotion });
              setReadRevision((value) => value + 1);
            }}
          />
        </View>
      )}
      <ScrollView
        ref={scroll}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
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
        contentContainerStyle={{ padding: 20, gap: 15, paddingBottom: 30 }}
      >
        {!blocked && directHistory.hasMore && (
          <Button
            secondary
            small
            title={
              directHistory.loading
                ? "Loading earlier messages…"
                : "Earlier in your conversation ↑"
            }
            disabled={directHistory.loading}
            onPress={() => {
              loadingOlder.current = true;
              stickToBottom.current = false;
              setShowJump(true);
              void loadOlderDirectMessages()
                .catch(() =>
                  nav.toast("Could not load earlier private messages."),
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
        {blocked && (
          <Empty
            title="Member blocked"
            body="This member's conversation is hidden. You can manage blocked members in Privacy & notifications."
          />
        )}
        {!blocked && directHistory.loading && !messages.length && (
          <Text style={s.small}>Opening your conversation…</Text>
        )}
        {!blocked && !directHistory.loading && messages.length === 0 && (
          <Empty
            title="No messages yet"
            body="Start with a short introduction and why you’re reaching out."
          />
        )}
        {messages.map((m) => {
          const mine = m.fromId === state.currentUserId;
          return (
            <View
              key={m.id}
              style={{
                alignSelf: mine ? "flex-end" : "flex-start",
                maxWidth: "88%",
                gap: 5,
              }}
            >
              <View
                style={{
                  padding: 15,
                  borderRadius: 20,
                  borderBottomRightRadius: mine ? 4 : 20,
                  borderBottomLeftRadius: mine ? 20 : 4,
                  backgroundColor: mine ? color.ink : color.card,
                  borderWidth: mine ? 0 : 1,
                  borderColor: color.line,
                }}
              >
                <LinkifiedText
                  text={m.body}
                  style={{ color: mine ? color.onInk : color.ink }}
                />
                <MediaImage image={m.image} caption={m.body} nav={nav} />
              </View>
              <View
                style={[
                  s.row,
                  { alignSelf: mine ? "flex-end" : "flex-start", gap: 12 },
                ]}
              >
                <RelativeTime date={m.createdAt} />
                {!!m.editedAt && (
                  <Text style={[s.small, { fontSize: 10 }]}>edited</Text>
                )}
                {mine ? (
                  <>
                    <Touch
                      label="Edit your private message"
                      disabled={busy}
                      onPress={() => {
                        if (!editing) draftBeforeEdit.current = body;
                        setEditing(m);
                        setBody(m.body);
                      }}
                      style={{ paddingVertical: 8 }}
                    >
                      <Text style={[s.small, { fontSize: 10 }]}>Edit</Text>
                    </Touch>
                    <Touch
                      label="Delete your private message"
                      disabled={busy}
                      onPress={() =>
                        nav.alert(
                          "Delete your message?",
                          "Your message and any attached image will be removed from this conversation.",
                          [
                            { text: "Keep it", style: "cancel" },
                            {
                              text: "Delete message",
                              style: "destructive",
                              onPress: () => {
                                setBusy(true);
                                void nav
                                  .run(
                                    { type: "dm.delete", messageId: m.id },
                                    "Private message deleted",
                                  )
                                  .then((ok) => {
                                    if (ok && editing?.id === m.id) {
                                      setEditing(null);
                                      setBody("");
                                    }
                                  })
                                  .finally(() => setBusy(false));
                              },
                            },
                          ],
                          { cancelable: true },
                        )
                      }
                      style={{ paddingVertical: 8 }}
                    >
                      <Text style={[s.small, { fontSize: 10 }]}>Delete</Text>
                    </Touch>
                  </>
                ) : (
                  <Touch
                    label="Report this private message"
                    style={{ paddingVertical: 8 }}
                    onPress={() =>
                      nav.alert(
                        "Report this private message?",
                        "The selected message and any attached image will be shared with moderators. The rest of this conversation stays private.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Send report",
                            onPress: () =>
                              void nav.run(
                                {
                                  type: "report.create",
                                  targetType: "directMessage",
                                  targetId: m.id,
                                  reason:
                                    "Safety concern in this private message",
                                },
                                "Private message reported",
                              ),
                          },
                        ],
                        { cancelable: true },
                      )
                    }
                  >
                    <Text style={[s.small, { fontSize: 10 }]}>Report</Text>
                  </Touch>
                )}
              </View>
            </View>
          );
        })}
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
          padding: 15,
          paddingBottom: Platform.OS === "ios" ? 28 : 15,
          borderTopWidth: 1,
          borderColor: color.line,
          gap: 8,
        }}
      >
        {blocked ? (
          <Text style={s.small}>
            You have blocked this member. Unblock them from their profile to
            continue.
          </Text>
        ) : (
          <>
            {editing && (
              <View style={s.between}>
                <Text style={s.small}>Editing your message</Text>
                <Button
                  small
                  secondary
                  title="Cancel"
                  disabled={busy}
                  onPress={() => {
                    setEditing(null);
                    setBody(draftBeforeEdit.current || "");
                    draftBeforeEdit.current = null;
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
                  placeholder="Write a message…"
                  multiline
                  compact
                  maxLength={4000}
                />
              </View>
              <Button
                title={busy ? "…" : editing ? "Save changes" : "Send"}
                disabled={busy || attachment.busy || !body.trim()}
                onPress={() => {
                  loadingOlder.current = false;
                  stickToBottom.current = true;
                  setShowJump(false);
                  setBusy(true);
                  void (
                    editing
                      ? Promise.resolve(null)
                      : attachment.resolve({ kind: "directMessage", id })
                  )
                    .then((image) =>
                      nav.run(
                        editing
                          ? { type: "dm.edit", messageId: editing.id, body }
                          : {
                              type: "dm.send",
                              userId: id,
                              body,
                              ...(image ? { imageId: image.id } : {}),
                            },
                      ),
                    )
                    .then((ok) => {
                      if (ok && readMounted.current) {
                        if (editing) {
                          setBody(draftBeforeEdit.current || "");
                          draftBeforeEdit.current = null;
                          setEditing(null);
                        } else {
                          setBody("");
                          attachment.clear();
                        }
                      }
                    })
                    .catch((error) => {
                      if (readMounted.current)
                        nav.toast(
                          error instanceof Error
                            ? error.message
                            : "Could not send this image.",
                        );
                    })
                    .finally(() => {
                      if (readMounted.current) setBusy(false);
                    });
                }}
              />
            </View>
            <Text style={[s.small, { fontSize: 10 }]}>
              Respect their boundaries. Private messages follow member privacy
              settings.
            </Text>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
