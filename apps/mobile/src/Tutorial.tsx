import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  ScrollView,
  Text,
  View,
  type ScrollViewInstance,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Button, color, Logo, s, useReducedMotion, useTheme } from "./ui";
import type { Nav } from "./navigation";

type Progress = {
  version: 1;
  step: number;
  completed: boolean;
  snoozed: boolean;
};
const storageKey = "theloop.tutorial.v1";
const fresh = (): Progress => ({
  version: 1,
  step: 0,
  completed: false,
  snoozed: false,
});
let saves: Promise<void> = Promise.resolve();

async function readProgress(): Promise<Progress> {
  await saves.catch(() => undefined);
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(storageKey);
  } catch {
    throw new Error(
      "Your guide progress could not be read from this device. Try again.",
    );
  }
  if (raw === null) return fresh();
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") throw new Error();
    const progress = value as Partial<Progress>;
    if (
      progress.version !== 1 ||
      !Number.isInteger(progress.step) ||
      Number(progress.step) < 0 ||
      Number(progress.step) > 3 ||
      typeof progress.completed !== "boolean" ||
      typeof progress.snoozed !== "boolean"
    )
      throw new Error();
    return progress as Progress;
  } catch {
    throw new Error(
      "The saved guide progress could not be opened. You can restart the guide below.",
    );
  }
}

function saveProgress(progress: Progress): Promise<void> {
  const write = saves
    .catch(() => undefined)
    .then(async () => {
      try {
        await AsyncStorage.setItem(storageKey, JSON.stringify(progress));
      } catch {
        throw new Error(
          "Your place could not be saved on this device. Try again before leaving the guide.",
        );
      }
    });
  saves = write;
  return write;
}

/** Device-local introduction, separate from account interests and private community data. */
export async function shouldShowTutorial(): Promise<boolean> {
  const progress = await readProgress();
  return !progress.completed && !progress.snoozed;
}

const steps = [
  {
    eyebrow: "GROUP CHATS",
    title: "Start with a group chat.",
    body: "Choose a conference to see its group chats. Open a chat, then choose a topic.",
    tip: "Use the Group chats tab to return to your chats. Reopen this guide from You.",
  },
  {
    eyebrow: "TOPICS AND NOTIFICATIONS",
    title: "Choose your updates.",
    body: "Topics separate introductions, career questions and event plans. Follow the topics you want updates from.",
    tip: "Mute turns notifications off. Hide removes a chat or topic from your normal views. Change either choice in its notification settings.",
  },
  {
    eyebrow: "EVENTS AND SQUADS",
    title: "Find events. Start a Squad.",
    body: "Find events in the calendar and RSVP. Create a Squad for a private group chat with accepted connections.",
    tip: "People accept Squad invitations before joining. They see messages sent after they join.",
  },
  {
    eyebrow: "PROFILES AND PRIVACY",
    title: "Set up your profile.",
    body: "Add your role, company, skills and interests. Choose who can view your professional details. Connections require acceptance; following is separate.",
    tip: "In You, manage profile visibility, direct-message permissions, notifications and blocked members. Trust scores reflect app activity; they do not verify credentials or personal safety.",
  },
] as const;

function Illustration({ step }: { step: number }) {
  return (
    <View style={[s.card, { gap: 15 }]}>
      <Text style={s.overline}>GUIDANCE PREVIEW · NOT LIVE CONTENT</Text>
      {step === 0 ? (
        <>
          <View style={s.row}>
            <Logo size={30} />
            <Text style={s.h3}>Group chat example</Text>
          </View>
          <View
            style={{
              borderWidth: 1,
              borderColor: color.line,
              borderRadius: 16,
              padding: 17,
              gap: 9,
            }}
          >
            <Text style={s.h3}>The lobby</Text>
            <Text style={s.small}>Introduce yourself to the group.</Text>
            <Text
              style={[
                s.body,
                { backgroundColor: color.soft, borderRadius: 12, padding: 12 },
              ]}
            >
              Open a topic to read and send messages.
            </Text>
          </View>
        </>
      ) : step === 1 ? (
        <>
          <Text style={s.h3}>Notification options</Text>
          {[
            ["Following", "Updates on."],
            ["Muted", "Notifications off."],
            ["Hidden", "Removed from normal views."],
          ].map(([label, body]) => (
            <View
              key={label}
              style={[
                s.row,
                { backgroundColor: color.soft, borderRadius: 14, padding: 13 },
              ]}
            >
              <Text style={[s.h3, { width: 88, fontSize: 14 }]}>{label}</Text>
              <Text style={[s.small, { flex: 1 }]}>{body}</Text>
            </View>
          ))}
        </>
      ) : step === 2 ? (
        <>
          <View style={[s.row, { alignItems: "flex-start" }]}>
            <Text style={[s.h2, { width: 35 }]}>□</Text>
            <View style={[s.grow, { gap: 5 }]}>
              <Text style={s.h3}>Calendar</Text>
              <Text style={s.small}>View details, RSVP and save the date.</Text>
            </View>
          </View>
          <View style={s.divider} />
          <View style={[s.row, { alignItems: "flex-start" }]}>
            <Text style={[s.h2, { width: 35 }]}>◎</Text>
            <View style={[s.grow, { gap: 5 }]}>
              <Text style={s.h3}>Private Squads</Text>
              <Text style={s.small}>Invitations must be accepted.</Text>
            </View>
          </View>
        </>
      ) : (
        <>
          <View style={s.row}>
            <Logo size={30} />
            <Text style={s.h3}>Privacy settings</Text>
          </View>
          <Text style={s.body}>Profile visibility</Text>
          <Text style={s.body}>Connections and followers</Text>
          <Text style={s.body}>Direct-message settings</Text>
          <Text style={s.small}>Change these settings in You.</Text>
        </>
      )}
    </View>
  );
}

