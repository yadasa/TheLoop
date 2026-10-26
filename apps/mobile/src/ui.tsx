import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Image,
  Appearance,
  AppState,
  ActionSheetIOS,
  AccessibilityInfo,
  Alert,
  Linking,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Profile, Subscription } from "@theloop/core";
import { safeURL } from "@theloop/core";

const MotionContext = createContext(false);
export function isAppActive() {
  return AppState.currentState === "active";
}
export function useAppActive() {
  const [active, setActive] = useState(isAppActive);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) =>
      setActive(next === "active"),
    );
    setActive(isAppActive());
    return () => subscription.remove();
  }, []);
  return active;
}
export const useReducedMotion = () => useContext(MotionContext);
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduced)
      .catch(() => {});
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => listener.remove();
  }, []);
  return (
    <MotionContext.Provider value={reduced}>{children}</MotionContext.Provider>
  );
}

const lightPalette = {
  ink: "#171717",
  paper: "#F5F5F5",
  card: "#FFFFFF",
  muted: "#666666",
  line: "#DEDEDE",
  soft: "#EAEAEA",
  tint: "#D8D8D8",
  onInk: "#FFFFFF",
  hero: "#171717",
  onHero: "#F8F8F8",
  heroMuted: "#C8C8C8",
  heroLine: "#454545",
  viewer: "#090909",
  viewerText: "#FFFFFF",
  avatar1: "#DADADA",
  avatar2: "#E4E4E4",
  avatar3: "#D3D3D3",
  avatar4: "#E0E0E0",
};
const darkPalette: typeof lightPalette = {
  ...lightPalette,
  ink: "#F2F2F2",
  paper: "#101010",
  card: "#1C1C1C",
  muted: "#ADADAD",
  line: "#3D3D3D",
  soft: "#292929",
  tint: "#454545",
  onInk: "#101010",
  avatar1: "#343434",
  avatar2: "#3D3D3D",
  avatar3: "#393939",
  avatar4: "#303030",
};
export type ThemeMode = "dark" | "light";
const themeKey = "theloop.appearance.v1";
let currentTheme: ThemeMode = "dark";
// The native app has one appearance. Live bindings refresh every screen together
// when LoopApp consumes ThemeContext; no route keys or drafts are reset.
export const color = { ...darkPalette };
function buildStyles() {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: color.paper },
    content: {
      padding: 22,
      paddingBottom: 100,
      gap: 22,
      width: "100%",
      maxWidth: 760,
      alignSelf: "center",
    },
    row: { flexDirection: "row", alignItems: "center", gap: 10 },
    between: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    title: {
      fontSize: 35,
      lineHeight: 40,
      fontWeight: "700",
      letterSpacing: -1.6,
      color: color.ink,
    },
    h2: {
      fontSize: 22,
      lineHeight: 27,
      fontWeight: "600",
      letterSpacing: -0.6,
      color: color.ink,
    },
    h3: {
      fontSize: 17,
      lineHeight: 23,
      fontWeight: "600",
      letterSpacing: -0.3,
      color: color.ink,
    },
    body: { fontSize: 15, lineHeight: 23, color: color.ink },
    small: { fontSize: 12, lineHeight: 18, color: color.muted },
    overline: {
      fontSize: 10,
      lineHeight: 16,
      letterSpacing: 1.8,
      fontWeight: "700",
      color: color.muted,
    },
    card: {
      backgroundColor: color.card,
      borderRadius: 22,
      padding: 19,
      borderWidth: 1,
      borderColor: color.line,
      gap: 13,
    },
    divider: { height: 1, backgroundColor: color.line },
    grow: { flex: 1 },
    wrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    field: {
      color: color.ink,
      backgroundColor: color.card,
      borderWidth: 1,
      borderColor: color.line,
      borderRadius: 14,
      paddingHorizontal: 15,
      paddingVertical: 14,
      fontSize: 15,
      minHeight: 50,
    },
    label: {
      fontSize: 12,
      fontWeight: "600",
      color: color.ink,
      marginBottom: 7,
    },
    button: {
      minHeight: 45,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 100,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 7,
    },
    buttonText: { fontSize: 13, fontWeight: "600", letterSpacing: 0.1 },
    chip: {
      borderRadius: 100,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      minHeight: 39,
    },
    empty: { alignItems: "center", padding: 32, gap: 12 },
    emptySymbol: { fontSize: 38, color: color.muted },
  });
}
export let s = buildStyles();
const ThemeContext = createContext<{
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => Promise<void>;
} | null>(null);
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("Appearance requires ThemeProvider.");
  return context;
}
function applyTheme(theme: ThemeMode) {
  currentTheme = theme;
  Object.assign(color, theme === "dark" ? darkPalette : lightPalette);
  s = buildStyles();
  if (Platform.OS !== "web") {
    try {
      Appearance.setColorScheme(theme);
    } catch {
      /* The JS palette still works if a host cannot override native appearance. */
    }
    void import("expo-system-ui")
      .then((system) => {
        if (currentTheme === theme)
          return system.setBackgroundColorAsync(color.paper);
      })
      .catch(() => {});
  } else if (typeof document !== "undefined") {
    document.documentElement.style.colorScheme = theme;
    document.body.style.backgroundColor = color.paper;
  }
}
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setCurrentTheme] = useState<ThemeMode>("dark");
  const [ready, setReady] = useState(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(themeKey)
      .catch(() => null)
      .then((saved) => {
        if (!active) return;
        const next = saved === "light" ? "light" : "dark";
        applyTheme(next);
        setCurrentTheme(next);
        setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const setTheme = useCallback((next: ThemeMode) => {
    applyTheme(next);
    setCurrentTheme(next);
    const save = writes.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(themeKey, next));
    writes.current = save;
    return save;
  }, []);
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {ready ? (
        children
      ) : (
        <View
          style={[s.page, { justifyContent: "center", alignItems: "center" }]}
        >
          <ActivityIndicator color={color.ink} />
        </View>
      )}
    </ThemeContext.Provider>
  );
}
export function ThemeSwitcher({ compact = true }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <Touch
      label={`Switch to ${next} mode`}
      onPress={() =>
        void setTheme(next).catch(() =>
          Alert.alert(
            "Theme changed for this session",
            "Your theme changed but could not be saved on this device. Try again.",
          ),
        )
      }
      style={{
        minWidth: 44,
        minHeight: 44,
        paddingHorizontal: 9,
        justifyContent: "center",
        alignItems: "center",
        borderRadius: 21,
        backgroundColor: color.soft,
      }}
    >
      <Text style={{ color: color.ink, fontSize: compact ? 18 : 13 }}>
        {compact
          ? theme === "dark"
            ? "☼"
            : "☾"
          : `Appearance: ${theme} · Switch to ${next}`}
      </Text>
    </Touch>
  );
}

