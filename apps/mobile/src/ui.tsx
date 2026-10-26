import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  AccessibilityInfo,
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
import type { Profile } from "@theloop/core";

const MotionContext = createContext(false);
export const useReducedMotion = () => useContext(MotionContext);
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [reduced, setReduced] = useState(false);
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

export const color = {
  ink: "#171816",
  paper: "#F5F4F0",
  card: "#FFFFFF",
  muted: "#75766F",
  line: "#DEDED7",
  soft: "#EAEAE4",
  tint: "#D8DACF",
};
export const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.paper },
  content: { padding: 22, paddingBottom: 100, gap: 22 },
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
  label: { fontSize: 12, fontWeight: "600", color: color.ink, marginBottom: 7 },
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
              useNativeDriver: true,
              speed: 30,
            }).start();
          if (Platform.OS !== "web")
            void Haptics.selectionAsync().catch(() => {});
        }}
        onPressOut={() =>
          !reduced &&
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
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
      <Text style={[s.buttonText, { color: secondary ? color.ink : "#fff" }]}>
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
          color: selected ? "#fff" : color.muted,
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
export function Avatar({
  profile,
  size = 40,
  inverse = false,
}: {
  profile?: Profile;
  size?: number;
  inverse?: boolean;
}) {
  const shades = ["#DADBD4", "#E7E4DC", "#D3D5D1", "#E2E2DF"];
  const shade = shades[(profile?.name.charCodeAt(0) || 0) % shades.length];
  return (
    <View
      accessibilityLabel={profile?.name || "Member"}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: inverse ? "#33352F" : shade,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: inverse ? "#505149" : "#ffffff",
      }}
    >
      <Text
        style={{
          color: inverse ? "#fff" : color.ink,
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
    <View
      accessibilityLabel="TheLoop"
      style={{ width: size * 1.5, height: size + 3 }}
    >
      <View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderWidth: size * 0.12,
          borderColor: light ? "#fff" : color.ink,
          borderRadius: size / 2,
          transform: [{ rotate: "-28deg" }, { scaleX: 0.72 }],
        }}
      />
      <View
        style={{
          position: "absolute",
          left: size * 0.45,
          top: 2,
          width: size,
          height: size,
          borderWidth: size * 0.12,
          borderColor: light ? "#fff" : color.ink,
          borderRadius: size / 2,
          transform: [{ rotate: "-28deg" }, { scaleX: 0.72 }],
        }}
      />
    </View>
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
}) {
  return (
    <View>
      {label && <Text style={s.label}>{label}</Text>}
      <TextInput
        accessibilityLabel={label || placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.muted}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        autoCapitalize={
          secureTextEntry ||
          keyboardType === "email-address" ||
          keyboardType === "url"
            ? "none"
            : "sentences"
        }
        keyboardType={keyboardType}
        autoCorrect={
          !secureTextEntry &&
          keyboardType !== "email-address" &&
          keyboardType !== "url"
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
      <Text style={s.small}>Finding your people…</Text>
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
            {action} ↗
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
          color: dark ? "#fff" : color.muted,
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
