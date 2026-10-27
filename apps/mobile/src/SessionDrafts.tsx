import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLoop } from "@theloop/client";
import { useSessionDrafts } from "./DraftProvider";
import { Button, Empty, Label, MotionScene, s } from "./ui";
import type { Nav } from "./navigation";

export function SessionDrafts({ nav }: { nav: Nav }) {
  const { state, directCatalog } = useLoop();
  const drafts = useSessionDrafts();
  const [, changed] = useState(0);
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.overline}>NOT SENT</Text>
      <Text style={s.title}>Your drafts</Text>
      <Text style={s.body}>
        Pick up a message, post or photo where you left it. These drafts stay on
        this device while the app is open. Signing out or restarting the app
        clears them.
      </Text>
      {!drafts.entries.length && (
        <Empty
          title="No unfinished drafts"
          body="Unsent messages, posts and photos appear here until you publish or discard them."
          action="Group chats"
          onPress={() => nav.navigate("Chat")}
        />
      )}
      {drafts.entries.map(({ target, body, hasReply, hasImage }) => {
        const identity =
          target.kind === "post"
            ? "Community post"
            : target.kind === "channel"
              ? state.channels.find((channel) => channel.id === target.id)?.name
              : target.kind === "squad"
                ? state.squads.find((squad) => squad.id === target.id)?.name
                : state.profiles.find((profile) => profile.id === target.id)
                    ?.name ||
                  directCatalog.results.find((conversation) =>
                    conversation.participantIds.includes(target.id),
                  )?.memberNames[target.id];
        const name =
          identity ||
          (target.kind === "dm" ? "Direct message" : "Conversation");
        const label =
          target.kind === "post"
            ? "Unpublished post"
            : target.kind === "channel"
              ? target.topic || "Group chat"
              : target.kind === "dm"
                ? "Direct message"
                : "Private Squad";
        return (
          <MotionScene
            key={JSON.stringify(target)}
            identity={JSON.stringify(target)}
            style={s.card}
          >
            <View style={s.between}>
              <Text style={[s.h3, s.grow]}>{name}</Text>
              <Label>DRAFT</Label>
            </View>
            <Text style={s.small}>{label}</Text>
            {!!body && (
              <Text style={s.body} numberOfLines={3}>
                {body}
              </Text>
            )}
            {(hasImage || hasReply) && (
              <Text style={s.small}>
                {[hasImage && "Photo attached", hasReply && "Reply prepared"]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            )}
            <View style={s.row}>
              <View style={s.grow}>
                <Button
                  title="Continue"
                  onPress={() =>
                    nav.open(
                      target.kind === "post"
                        ? { kind: "compose" }
                        : target.kind === "channel"
                          ? {
                              kind: "channel",
                              id: target.id,
                              topic: target.topic,
                            }
                          : { kind: target.kind, id: target.id },
                    )
                  }
                />
              </View>
              <Button
                secondary
                title="Discard"
                onPress={() =>
                  nav.alert(
                    "Discard this draft?",
                    `This removes the unsent text and photo for ${name}${target.topic ? ` · ${target.topic}` : ""}.`,
                    [
                      { text: "Keep draft", style: "cancel" },
                      {
                        text: "Discard draft",
                        style: "destructive",
                        onPress: () => {
                          drafts.remove(target);
                          changed((value) => value + 1);
                        },
                      },
                    ],
                  )
                }
              />
            </View>
          </MotionScene>
        );
      })}
    </ScrollView>
  );
}