export function Touch({
  children,
  onPress,
  style,
  label,
  disabled = false,
  selected,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  label: string;
  disabled?: boolean;
  selected?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      scale.stopAnimation();
      scale.setValue(1);
    }
  }, [reduced, scale]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, selected }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          if (!reduced)
            Animated.spring(scale, {
              toValue: 0.975,
              useNativeDriver: Platform.OS !== "web",
              speed: 30,
            }).start();
          if (Platform.OS !== "web")
            void Haptics.selectionAsync().catch(() => {});
        }}
        onPressOut={() =>
          !reduced &&
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: Platform.OS !== "web",
            speed: 25,
          }).start()
        }
        style={[style, disabled && { opacity: 0.4 }]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
export function Button({
  title,
  onPress,
  secondary,
  small,
  disabled,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  small?: boolean;
  disabled?: boolean;
}) {
  return (
    <Touch
      label={title}
      onPress={onPress}
      disabled={disabled}
      style={[
        s.button,
        { backgroundColor: secondary ? color.soft : color.ink },
        small && { minHeight: 36, paddingVertical: 8, paddingHorizontal: 14 },
      ]}
    >
      <Text
        style={[s.buttonText, { color: secondary ? color.ink : color.onInk }]}
      >
        {title}
      </Text>
    </Touch>
  );
}
export function Chip({
  title,
  selected,
  onPress,
  count,
}: {
  title: string;
  selected?: boolean;
  onPress: () => void;
  count?: number;
}) {
  return (
    <Touch
      onPress={onPress}
      label={title}
      selected={selected}
      style={[
        s.chip,
        {
          backgroundColor: selected ? color.ink : "transparent",
          borderColor: selected ? color.ink : color.line,
        },
      ]}
    >
      <Text
        style={{
          color: selected ? color.onInk : color.muted,
          fontSize: 12,
          fontWeight: selected ? "600" : "400",
        }}
      >
        {title}
        {count !== undefined ? `  ${count}` : ""}
      </Text>
    </Touch>
  );
}
export function Horizontal({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingRight: 22 }}
    >
      {children}
    </ScrollView>
  );
}
export function displayIdentity(
  profile: Pick<Profile, "name" | "initials"> | undefined,
  name?: string,
  initials?: string,
): Pick<Profile, "name" | "initials"> {
  return {
    name:
      profile?.name ||
      (typeof name === "string" && name.trim()) ||
      "Loop member",
    initials:
      profile?.initials ||
      (typeof initials === "string" && initials.trim()) ||
      "LP",
  };
}

