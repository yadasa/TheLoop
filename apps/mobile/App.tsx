import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { loadAuthPersistence } from "./src/authPersistence";
import { LoopProvider, useLoop } from "@theloop/client";
import {
  parseSharedTarget,
  type Command,
  type LoopState,
  type SharedTarget,
} from "@theloop/core";
import {
  Feed,
  PostDetail,
  EditPost,
  Compose,
  Communities,
  CommunityDetail,
  CreateCommunity,
} from "./src/Feed";
import { useDialogSheet } from "./src/DialogSheet";
import { ConferenceHub } from "./src/ConferenceHub";
import { Chats, ChannelDetail } from "./src/Chat";
import { DirectInbox } from "./src/DirectInbox";
import { Events, EventDetail, CreateEvent, EditEvent } from "./src/Events";
import { People, ProfileDetail, DirectChat } from "./src/People";
import { Search } from "./src/Search";
import { Safety } from "./src/Safety";
import { Spaces } from "./src/Spaces";
import { ImportEvents } from "./src/ImportEvents";
import { Squads, CreateSquad, SquadDetail, SquadMembers } from "./src/Squads";
import { PublicGuide } from "./src/Guide";
import { Tutorial, shouldShowTutorial } from "./src/Tutorial";
import { NativePushBridge } from "./src/devicePush";
import {
  Auth,
  EditProfile,
  ExportData,
  Notifications,
  Onboarding,
  Settings,
  Trust,
  You,
} from "./src/You";
import {
  AmbientGradient,
  Button,
  color,
  Loading,
  Logo,
  MotionProvider,
  MotionScene,
  s,
  Touch,
  useMotionEnabled,
  useReducedMotion,
  ThemeProvider,
  ThemeSwitcher,
  useTheme,
} from "./src/ui";
import type { Nav, Route, Tab } from "./src/navigation";
import { parseNativeRuntime, type NativeRuntimeConfig } from "./src/runtimeConfig";

const storage = {
  async load(): Promise<LoopState | null> {
    const raw = await AsyncStorage.getItem("theloop.preview.v1");
    return raw ? JSON.parse(raw) : null;
  },
  async save(state: LoopState) {
    await AsyncStorage.setItem("theloop.preview.v1", JSON.stringify(state));
  },
};
// Missing or malformed manifest data must never silently choose another environment.
const runtime: NativeRuntimeConfig | null = (() => {
  try {
    return parseNativeRuntime(Constants.expoConfig?.extra?.theloop);
  } catch {
    return null;
  }
})();

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemeStatusBar />
        {runtime ? (
          <LoopProvider
            storage={storage}
            firebaseConfig={
              runtime.mode === "sample" ? undefined : runtime.firebaseConfig
            }
            authPersistenceFactory={loadAuthPersistence}
            useEmulators={runtime.mode === "emulator"}
            emulators={runtime.mode === "emulator" ? runtime.emulators : undefined}
          >
            <MotionProvider>
              <LoopApp />
            </MotionProvider>
          </LoopProvider>
        ) : (
          <ConfigurationUnavailable />
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function ConfigurationUnavailable() {
  useTheme();
  return (
    <SafeAreaView style={[s.grow, { backgroundColor: color.paper }]}>
      <ScrollView
        contentContainerStyle={[s.content, { flexGrow: 1, justifyContent: "center" }]}
      >
        <Logo size={48} />
        <Text style={s.title} accessibilityRole="header">This version couldn’t start</Text>
        <Text style={s.body}>
          The app setup is incomplete. Install the latest TheLoop preview and
          try again.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ThemeStatusBar() {
  const { theme } = useTheme();
  return <StatusBar style={theme === "dark" ? "light" : "dark"} />;
}

function TabIcon({ selected, symbol }: { selected: boolean; symbol: string }) {
  const enabled = useMotionEnabled();
  const progress = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => {
    progress.stopAnimation();
    if (!enabled) progress.setValue(selected ? 1 : 0);
    else {
      const animation = Animated.spring(progress, {
        toValue: selected ? 1 : 0,
        speed: 24,
        bounciness: 0,
        useNativeDriver: Platform.OS !== "web",
      });
      animation.start();
      return () => animation.stop();
    }
  }, [selected, enabled, progress]);
  return (
    <View
      style={{ width: 45, height: 26, alignItems: "center", justifyContent: "center" }}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: 45,
          height: 26,
          borderRadius: 15,
          backgroundColor: color.ink,
          opacity: progress,
          transform: [{
            scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }),
          }],
        }}
      />
      <Text style={{ fontSize: 21, lineHeight: 25, color: selected ? color.onInk : color.muted }}>
        {symbol}
      </Text>
    </View>
  );
}

