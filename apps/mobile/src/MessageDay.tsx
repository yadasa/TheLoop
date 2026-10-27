import React from "react";
import { Text, View } from "react-native";
import { dayKey, dayLabel } from "./chatPresentation";
import { color, s, useTheme } from "./ui";

export function MessageDay({
  timestamp,
  previous,
}: {
  timestamp: string;
  previous?: string;
}) {
  useTheme();
  if (previous && dayKey(previous) === dayKey(timestamp)) return null;
  return (
    <View
      style={[s.row, { paddingVertical: 18, gap: 12, alignSelf: "stretch" }]}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: color.line }} />
      <Text style={[s.small, { fontSize: 11 }]}>{dayLabel(timestamp)}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: color.line }} />
    </View>
  );
}
