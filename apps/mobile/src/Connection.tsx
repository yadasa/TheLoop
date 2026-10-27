import React, { createContext, useContext, useEffect, useState } from "react";
import { AppState, Text, View } from "react-native";
import * as Network from "expo-network";
import { useLoop } from "@theloop/client";
import { isOffline } from "./connectionState";
import { color, MotionScene, useTheme } from "./ui";

const OfflineContext = createContext(false);

export function ConnectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { mode } = useLoop();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    setOffline(false);
    if (mode === "demo") return;
    let alive = true;
    let revision = 0;
    const accept = (state: Network.NetworkState) => {
      ++revision;
      if (alive) setOffline(isOffline(state));
    };
    const refresh = () => {
      const request = ++revision;
      void Network.getNetworkStateAsync()
        .then((state) => {
          if (alive && request === revision) setOffline(isOffline(state));
        })
        .catch(() => {}); // Missing platform information must not lock people out.
    };
    const network = Network.addNetworkStateListener(accept);
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    refresh();
    return () => {
      alive = false;
      ++revision;
      network.remove();
      app.remove();
    };
  }, [mode]);
  return (
    <OfflineContext.Provider value={mode !== "demo" && offline}>
      {children}
    </OfflineContext.Provider>
  );
}

export function ConnectionBanner() {
  useTheme();
  const offline = useContext(OfflineContext);
  if (!offline) return null;
  return (
    <MotionScene identity="offline" distance={4}>
      <View
        accessibilityLiveRegion="polite"
        style={{
          paddingHorizontal: 22,
          paddingVertical: 10,
          gap: 3,
          backgroundColor: color.soft,
          borderBottomWidth: 1,
          borderColor: color.line,
        }}
      >
        <Text style={{ color: color.ink, fontSize: 12, fontWeight: "700" }}>
          You're offline
        </Text>
        <Text style={{ color: color.muted, fontSize: 12, lineHeight: 17 }}>
          Keep drafting here. Reconnect before sending, and keep the app open to
          hold your draft.
        </Text>
      </View>
    </MotionScene>
  );
}