export function Avatar({
  profile,
  size = 40,
  inverse = false,
}: {
  profile?: Pick<Profile, "name" | "initials">;
  size?: number;
  inverse?: boolean;
}) {
  const shades = [color.avatar1, color.avatar2, color.avatar3, color.avatar4];
  const shade = shades[(profile?.name.charCodeAt(0) || 0) % shades.length];
  return (
    <View
      accessibilityLabel={profile?.name || "Member"}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: inverse ? color.heroLine : shade,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: inverse ? color.heroLine : color.card,
      }}
    >
      <Text
        style={{
          color: inverse ? color.onHero : color.ink,
          fontWeight: "600",
          fontSize: size * 0.3,
          letterSpacing: -1,
        }}
      >
        {profile?.initials || "LP"}
      </Text>
    </View>
  );
}
export function Logo({
  light = false,
  size = 25,
}: {
  light?: boolean;
  size?: number;
}) {
  return (
    <Image
      source={require("../assets/loop-mark.png")}
      accessibilityLabel="TheLoop"
      resizeMode="contain"
      style={{
        width: size * 1.35,
        height: size * 1.35,
        tintColor: light ? color.onHero : color.ink,
      }}
    />
  );
}
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  compact,
  secureTextEntry,
  keyboardType,
  maxLength = 5000,
  autoCorrect,
  autoCapitalize,
  disabled = false,
}: {
  label?: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  multiline?: boolean;
  compact?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "url" | "numeric";
  maxLength?: number;
  autoCorrect?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View>
      {label && <Text style={s.label}>{label}</Text>}
      <TextInput
        accessibilityLabel={label || placeholder}
        accessibilityState={{ disabled }}
        editable={!disabled}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.muted}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        autoCapitalize={
          autoCapitalize ??
          (secureTextEntry ||
          keyboardType === "email-address" ||
          keyboardType === "url"
            ? "none"
            : "sentences")
        }
        keyboardType={keyboardType}
        keyboardAppearance={theme}
        selectionColor={color.ink}
        autoCorrect={
          autoCorrect ??
          (!secureTextEntry &&
            keyboardType !== "email-address" &&
            keyboardType !== "url")
        }
        maxLength={maxLength}
        style={[
          s.field,
          multiline && { minHeight: 110, textAlignVertical: "top" },
          compact && { minHeight: 50, maxHeight: 130 },
        ]}
      />
    </View>
  );
}
export function Empty({
  title,
  body,
  action,
  onPress,
}: {
  title: string;
  body: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={s.empty}>
      <Text style={s.emptySymbol}>◎</Text>
      <Text style={[s.h3, { textAlign: "center" }]}>{title}</Text>
      <Text style={[s.small, { textAlign: "center" }]}>{body}</Text>
      {action && onPress && <Button title={action} onPress={onPress} />}
    </View>
  );
}
export function Loading() {
  return (
    <View
      style={[
        s.page,
        { alignItems: "center", justifyContent: "center", gap: 24 },
      ]}
    >
      <Logo size={50} />
      <ActivityIndicator color={color.ink} />
      <Text style={s.small}>Loading TheLoop…</Text>
    </View>
  );
}
export function Section({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.between}>
      <View style={s.grow}>
        <Text style={s.h2}>{title}</Text>
        {subtitle && <Text style={s.small}>{subtitle}</Text>}
      </View>
      {action && onAction && (
        <Touch onPress={onAction} label={action} style={{ padding: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: color.ink }}>
            {action}
          </Text>
        </Touch>
      )}
    </View>
  );
}
export function RelativeTime({ date }: { date: string }) {
  const mins = Math.max(
    1,
    Math.floor((Date.now() - new Date(date).getTime()) / 60000),
  );
  return (
    <Text style={s.small}>
      {mins < 60
        ? `${mins}m`
        : mins < 1440
          ? `${Math.floor(mins / 60)}h`
          : `${Math.floor(mins / 1440)}d`}
    </Text>
  );
}
export function Label({
  children,
  dark = false,
}: {
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <View
      style={{
        backgroundColor: dark ? color.ink : color.soft,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        alignSelf: "flex-start",
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: "600",
          color: dark ? color.onInk : color.muted,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
export function TextLink({
  title,
  onPress,
  style,
}: {
  title: string;
  onPress: () => void;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={{ minHeight: 42, justifyContent: "center" }}
    >
      <Text style={[s.small, { textDecorationLine: "underline" }, style]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function LinkifiedText({
  text,
  style,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
}) {
  const parts = text.split(/(https?:\/\/[^\s<>()]+)/g);
  return (
    <Text selectable style={[s.body, style]}>
      {parts.map((part, index) => {
        if (!/^https?:\/\//i.test(part)) return part;
        const url = part.replace(/[.,;!?]+$/, "");
        const trailing = part.slice(url.length);
        if (!safeURL(url)) return part;
        return (
          <React.Fragment key={index}>
            <Text
              accessibilityRole="link"
              accessibilityLabel={`Open ${url}`}
              style={{ textDecorationLine: "underline" }}
              onPress={(event) => {
                event.stopPropagation();
                void Linking.openURL(url).catch(() =>
                  Alert.alert(
                    "Link unavailable",
                    "Try again or copy this address.",
                  ),
                );
              }}
            >
              {url}
            </Text>
            {trailing}
          </React.Fragment>
        );
      })}
    </Text>
  );
}

export function pickSubscription(
  title: string,
  current: Subscription,
  onPick: (value: Subscription) => void,
) {
  const values: Subscription[] = ["following", "muted", "hidden"];
  const labels = values.map(
    (v) =>
      `${v === "following" ? "Follow" : v === "muted" ? "Mute" : "Hide"}${current === v ? " ✓" : ""}`,
  );
  const message =
    "Follow to receive updates. Mute to stop alerts. Hide to remove it from normal views.";
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: [...labels, "Cancel"],
        cancelButtonIndex: 3,
        userInterfaceStyle: currentTheme,
      },
      (index) => {
        if (index >= 0 && index < 3) onPick(values[index]);
      },
    );
  } else
    Alert.alert(
      title,
      message,
      values.map((value, index) => ({
        text: labels[index],
        onPress: () => onPick(value),
      })),
      { cancelable: true },
    );
}