export function Tutorial({ nav }: { nav: Nav }) {
  useTheme();
  const reducedMotion = useReducedMotion();
  const scroll = useRef<ScrollViewInstance>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const mounted = useRef(true),
    operating = useRef(false),
    loadGeneration = useRef(0),
    opacity = useRef(new Animated.Value(1)).current;
  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError("");
    try {
      const saved = await readProgress();
      if (mounted.current && generation === loadGeneration.current)
        setProgress(saved.completed ? { ...saved, step: 0 } : saved);
    } catch (failure) {
      if (mounted.current && generation === loadGeneration.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "The guide could not be opened. Try again.",
        );
    } finally {
      if (mounted.current && generation === loadGeneration.current)
        setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      loadGeneration.current++;
    };
  }, [load]);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
    opacity.stopAnimation();
    if (reducedMotion) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0);
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: 160,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [progress?.step, reducedMotion, opacity]);

  const persist = async (next: Progress, after?: () => void) => {
    if (operating.current) return;
    operating.current = true;
    setBusy(true);
    setError("");
    try {
      await saveProgress(next);
      if (!mounted.current) return;
      setProgress(next);
      after?.();
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Your guide progress could not be saved. Try again.",
        );
    } finally {
      operating.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  if (loading || !progress)
    return (
      <ScrollView ref={scroll} contentContainerStyle={s.content}>
        <Logo size={42} />
        <Text style={s.title}>Quick tour</Text>
        {loading ? (
          <Text style={s.small}>Loading guide…</Text>
        ) : (
          <>
            <Text style={s.body} accessibilityRole="alert">
              {error}
            </Text>
            <Button
              title="Try again"
              onPress={() => void load()}
              disabled={busy}
            />
            <Button
              secondary
              title="Restart the guide"
              onPress={() => void persist(fresh())}
              disabled={busy}
            />
            <Button
              secondary
              title="Close for now"
              onPress={nav.close}
              disabled={busy}
            />
          </>
        )}
      </ScrollView>
    );
  const step = steps[progress.step];
  const next = (): Progress => ({
    ...progress,
    step: Math.min(3, progress.step + 1),
  });
  return (
    <ScrollView
      ref={scroll}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.between}>
        <Logo size={34} />
        <Text
          style={s.small}
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 1,
            max: 4,
            now: progress.step + 1,
            text: `Guide step ${progress.step + 1} of 4`,
          }}
        >
          QUICK TOUR · {progress.step + 1} / 4
        </Text>
      </View>
      <Animated.View style={{ opacity, gap: 22 }}>
        <Text style={s.overline}>{step.eyebrow}</Text>
        <Text style={s.title}>{step.title}</Text>
        <Text style={s.body}>{step.body}</Text>
        <Illustration step={progress.step} />
        <Text style={s.small}>{step.tip}</Text>
      </Animated.View>
      {!!error && (
        <Text style={s.body} accessibilityRole="alert">
          {error}
        </Text>
      )}
      {progress.step === 0 ? (
        <>
          <Button
            title={busy ? "Saving…" : "Open group chats"}
            disabled={busy}
            onPress={() => void persist(next(), () => nav.navigate("Chat"))}
          />
          <Button
            secondary
            title="Continue the guide"
            disabled={busy}
            onPress={() => void persist(next())}
          />
        </>
      ) : progress.step < 3 ? (
        <Button
          title={busy ? "Saving…" : "Continue"}
          disabled={busy}
          onPress={() => void persist(next())}
        />
      ) : (
        <Button
          title={busy ? "Saving…" : "Finish guide"}
          disabled={busy}
          onPress={() =>
            void persist(
              { ...progress, completed: true, snoozed: false },
              nav.close,
            )
          }
        />
      )}
      <View style={s.row}>
        {progress.step > 0 && (
          <View style={s.grow}>
            <Button
              secondary
              small
              title="Back"
              disabled={busy}
              onPress={() =>
                void persist({
                  ...progress,
                  step: progress.step - 1,
                })
              }
            />
          </View>
        )}
        <View style={s.grow}>
          <Button
            secondary
            small
            title="Skip for now"
            disabled={busy}
            onPress={() =>
              void persist({ ...progress, snoozed: true }, nav.close)
            }
          />
        </View>
      </View>
      <Text style={s.small}>
        Progress is saved on this device. Reopen the guide from You.
      </Text>
    </ScrollView>
  );
}
