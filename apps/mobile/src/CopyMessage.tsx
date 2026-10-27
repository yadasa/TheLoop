import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Button, s } from "./ui";
export function CopyMessage({
  text,
  disabled = false,
}: {
  text: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    source: string;
    copied: boolean;
  }>();
  const revision = useRef(0);
  useEffect(() => {
    ++revision.current;
    setBusy(false);
    setFeedback(undefined);
    return () => {
      ++revision.current;
    };
  }, [text]);
  const current = feedback?.source === text ? feedback : undefined;
  if (!text.trim()) return null;
  return (
    <View style={{ gap: 8, maxWidth: "100%" }}>
      <Button
        small
        secondary
        title={busy ? "Copying…" : current?.copied ? "Copied ✓" : "Copy text"}
        disabled={disabled || busy}
        onPress={async () => {
          const request = ++revision.current;
          setBusy(true);
          setFeedback(undefined);
          try {
            if (!(await Clipboard.setStringAsync(text)))
              throw new Error("Copy unavailable");
            if (request === revision.current)
              setFeedback({ source: text, copied: true });
          } catch {
            if (request === revision.current)
              setFeedback({ source: text, copied: false });
          } finally {
            if (request === revision.current) setBusy(false);
          }
        }}
      />
      {current?.copied === false && (
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="alert" style={s.small}>
            Couldn't copy automatically. Press and hold the text below to copy
            it.
          </Text>
          <Text
            selectable
            accessibilityLabel="Message text to copy"
            style={s.body}
          >
            {text}
          </Text>
        </View>
      )}
    </View>
  );
}
