import React, { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { useLoop } from "@theloop/client";
import type { Report } from "@theloop/core";
import { Button, Empty, Field, Label, s, Section } from "./ui";
import type { Nav } from "./navigation";
import { MediaImage } from "./Media";

export function Safety({ nav }: { nav: Nav }) {
  const { state, role } = useLoop();
  const moderator = role === "moderator" || role === "admin";
  const reports = state.reports
    .filter((r) =>
      moderator ? r.status === "open" : r.reporterId === state.currentUserId,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Take care{`\n`}of the room.</Text>
      <Text style={s.body}>
        {moderator
          ? "Give each report context, care, and a clear decision. Every action is recorded."
          : "Your reports help keep the community safe. Moderators review them with care."}
      </Text>
      <Section
        title={moderator ? "Open reports" : "Your reports"}
        subtitle={`${reports.length} ${reports.length === 1 ? "report" : "reports"}`}
      />
      {reports.map((r) => (
        <ReportCard key={r.id} report={r} moderator={moderator} nav={nav} />
      ))}
      {reports.length === 0 && (
        <Empty
          title={moderator ? "Nothing needs attention" : "No reports yet"}
          body="Keep sharing generously, respect boundaries, and look out for one another."
        />
      )}
    </ScrollView>
  );
}
function ReportCard({
  report: r,
  moderator,
  nav,
}: {
  report: Report;
  moderator: boolean;
  nav: Nav;
}) {
  const { state } = useLoop();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const content =
    r.targetType === "post"
      ? state.posts.find((p) => p.id === r.targetId)?.title
      : r.targetType === "message"
        ? state.messages.find((m) => m.id === r.targetId)?.body
        : r.targetType === "comment"
          ? state.posts
              .find((p) => p.id === r.postId)
              ?.comments.find((c) => c.id === r.targetId)?.body
          : r.targetType === "squadMessage"
            ? state.squadMessages.find((m) => m.id === r.targetId)?.body
            : r.targetType === "directMessage"
              ? state.directMessages.find((m) => m.id === r.targetId)?.body
              : state.profiles.find((p) => p.id === r.targetId)?.name;
  const hasContext = !!content || !!r.snapshot?.body;
  const review = (outcome: "dismiss" | "remove") => {
    setBusy(true);
    void nav
      .run(
        { type: "report.review", reportId: r.id, outcome, note },
        outcome === "remove" && r.targetType !== "profile"
          ? "Content removed and report reviewed"
          : "Report reviewed",
      )
      .finally(() => setBusy(false));
  };
  return (
    <View style={s.card}>
      <View style={s.between}>
        <Label>{r.targetType.toUpperCase()}</Label>
        <Label dark={r.status === "open"}>{r.status.toUpperCase()}</Label>
      </View>
      <Text style={s.h3}>
        {r.snapshot?.title ||
          (r.snapshot ? "Reported excerpt" : content || "Content unavailable")}
      </Text>
      {r.snapshot && (
        <>
          <Text style={s.body}>{r.snapshot.body}</Text>
          <MediaImage
            image={r.snapshot.image}
            caption={r.snapshot.body}
            reportId={moderator ? r.id : undefined}
            nav={nav}
          />
          <Text style={s.small}>
            Captured when reported ·{" "}
            {new Date(r.snapshot.capturedAt).toLocaleString()}
          </Text>
          {(r.targetType === "directMessage" ||
            r.targetType === "squadMessage") && (
            <Text style={s.small}>
              Only this reported message is available to moderators. The private
              conversation is not included.
            </Text>
          )}
          {content && content !== r.snapshot.body && (
            <>
              <Label>CURRENT CONTENT</Label>
              <Text style={s.body}>{content}</Text>
            </>
          )}
        </>
      )}
      {r.targetType === "comment" &&
        r.postId &&
        state.posts.some((p) => p.id === r.postId) && (
          <Button
            secondary
            small
            title="Open the conversation ↗"
            onPress={() => nav.open({ kind: "post", id: r.postId! })}
          />
        )}
      <Text style={s.body}>{r.reason}</Text>
      <Text style={s.small}>{new Date(r.createdAt).toLocaleString()}</Text>
      {moderator && (
        <>
          <Field
            label="Moderator note"
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={1000}
          />
          <View style={s.row}>
            <View style={s.grow}>
              <Button
                secondary
                title="Mark reviewed"
                disabled={busy}
                onPress={() => review("dismiss")}
              />
            </View>
            {r.targetType !== "profile" && (
              <View style={s.grow}>
                <Button
                  title="Remove content"
                  disabled={
                    busy ||
                    !hasContext ||
                    ((r.targetType === "directMessage" ||
                      r.targetType === "squadMessage") &&
                      !r.snapshot)
                  }
                  onPress={() =>
                    Alert.alert(
                      "Remove this content?",
                      r.targetType === "comment"
                        ? "Only this reply will be removed. The rest of the conversation stays. Your action is recorded."
                        : r.targetType === "directMessage" ||
                            r.targetType === "squadMessage"
                          ? "Only the message identified by this report will be removed. Your moderation action is recorded."
                          : "The content will be removed and your moderation action recorded.",
                      [
                        { text: "Keep reviewing", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: () => review("remove"),
                        },
                      ],
                    )
                  }
                />
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );
}
