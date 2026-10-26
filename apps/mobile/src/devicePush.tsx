import React, { useEffect, useRef, useState } from "react";
import { Linking, Platform, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLoop } from "@theloop/client";
import type { LoopState } from "@theloop/core";
import { Button, s } from "./ui";
import type { Nav } from "./navigation";

const key = "theloop.device-push.v1";
type Registration = { token: string; userId: string };
type Register = (
  token: string,
  platform?: "ios" | "android" | "web",
  remove?: boolean,
) => Promise<void>;
const platform = () =>
  Platform.OS === "ios" ? ("ios" as const) : ("android" as const);
async function savedRegistration(): Promise<Registration | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed &&
      typeof parsed.token === "string" &&
      typeof parsed.userId === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export async function unlinkDevicePush(
  userId: string,
  register: Register,
): Promise<void> {
  if (Platform.OS === "web") return;
  const saved = await savedRegistration();
  if (saved?.userId === userId) {
    await register(saved.token, platform(), true);
    await AsyncStorage.removeItem(key);
  }
}

export function DevicePushSettings({ nav }: { nav: Nav }) {
  const { state, mode, registerPushToken } = useLoop();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void savedRegistration().then((saved) => {
      if (active) setEnabled(saved?.userId === state.currentUserId);
    });
    return () => {
      active = false;
    };
  }, [state.currentUserId]);
  const enable = async () => {
    if (Platform.OS !== "ios" && Platform.OS !== "android")
      throw new Error(
        "Push notifications are available in the installed mobile app.",
      );
    const Device = await import("expo-device");
    if (!Device.isDevice)
      throw new Error("Use a physical device to enable push notifications.");
    const Notifications = await import("expo-notifications");
    if (Platform.OS === "android")
      await Notifications.setNotificationChannelAsync("default", {
        name: "Your loop",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    let permission = await Notifications.getPermissionsAsync();
    if (permission.status !== "granted")
      permission = await Notifications.requestPermissionsAsync();
    if (permission.status !== "granted")
      throw new Error(
        "Notifications are not enabled. You can change this in device Settings.",
      );
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await registerPushToken(token, platform());
    await AsyncStorage.setItem(
      key,
      JSON.stringify({ token, userId: state.currentUserId }),
    );
    setEnabled(true);
  };
  return (
    <View style={s.card}>
      <Text style={s.h3}>Important things. On your terms.</Text>
      <Text style={s.small}>
        {mode === "demo"
          ? "Real push notifications are available for live accounts in an installed development or preview build."
          : "Opt in to private message, connection, and event updates on this device. Quiet hours and room preferences still apply."}
      </Text>
      <Button
        secondary
        title={
          busy
            ? "One moment…"
            : enabled
              ? "Disable push on this device"
              : "Enable push on this device ↗"
        }
        disabled={busy || mode !== "live" || Platform.OS === "web"}
        onPress={() => {
          setBusy(true);
          void (
            enabled
              ? unlinkDevicePush(state.currentUserId, registerPushToken).then(
                  () => setEnabled(false),
                )
              : enable()
          )
            .then(() =>
              nav.toast(
                enabled
                  ? "Push disabled on this device"
                  : "Push is enabled on this device",
              ),
            )
            .catch((e) => nav.toast(e.message))
            .finally(() => setBusy(false));
        }}
      />
      <Button
        secondary
        small
        title="Open device notification settings"
        disabled={Platform.OS === "web"}
        onPress={() =>
          void Linking.openSettings().catch(() =>
            nav.toast(
              "Open your device Settings to manage notification permissions.",
            ),
          )
        }
      />
    </View>
  );
}

export function NativePushBridge({ nav }: { nav: Nav }) {
  const { state, mode } = useLoop();
  const stateRef = useRef(state);
  stateRef.current = state;
  const navRef = useRef(nav);
  navRef.current = nav;
  useEffect(() => {
    if (mode !== "live" || !state.currentUserId || Platform.OS === "web")
      return;
    let active = true;
    let dispose: (() => void) | undefined;
    const seen = new Set<string>();
    const open = (identifier: string, data: Record<string, unknown> = {}) => {
      if (!active || seen.has(identifier)) return;
      seen.add(identifier);
      const current = stateRef.current;
      const own = current.notifications.find(
        (n) =>
          n.id === data.notificationId && n.userId === current.currentUserId,
      );
      if (!own) {
        navRef.current.open({ kind: "notifications" });
        return;
      }
      void navRef.current.run({
        type: "notification.read",
        notificationId: own.id,
      });
      routeNotification(current, own.kind, own.targetId, navRef.current);
    };
    void import("expo-notifications")
      .then(async (Notifications) => {
        if (!active) return;
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
        });
        const subscription =
          Notifications.addNotificationResponseReceivedListener((response) => {
            open(
              response.notification.request.identifier,
              response.notification.request.content.data,
            );
            void Notifications.clearLastNotificationResponseAsync().catch(
              () => {},
            );
          });
        dispose = () => {
          subscription.remove();
          Notifications.setNotificationHandler(null);
        };
        const last = await Notifications.getLastNotificationResponseAsync();
        if (last) {
          open(
            last.notification.request.identifier,
            last.notification.request.content.data,
          );
          await Notifications.clearLastNotificationResponseAsync();
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      dispose?.();
    };
  }, [mode, state.currentUserId]);
  return null;
}
function routeNotification(
  state: LoopState,
  kind: string,
  id: string,
  nav: Nav,
) {
  if (kind === "event") {
    nav.open({ kind: "event", id });
    return;
  }
  if (kind === "message") {
    nav.open({
      kind: state.channels.some((c) => c.id === id) ? "channel" : "dm",
      id,
    });
    return;
  }
  if (kind === "connection") {
    const connection = state.connections.find((c) => c.id === id);
    nav.open({
      kind: "profile",
      id: connection
        ? connection.fromId === state.currentUserId
          ? connection.toId
          : connection.fromId
        : id,
    });
    return;
  }
  if (state.posts.some((p) => p.id === id)) nav.open({ kind: "post", id });
  else nav.navigate("Home");
}
