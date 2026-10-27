import React, { useRef } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, MotionScene, s, Touch, useReducedMotion } from "./ui";

/** Native modal semantics keep the sheet above keyboards and trap background interaction. */
export function Sheet({
  visible,
  title,
  description,
  onClose,
  dismissible = true,
  children,
}: {
  visible: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  dismissible?: boolean;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const heading = useRef<React.ComponentRef<typeof Text>>(null);
  const focusHeading = () => {
    if (Platform.OS === "web") return;
    const node = findNodeHandle(heading.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? "none" : "fade"}
      onRequestClose={onClose}
      onShow={focusHeading}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          accessibilityRole="button"
          accessible={dismissible}
          disabled={!dismissible}
          accessibilityLabel={`Close ${title}`}
          onPress={onClose}
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
          }}
        />
        <MotionScene
          identity={visible ? "open" : "closed"}
          distance={32}
          duration={220}
          style={{
            maxHeight: height * 0.82,
            width: "100%",
            maxWidth: 640,
            alignSelf: "center",
            backgroundColor: color.paper,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderWidth: 1,
            borderColor: color.line,
            overflow: "hidden",
            paddingBottom: Math.max(insets.bottom, 18),
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 34,
              height: 4,
              borderRadius: 3,
              backgroundColor: color.line,
              marginTop: 10,
            }}
          />
          <View
            style={{
              paddingHorizontal: 22,
              paddingTop: 8,
              paddingBottom: 12,
              gap: 6,
            }}
          >
            <View style={s.between}>
              <Text
                ref={heading}
                accessibilityRole="header"
                style={[s.h2, { flex: 1 }]}
              >
                {title}
              </Text>
              {dismissible && (
                <Touch
                  label={`Close ${title}`}
                  onPress={onClose}
                  style={{
                    width: 44,
                    height: 44,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: color.ink, fontSize: 24 }}>×</Text>
                </Touch>
              )}
            </View>
            {description && <Text style={s.small}>{description}</Text>}
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 22,
              paddingBottom: 12,
              gap: 10,
            }}
          >
            {children}
          </ScrollView>
        </MotionScene>
      </KeyboardAvoidingView>
    </Modal>
  );
}