function StartupUnavailable() {
  useTheme();
  const { startupError, retryStartup, signOut, state, pending } = useLoop();
  const [leaving, setLeaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const signedIn = Boolean(state.currentUserId);
  const leave = async () => {
    setActionError("");
    setLeaving(true);
    try {
      await signOut();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not sign out. Try again.",
      );
    } finally {
      setLeaving(false);
    }
  };
  return (
    <SafeAreaView style={[s.grow, { backgroundColor: color.paper }]}>
      <AmbientGradient variant="surface" />
      <ScrollView
        contentContainerStyle={[
          s.content,
          { flexGrow: 1, justifyContent: "center", gap: 20 },
        ]}
      >
        <View style={s.between}>
          <Logo size={48} />
          <ThemeSwitcher />
        </View>
        <Text style={s.title} accessibilityRole="header">
          {signedIn ? "We couldn’t load your account" : "TheLoop couldn’t connect"}
        </Text>
        <Text style={s.body} accessibilityLiveRegion="polite">
          {startupError}
        </Text>
        {signedIn && (
          <Text style={s.small}>
            You’re still signed in. Try again to finish opening TheLoop.
          </Text>
        )}
        {actionError ? (
          <Text style={s.body} accessibilityRole="alert">
            {actionError}
          </Text>
        ) : null}
        <Button
          title="Try again"
          disabled={leaving || pending > 0}
          onPress={retryStartup}
        />
        {signedIn && (
          <Button
            title={leaving ? "Signing out…" : "Sign out"}
            secondary
            disabled={leaving || pending > 0}
            onPress={() => void leave()}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function LoopApp() {
  const { theme } = useTheme();
  const { state, dispatch, mode, ready, startupError, error, clearError, pending } =
    useLoop();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [tab, setTab] = useState<Tab>("Home");
  const [stack, setStack] = useState<Route[]>([]);
  const [pendingLink, setPendingLink] = useState<SharedTarget | null>(null);
  const [toast, setToast] = useState("");
  const fade = useRef(new Animated.Value(1)).current;
  const transition = useRef(0);
  const requestedTab = useRef<Tab>("Home");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onboarded = useRef(false);
  const tutorialChecked = useRef<string | null>(null);
  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  }, []);
  const open = useCallback(
    (route: Route) => setStack((v) => [...v, route]),
    [],
  );
  const close = useCallback(() => setStack((v) => v.slice(0, -1)), []);
  const closeIfTop = useCallback(
    (kind: Route["kind"]) =>
      setStack((v) => (v.at(-1)?.kind === kind ? v.slice(0, -1) : v)),
    [],
  );
  const navigate = useCallback(
    (target: Tab) => {
      requestedTab.current = target;
      setStack([]);
      const token = ++transition.current;
      fade.stopAnimation();
      if (reducedMotion) {
        fade.setValue(1);
        setTab(target);
        return;
      }
      Animated.timing(fade, {
        toValue: 0,
        duration: 80,
        useNativeDriver: Platform.OS !== "web",
      }).start(({ finished }) => {
        if (!finished || token !== transition.current) return;
        setTab(target);
        Animated.timing(fade, {
          toValue: 1,
          duration: 150,
          useNativeDriver: Platform.OS !== "web",
        }).start();
      });
    },
    [fade, reducedMotion],
  );
  useEffect(() => {
    if (!reducedMotion) return;
    transition.current++;
    fade.stopAnimation();
    fade.setValue(1);
    setTab(requestedTab.current);
  }, [reducedMotion, fade]);
  const run = useCallback(
    async (command: Command, success?: string) => {
      try {
        await dispatch(command);
        if (success) showToast(success);
        return true;
      } catch (e) {
        showToast(
          e instanceof Error
            ? e.message
            : "Something went wrong. Please try again.",
        );
        return false;
      }
    },
    [dispatch, showToast],
  );
  const { alert, dialogSheet, dialogOpen } = useDialogSheet(`${mode}:${state.currentUserId}:${ready && !startupError}`, showToast);
  const nav: Nav = { open, close, closeIfTop, navigate, run, toast: showToast, alert, dialogOpen };
  useEffect(() => {
    onboarded.current = false;
    transition.current++;
    fade.stopAnimation();
    fade.setValue(1);
    requestedTab.current = "Home";
    setTab("Home");
    setStack([]);
    setToast("");
  }, [state.currentUserId, fade]);
  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (
      ready &&
      state.currentUserId &&
      (!state.preferences.timezone || state.preferences.timezone === "UTC") &&
      timezone !== "UTC"
    )
      void run({ type: "preferences.update", preferences: { timezone } });
  }, [ready, state.currentUserId, state.preferences.timezone, run]);
  useEffect(() => {
    if (state.preferences.onboardingComplete) {
      onboarded.current = false;
      return;
    }
    if (
      ready &&
      state.currentUserId &&
      !state.preferences.onboardingComplete &&
      !onboarded.current
    ) {
      onboarded.current = true;
      setStack([{ kind: "onboarding" }]);
    }
  }, [ready, state.currentUserId, state.preferences.onboardingComplete]);
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const handle = (url: string) => {
      const target = parseSharedTarget(url);
      if (active && target) setPendingLink(target);
    };
    void Linking.getInitialURL()
      .then((url) => {
        if (url && !receivedEvent) handle(url);
      })
      .catch(() => {});
    const listener = Linking.addEventListener("url", ({ url }) => {
      receivedEvent = true;
      handle(url);
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, []);
  useEffect(() => {
    if (
      !pendingLink ||
      !ready ||
      !state.currentUserId ||
      !state.preferences.onboardingComplete
    )
      return;
    // A link is an intent to view, never permission to join a private space.
    // Keep it across startup/sign-in; show it after initial onboarding completes.
    setStack([{ ...pendingLink }]);
    setPendingLink(null);
  }, [
    pendingLink,
    ready,
    state.currentUserId,
    state.preferences.onboardingComplete,
  ]);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (stack.length) {
        close();
        return true;
      }
      if (tab !== "Home") {
        navigate("Home");
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [stack.length, tab, close, navigate]);
  useEffect(() => {
    const userId = state.currentUserId;
    if (
      !ready ||
      !userId ||
      !state.preferences.onboardingComplete ||
      pendingLink ||
      stack.length ||
      tutorialChecked.current === userId
    )
      return;
    tutorialChecked.current = userId;
    let active = true;
    void shouldShowTutorial()
      .then((show) => {
        if (active && show)
          setStack((routes) =>
            routes.length ? routes : [{ kind: "tutorial" }],
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [
    ready,
    state.currentUserId,
    state.preferences.onboardingComplete,
    pendingLink,
    stack.length,
  ]);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  if (startupError) return <StartupUnavailable />;
  if (!ready) return <Loading />;
  const title = (route: Route) =>
    ({
      conference: "Conference",
      "conference-calendar": "Conference calendar",
      post: "Post",
      community: "Community",
      "edit-post": "Edit post",
      channel: "Group chat",
      event: "Event",
      "edit-event": "Edit event",
      profile: "Profile",
      dm: "Direct message",
      inbox: "Direct messages",
      compose: "Create post",
      communities: "Your communities",
      "create-community": "Create community",
      "create-event": "Create event",
      notifications: "Notifications",
      "edit-profile": "Edit profile",
      settings: "Settings",
      auth: "Welcome to TheLoop",
      onboarding: "Set up TheLoop",
      trust: "Community trust",
      export: "Your information",
      search: "Search",
      safety: "Reports",
      spaces: "Community spaces",
      "import-events": "Import events",
      squads: "Your squads",
      "create-squad": "Start a squad",
      squad: "Squad",
      "squad-members": "Squad members",
      guide: "Explore AfroTech.guide",
      tutorial: "Quick tour",
    })[route.kind];
  const renderRoute = (route: Route) => {
    const scope = state.currentUserId || "signed-out";
    switch (route.kind) {
      case "conference-calendar":
        return <Events key={`${scope}:${route.id}`} nav={nav} initialScope={route.id} />;
      case "conference":
        return <ConferenceHub key={`${scope}:${route.id}`} id={route.id} nav={nav} initialDiscover={route.discover} />;
      case "post":
        return (
          <PostDetail key={`${scope}:${route.id}`} id={route.id} nav={nav} />
        );
      case "edit-post":
        return (
          <EditPost key={`${scope}:${route.id}`} id={route.id} nav={nav} />
        );
      case "community":
        return (
          <CommunityDetail
            key={`${scope}:${route.id}`}
            id={route.id}
            nav={nav}
          />
        );
      case "channel":
        return (
          <ChannelDetail
            key={`${scope}:${route.id}:${route.topic || "all"}`}
            id={route.id}
            initialTopic={route.topic}
            nav={nav}
          />
        );
      case "event":
        return (
          <EventDetail key={`${scope}:${route.id}`} id={route.id} nav={nav} />
        );
      case "edit-event":
        return (
          <EditEvent key={`${scope}:${route.id}`} id={route.id} nav={nav} />
        );
      case "profile":
        return (
          <ProfileDetail key={`${scope}:${route.id}`} id={route.id} nav={nav} />
        );
      case "dm":
        return (
          <DirectChat key={`${scope}:${route.id}`} id={route.id} nav={nav} />
        );
      case "inbox":
        return <DirectInbox key={scope} nav={nav} />;
      case "compose":
        return (
          <Compose
            key={`${scope}:${route.communityId || "default"}`}
            initialCommunityId={route.communityId}
            nav={nav}
          />
        );
      case "communities":
        return <Communities nav={nav} />;
      case "create-community":
        return <CreateCommunity nav={nav} />;
      case "create-event":
        return <CreateEvent nav={nav} />;
      case "notifications":
        return <Notifications nav={nav} />;
      case "edit-profile":
        return <EditProfile nav={nav} />;
      case "settings":
        return <Settings nav={nav} />;
      case "auth":
        return <Auth nav={nav} />;
      case "onboarding":
        return <Onboarding nav={nav} />;
      case "trust":
        return <Trust nav={nav} />;
      case "export":
        return <ExportData nav={nav} />;
      case "search":
        return <Search nav={nav} />;
      case "safety":
        return <Safety nav={nav} />;
      case "spaces":
        return <Spaces nav={nav} />;
      case "import-events":
        return <ImportEvents nav={nav} />;
      case "squads":
        return <Squads nav={nav} />;
      case "create-squad":
        return <CreateSquad nav={nav} />;
      case "squad":
        return (
          <SquadDetail key={`${scope}:${route.id}`} id={route.id} nav={nav} />
        );
      case "squad-members":
        return (
          <SquadMembers key={`${scope}:${route.id}`} id={route.id} nav={nav} />
        );
      case "guide":
        return <PublicGuide nav={nav} />;
      case "tutorial":
        return <Tutorial key={scope} nav={nav} />;
    }
  };
  const requestedRoute = stack[stack.length - 1];
  const active =
    mode === "live" &&
    !state.currentUserId &&
    requestedRoute?.kind !== "auth" &&
    requestedRoute?.kind !== "guide"
      ? undefined
      : requestedRoute;
  const tabs: { name: Tab; symbol: string }[] = [
    { name: "Home", symbol: "◈" },
    { name: "Chat", symbol: "◌" },
    { name: "Events", symbol: "▦" },
    { name: "People", symbol: "◎" },
    { name: "You", symbol: "○" },
  ];
  return (
    <SafeAreaView style={s.page} edges={["top", "left", "right"]}>
      <AmbientGradient variant="surface" animated={!active} />
      <NativePushBridge nav={nav} />
      <View
        style={{
          paddingHorizontal: 22,
          paddingVertical: 15,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottomWidth: 1,
          borderColor: color.line,
        }}
      >
        <View style={[s.row, { gap: 8 }]}>
          <Logo size={23} />
          <Text
            style={{
              fontSize: 22,
              fontWeight: "700",
              letterSpacing: -1.1,
              color: color.ink,
            }}
          >
            theloop<Text style={{ fontWeight: "400" }}>.</Text>
          </Text>
        </View>
        <View style={s.row}>
          <ThemeSwitcher />
          {mode === "demo" ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: color.line,
                paddingVertical: 5,
                paddingHorizontal: 8,
                borderRadius: 5,
              }}
            >
              <Text
                style={{
                  fontSize: 9,
                  letterSpacing: 1,
                  color: color.muted,
                  fontWeight: "600",
                }}
              >
                SAMPLE DATA
              </Text>
            </View>
          ) : (
            <Text style={[s.small, { fontSize: 10 }]}>● COMMUNITY</Text>
          )}
          {pending > 0 && (
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 3,
                backgroundColor: color.ink,
              }}
            />
          )}
        </View>
      </View>
      {!!error && (
        <MotionScene identity={error} distance={4}>
          <Touch
            label="Dismiss error"
            onPress={clearError}
            style={{
              paddingHorizontal: 22,
              paddingVertical: 12,
              backgroundColor: color.soft,
            }}
          >
            <Text style={{ fontSize: 12, color: color.ink, lineHeight: 18 }}>
              {error} ×
            </Text>
          </Touch>
        </MotionScene>
      )}
      {mode === "live" && !state.currentUserId ? (
        <View style={{ flex: 1 }}>
          {pendingLink && (
            <View style={{ paddingHorizontal: 22, paddingTop: 15, gap: 6 }}>
              <Text style={s.small}>
                Sign in to open the shared{" "}
                {pendingLink.kind === "post"
                  ? "conversation"
                  : pendingLink.kind}
                .
              </Text>
              <Touch
                label="Cancel shared link"
                onPress={() => setPendingLink(null)}
                style={{ alignSelf: "flex-start", paddingVertical: 5 }}
              >
                <Text style={s.small}>Cancel shared link ×</Text>
              </Touch>
            </View>
          )}
          <Auth nav={nav} />
        </View>
      ) : (
        <Animated.View style={{ flex: 1, opacity: fade }}>
          {tab === "Home" ? (
            <Feed nav={nav} />
          ) : tab === "Chat" ? (
            <Chats nav={nav} />
          ) : tab === "Events" ? (
            <Events nav={nav} />
          ) : tab === "People" ? (
            <People nav={nav} />
          ) : (
            <You nav={nav} />
          )}
        </Animated.View>
      )}
      <View
        style={{
          flexDirection: "row",
          paddingTop: 9,
          paddingBottom: Math.max(10, insets.bottom),
          paddingHorizontal: 14,
          borderTopWidth: 1,
          borderColor: color.line,
          backgroundColor: color.paper,
        }}
      >
        {tabs.map((t) => (
          <View key={t.name} style={{ flex: 1 }}>
            <Touch
              label={`${t.name === "Chat" ? "Group chats" : t.name} tab${tab === t.name ? ", selected" : ""}`}
              onPress={() => navigate(t.name)}
              selected={tab === t.name}
              style={{ alignItems: "center", paddingVertical: 7, gap: 4 }}
            >
              <TabIcon selected={tab === t.name} symbol={t.symbol} />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: tab === t.name ? "700" : "400",
                  color: tab === t.name ? color.ink : color.muted,
                }}
              >
                {t.name === "Chat" ? "Group chats" : t.name}
              </Text>
            </Touch>
          </View>
        ))}
      </View>
      <Modal
        visible={!!active}
        animationType={reducedMotion ? "none" : "slide"}
        presentationStyle="fullScreen"
        onRequestClose={close}
      >
        <SafeAreaView style={s.page} edges={["top", "left", "right", "bottom"]}>
          <AmbientGradient variant="surface" />
          <StatusBar style={theme === "dark" ? "light" : "dark"} />
          {active && (
            <>
              <View
                style={{
                  height: 57,
                  paddingHorizontal: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  borderBottomWidth: 1,
                  borderColor: color.line,
                  gap: 10,
                }}
              >
                <Touch
                  label="Back"
                  onPress={close}
                  style={{ padding: 10, minWidth: 38 }}
                >
                  <Text style={{ fontSize: 23, color: color.ink }}>←</Text>
                </Touch>
                <Text style={[s.h3, { fontSize: 14, flex: 1 }]}>
                  {title(active)}
                </Text>
                {(active.kind === "guide" || mode === "demo") && (
                  <Text style={[s.overline, { fontSize: 8, letterSpacing: 1 }]}>
                    {active.kind === "guide" ? "PUBLIC" : "SAMPLE"}
                  </Text>
                )}
                <ThemeSwitcher />
              </View>
              <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={
                  Platform.OS === "ios" &&
                  !["channel", "dm", "squad"].includes(active.kind)
                    ? "padding"
                    : undefined
                }
              >
                <MotionScene
                  identity={JSON.stringify(active)}
                  style={{ flex: 1 }}
                  distance={8}
                >
                  {renderRoute(active)}
                </MotionScene>
              </KeyboardAvoidingView>
            </>
          )}
          {!!toast && <Toast text={toast} dismiss={() => setToast("")} />}
        </SafeAreaView>
      </Modal>
      {dialogSheet}
      {!!toast && !active && (
        <Toast text={toast} dismiss={() => setToast("")} />
      )}
    </SafeAreaView>
  );
}
function Toast({ text, dismiss }: { text: string; dismiss: () => void }) {
  return (
    <MotionScene
      identity={text}
      distance={8}
      style={{
        position: "absolute",
        bottom: 95,
        left: 18,
        right: 18,
      }}
    >
      <Pressable
        accessibilityRole="alert"
        onPress={dismiss}
        style={{
          padding: 16,
          backgroundColor: color.ink,
          borderRadius: 16,
          shadowColor: "#000",
          shadowOpacity: 0.16,
          shadowRadius: 10,
          elevation: 5,
        }}
      >
        <Text style={{ fontSize: 13, lineHeight: 20, color: color.onInk }}>
          {text}
        </Text>
      </Pressable>
    </MotionScene>
  );
}
