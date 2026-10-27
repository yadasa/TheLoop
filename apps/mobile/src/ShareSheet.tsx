import React, { useEffect, useState } from "react";
import { Share, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useLoop } from "@theloop/client";
import type { SharedTarget } from "@theloop/core";
import { Sheet } from "./Sheet";
import { AmbientGradient, Button, color, Logo, s } from "./ui";
import { resolveShareTarget } from "./sharedLinks";

declare const process: { env: Record<string, string | undefined> };

export function ShareSheet({
  target,
  title,
  description,
  privateSpace = false,
  onClose,
}: {
  target: SharedTarget | null;
  title: string;
  description?: string;
  privateSpace?: boolean;
  onClose: () => void;
}) {
  const { mode } = useLoop();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const link = target
    ? resolveShareTarget(target, process.env.EXPO_PUBLIC_WEB_URL)
    : null;
  useEffect(() => {
    setCopied(false);
    setError("");
  }, [link?.url]);
  return (
    <Sheet
      visible={!!target}
      title="Share a link"
      description="Send it to someone you'd like to see in the conversation."
      onClose={onClose}
    >
      {link && (
        <>
          <View
            style={[
              s.card,
              {
                overflow: "hidden",
                padding: 22,
                gap: 14,
                backgroundColor: color.hero,
                borderColor: color.heroLine,
              },
            ]}
          >
            <AmbientGradient variant="hero" />
            <Logo light size={30} />
            <Text style={[s.overline, { color: color.heroMuted }]}>
              {mode === "demo" ? "SAMPLE PREVIEW" : "THELOOP"}
            </Text>
            <Text style={[s.h2, { color: color.onHero }]}>{title}</Text>
            {!!description && (
              <Text style={[s.body, { color: color.heroMuted }]}>
                {description}
              </Text>
            )}
          </View>
          <Text
            selectable
            accessibilityLabel="Link to share"
            style={[
              s.body,
              { padding: 14, borderRadius: 14, backgroundColor: color.soft },
            ]}
          >
            {link.url}
          </Text>
          <Text style={s.small}>
            {link.requiresApp
              ? "This link opens in the installed TheLoop app. Your recipient will need to sign in."
              : "Your recipient can open this link in TheLoop and sign in to continue."}
          </Text>
          {privateSpace && (
            <Text style={s.small}>
              Only existing members can open this private chat. Sharing this
              link does not add anyone.
            </Text>
          )}
          {mode === "demo" && (
            <Text style={s.small}>
              This preview uses sample content. It may not exist in the live
              app.
            </Text>
          )}
          {!!error && (
            <Text accessibilityRole="alert" style={s.body}>
              {error}
            </Text>
          )}
          <Button
            title={copied ? "Copied ✓" : "Copy link"}
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              setError("");
              try {
                const ok = await Clipboard.setStringAsync(link.url);
                if (!ok) throw new Error("Copy unavailable");
                setCopied(true);
              } catch {
                setError(
                  "Couldn't copy automatically. Press and hold the link above to copy it.",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
          <Button
            secondary
            title="Share to another app"
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              setError("");
              try {
                await Share.share({
                  title,
                  message: `${mode === "demo" ? "Sample preview: " : ""}${title} on TheLoop\n${link.url}`,
                });
              } catch {
                setError(
                  "Sharing isn't available here. Copy the link and paste it into your conversation.",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      )}
    </Sheet>
  );
}
