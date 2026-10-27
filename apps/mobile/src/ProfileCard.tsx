import React, { useMemo, useState } from "react";
import {
  ScrollView,
  Share,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import * as Clipboard from "expo-clipboard";
import { useLoop } from "@theloop/client";
import { AmbientGradient, Avatar, Button, color, Empty, Logo, s } from "./ui";
import { resolveShareTarget } from "./sharedLinks";
import { profileCode } from "./profileCode";
import type { Nav } from "./navigation";

export function ProfileCard({ nav }: { nav: Nav }) {
  const { state, mode } = useLoop();
  const { width } = useWindowDimensions();
  const me = state.profiles.find(
    (profile) => profile.id === state.currentUserId,
  );
  const [busy, setBusy] = useState(false);
  const code = useMemo(() => {
    try {
      return profileCode(state.currentUserId, process.env.EXPO_PUBLIC_WEB_URL);
    } catch {
      return null;
    }
  }, [state.currentUserId]);
  if (!me)
    return (
      <Empty
        title="Profile unavailable"
        body="Return to your account and try again."
      />
    );
  const link = resolveShareTarget(
    { kind: "profile", id: me.id },
    process.env.EXPO_PUBLIC_WEB_URL,
  );
  const dimension = code
    ? Math.max(
        code.size,
        Math.floor(Math.min(252, width - 88) / code.size) * code.size,
      )
    : 0;
  return (
    <ScrollView
      contentContainerStyle={[s.content, { gap: 18 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={s.overline}>MEET IN PERSON. STAY IN TOUCH.</Text>
      <Text style={s.title}>Your profile card</Text>
      <View
        style={[
          s.card,
          { padding: 24, gap: 14, alignItems: "center", overflow: "hidden" },
        ]}
      >
        <AmbientGradient variant="hero" />
        <View style={[s.between, { alignSelf: "stretch" }]}>
          <Logo size={22} />
          <Text style={s.overline}>
            {mode === "demo" ? "SAMPLE PROFILE" : "THELOOP"}
          </Text>
        </View>
        <Avatar profile={me} size={64} />
        <Text style={[s.h2, { textAlign: "center" }]}>{me.name}</Text>
        {!!me.headline && (
          <Text style={[s.small, { textAlign: "center" }]}>{me.headline}</Text>
        )}
        {code ? (
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={`QR code linking to ${me.name}'s TheLoop profile. The same link is available below.`}
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 16,
              overflow: "hidden",
              padding: 4,
            }}
          >
            <Svg
              width={dimension}
              height={dimension}
              viewBox={`0 0 ${code.size} ${code.size}`}
              accessible={false}
            >
              <Rect width={code.size} height={code.size} fill="#ffffff" />
              <Path d={code.path} fill="#000000" />
            </Svg>
          </View>
        ) : (
          <Text style={s.small}>
            QR code unavailable. You can copy the profile link below.
          </Text>
        )}
        <Text style={[s.body, { textAlign: "center" }]}>
          Scan to open my profile
        </Text>
      </View>
      <Text style={s.small}>
        {link.requiresApp
          ? "The person scanning needs TheLoop installed and must sign in. If their camera doesn't open app links, share the link below."
          : "The person scanning can open the link and sign in to TheLoop."}
      </Text>
      <Text style={s.small}>
        {me.visibility === "public"
          ? "Members can view your public profile. Scanning doesn't automatically connect or follow either of you."
          : "Your profile is limited to connections. This code doesn't grant access or send a connection request."}
      </Text>
      {mode === "demo" && (
        <Text style={s.small}>
          This fictional profile is for testing and isn't a live community
          account.
        </Text>
      )}
      <Button
        title="Share profile link"
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await Share.share({
              message: `Meet ${me.name} on TheLoop\n${link.url}`,
            });
          } catch {
            nav.toast("Couldn't open sharing. Try copying the link instead.");
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button
        secondary
        title="Copy profile link"
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          try {
            if (!(await Clipboard.setStringAsync(link.url))) throw new Error();
            nav.toast("Profile link copied");
          } catch {
            nav.toast(
              "Couldn't copy automatically. Select the link below to copy it.",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
      <Text selectable style={[s.small, { textAlign: "center" }]}>
        {link.url}
      </Text>
      <Button
        secondary
        title="Edit profile"
        onPress={() => nav.open({ kind: "edit-profile" })}
        disabled={busy}
      />
    </ScrollView>
  );
}
