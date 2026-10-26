import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { color, Empty, s } from "./ui";

export type DetailStatus = {
  id: string | null;
  loading: boolean;
  notFound: boolean;
  error: string | null;
};

/** A feed window is not evidence that an individual shared record is missing. */
export function DetailState({
  kind,
  id,
  status,
  retry,
}: {
  kind: "post" | "event";
  id: string;
  status: DetailStatus;
  retry: () => void;
}) {
  const noun = kind === "post" ? "conversation" : "event";
  if (status.id !== id || status.loading)
    return (
      <View style={s.empty} accessibilityLiveRegion="polite">
        <ActivityIndicator color={color.ink} />
        <Text style={s.h3}>Opening this {noun}…</Text>
        <Text style={[s.small, { textAlign: "center" }]}>
          Checking the latest details for your account.
        </Text>
      </View>
    );
  if (status.error)
    return (
      <Empty
        title={`Could not open this ${noun}`}
        body={status.error}
        action="Try again"
        onPress={retry}
      />
    );
  return (
    <Empty
      title={kind === "post" ? "Conversation unavailable" : "Event unavailable"}
      body={
        status.notFound
          ? `This ${noun} is no longer available.`
          : `There are no details available for this ${noun}. Try refreshing.`
      }
      action="Check again"
      onPress={retry}
    />
  );
}
