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
      <Text style={s.overline}>A LITTLE MORE PERSONAL</Text>
      <Text style={s.title}>Just between us.</Text>
      <Text style={s.body}>
        Your private conversations, on your terms. Muting keeps a conversation
        quiet. Blocking stops future messages.
      </Text>
      <Field
        value={search}
        onChangeText={setSearch}
        placeholder="Search loaded conversations…"
        autoCorrect={false}
      />
      {backfill && (
        <View style={s.card}>
          <Text style={s.h3}>Bring earlier conversations along</Text>
          <Text style={s.small}>
            {directCatalog.progress?.processed
              ? `${directCatalog.progress.processed.toLocaleString()} earlier messages checked. `
              : ""}
            Find conversations that predate your recent inbox. Each step checks
            another small batch. Unread counts update as earlier history is
            checked.
          </Text>
          <Button
            secondary
            title={
              directCatalog.syncing
                ? "Checking earlier conversations…"
                : directCatalog.progress?.processed
                  ? "Continue finding conversations ↓"
                  : "Find earlier conversations ↓"
            }
            disabled={directCatalog.syncing}
            onPress={sync}
          />
        </View>
      )}
      {!!directCatalog.error && (
        <View style={s.card} accessibilityRole="alert">
          <Text style={s.h3}>Your inbox needs another try</Text>
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
              {muted && <Text style={s.small}>Muted · still in your loop</Text>}
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
          <Text style={s.small}>Finding your conversations…</Text>
        </View>
      )}
      {!directCatalog.loading &&
        !conversations.length &&
        !directCatalog.error && (
          <Empty
            title={
              query ? "No match in this inbox page" : "Make room for a hello"
            }
            body={
              query
                ? "Search matches the conversations loaded so far. Load more or try another name."
                : backfill
                  ? "Find earlier conversations above, or start a thoughtful hello with someone in your circle."
                  : "Your private conversations will appear here. Start with someone in your circle."
            }
            action="Find your people"
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
        title="Find a connection ↗"
        onPress={() => nav.navigate("People")}
      />
    </ScrollView>
  );
}
