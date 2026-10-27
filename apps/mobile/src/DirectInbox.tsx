import { inboxRows, type InboxFilter } from "./directInboxPresentation";
import { useSessionDrafts } from "./DraftProvider";
import React, { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useLoop } from "@theloop/client";
import {
  Avatar,
  Button,
  Chip,
  Horizontal,
  MotionScene,
  color,
  displayIdentity,
  Empty,
  Field,
  Label,
  RelativeTime,
  s,
  Touch,
} from "./ui";
import type { Nav } from "./navigation";

export function DirectInbox({ nav }: { nav: Nav }) {
  const drafts = useSessionDrafts();
  const {
    state,
    mode,
    directCatalog,
    loadMoreDirectConversations,
    syncDirectConversations,
  } = useLoop();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const query = search.trim();
  const conversations = inboxRows(directCatalog.results, state, filter, query);
  const unreadCount = inboxRows(directCatalog.results, state, "unread").length;
  const loadMore = loadMoreDirectConversations;
  const backfill = mode === "live" && !directCatalog.progress?.complete;
  const sync = () => {
    void syncDirectConversations().catch((error: unknown) =>
      nav.toast(
        error instanceof Error
          ? error.message
          : "Could not find older conversations. Try again.",
      ),
    );
  };
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.content}
    >
      <Text style={s.overline}>YOUR INBOX</Text>
      <Text style={s.title}>Direct messages</Text>
      <Text style={s.body}>
        Messages between you and another member. Mute a conversation to stop its
        notifications, or block someone to stop new messages.
      </Text>
      {drafts.entries.some((entry) => entry.target.kind === "dm") && (
        <Button
          small
          secondary
          title="Your unsent drafts"
          onPress={() => nav.open({ kind: "drafts" })}
        />
      )}
      <Field
        value={search}
        onChangeText={setSearch}
        placeholder="Search loaded conversations…"
        autoCorrect={false}
      />
      <Horizontal>
        <Chip
          title="All"
          selected={filter === "all"}
          onPress={() => setFilter("all")}
        />
        <Chip
          title={`Unread${unreadCount ? ` · ${unreadCount}` : ""}`}
          selected={filter === "unread"}
          onPress={() => setFilter("unread")}
        />
        <Chip
          title="Muted"
          selected={filter === "muted"}
          onPress={() => setFilter("muted")}
        />
      </Horizontal>
      <Text style={s.small}>
        Filters and search cover loaded conversations.
      </Text>
      {backfill && (
        <View style={s.card}>
          <Text style={s.h3}>Find older conversations</Text>
          <Text style={s.small}>
            {directCatalog.progress?.processed
              ? `${directCatalog.progress.processed.toLocaleString()} earlier messages checked. `
              : ""}
            Some older conversations may be missing from this inbox. Check for
            them below. Unread counts update as they are found.
          </Text>
          <Button
            secondary
            title={
              directCatalog.syncing
                ? "Checking earlier conversations…"
                : directCatalog.progress?.processed
                  ? "Check more conversations"
                  : "Find older conversations"
            }
            disabled={directCatalog.syncing}
            onPress={sync}
          />
        </View>
      )}
      {!!directCatalog.error && (
        <View style={s.card} accessibilityRole="alert">
          <Text style={s.h3}>Couldn’t load your inbox</Text>
          <Text style={s.small}>{directCatalog.error}</Text>
          <Button
            secondary
            title="Retry inbox"
            disabled={directCatalog.loading || directCatalog.syncing}
            onPress={loadMore}
          />
        </View>
      )}
      <MotionScene identity={filter} style={{ gap: 14 }}>
        {conversations.map(({ conversation, peerId, unread, muted }) => {
          const id = peerId!;
          const identity = displayIdentity(
            state.profiles.find((person) => person.id === id),
            conversation.memberNames[id],
            conversation.memberInitials[id],
          );
          return (
            <Touch
              key={conversation.id}
              label={`Message ${identity.name}${unread ? `, ${unread} unread` : ""}`}
              onPress={() => nav.open({ kind: "dm", id })}
              style={[
                s.card,
                { flexDirection: "row", alignItems: "center", gap: 13 },
              ]}
            >
              <Avatar profile={identity} size={45} />
              <View style={[s.grow, { gap: 5 }]}>
                <Text style={[s.h3, unread > 0 && { fontWeight: "700" }]}>
                  {identity.name}
                </Text>
                <Text numberOfLines={2} style={s.small}>
                  {conversation.lastMessage?.body ||
                    (conversation.lastMessage?.hasImage
                      ? "Photo"
                      : "Open your private conversation.")}
                </Text>
                {muted && <Text style={s.small}>Notifications muted</Text>}
              </View>
              <View style={{ alignItems: "flex-end", gap: 9 }}>
                <RelativeTime date={conversation.lastAt} />
                {unread > 0 ? (
                  <Label dark>{unread > 99 ? "99+" : unread}</Label>
                ) : (
                  <Text style={s.small}>↗</Text>
                )}
              </View>
            </Touch>
          );
        })}
      </MotionScene>
      {directCatalog.loading && (
        <View
          style={[s.row, { justifyContent: "center" }]}
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator color={color.ink} />
          <Text style={s.small}>Loading conversations…</Text>
        </View>
      )}
      {!directCatalog.loading &&
        !conversations.length &&
        !directCatalog.error && (
          <Empty
            title={
              query
                ? "No matching conversations"
                : filter === "unread"
                  ? "No unread conversations loaded"
                  : filter === "muted"
                    ? "No muted conversations loaded"
                    : "No direct messages yet"
            }
            body={
              query
                ? "Search matches the conversations loaded so far. Load more or try another name."
                : filter !== "all"
                  ? "Switch to All to see your inbox, or load more conversations below. Muted messages can still be unread."
                  : backfill
                    ? "Check for older conversations above, or find someone in People to message."
                    : "Find someone in People and select Message. Their message settings determine who can contact them."
            }
            action={
              filter !== "all" || query
                ? "Show all conversations"
                : "Browse people"
            }
            onPress={() => {
              if (filter !== "all" || query) {
                setFilter("all");
                setSearch("");
              } else nav.navigate("People");
            }}
          />
        )}
      {directCatalog.hasMore && (
        <Button
          secondary
          title="Load more conversations ↓"
          disabled={directCatalog.loading}
          onPress={loadMore}
        />
      )}
      <Button
        secondary
        title="Browse people"
        onPress={() => nav.navigate("People")}
      />
    </ScrollView>
  );
}
