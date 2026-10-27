import { useSessionDrafts } from "./DraftProvider";
import React, { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useLoop } from "@theloop/client";
import {
  Avatar,
  Button,
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
  const query = search.trim().toLocaleLowerCase();
  const conversations = directCatalog.results
    .filter((conversation) =>
      conversation.participantIds.includes(state.currentUserId),
    )
    .map((conversation) => ({
      conversation,
      peerId: conversation.participantIds.find(
        (uid) => uid !== state.currentUserId,
      ),
    }))
    .filter(
      (entry) =>
        entry.peerId && !state.preferences.blockedIds.includes(entry.peerId),
    )
    .filter(
      ({ conversation, peerId }) =>
        !query ||
        `${conversation.memberNames[peerId!] || ""} ${conversation.lastMessage?.body || ""}`
          .toLocaleLowerCase()
          .includes(query),
    );
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
            onPress={loadMoreDirectConversations}
          />
        </View>
      )}
      {conversations.map(({ conversation, peerId }) => {
        const id = peerId!;
        const identity = displayIdentity(
          state.profiles.find((person) => person.id === id),
          conversation.memberNames[id],
          conversation.memberInitials[id],
        );
        const unread = Math.max(
          0,
          conversation.unreadCounts[state.currentUserId] || 0,
        );
        const muted = state.preferences.dmMutedIds?.includes(id);
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
                  "Open your private conversation."}
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
              query ? "No matching conversations" : "No direct messages yet"
            }
            body={
              query
                ? "Search matches the conversations loaded so far. Load more or try another name."
                : backfill
                  ? "Check for older conversations above, or find someone in People to message."
                  : "Find someone in People and select Message. Their message settings determine who can contact them."
            }
            action="Browse people"
            onPress={() => nav.navigate("People")}
          />
        )}
      {directCatalog.hasMore && (
        <Button
          secondary
          title="Load more conversations ↓"
          disabled={directCatalog.loading}
          onPress={loadMoreDirectConversations}
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
