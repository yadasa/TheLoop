import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Platform, ScrollView, Text, View } from "react-native";
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
    eyebrow: "START WITH YOUR PEOPLE",
    title: "Group chats.\nA little more room.",
    body: "Group chats are the heart of TheLoop. Find a conference hub, open a room, and join the conversations that feel like you.",
    tip: "The Group chats tab keeps your rooms close. You can return to this guide from You whenever you like.",
  },
  {
    eyebrow: "MAKE ROOM FOR WHAT MATTERS",
    title: "Follow the good stuff.\nTurn down the rest.",
    body: "Rooms have topics, so introductions, career moves, and after-hours plans can each have their own space. Choose what deserves your attention.",
    tip: "Follow keeps you in the loop. Mute quiets a topic. Hide removes it from your view without making the choice for anyone else.",
  },
  {
    eyebrow: "TAKE THE CONNECTION FURTHER",
    title: "A good plan.\nA smaller circle.",
    body: "Explore events in the calendar and RSVP when a plan feels right. For your own private circle, create a Squad and invite accepted connections.",
    tip: "A Squad invitation is a choice. Friends accept before joining, and new members do not receive conversation history from before they joined.",
  },
  {
    eyebrow: "YOUR COMFORT COMES FIRST",
    title: "Be known.\nOn your terms.",
    body: "Share the professional details you want people to see. Connections need an accepted request; following someone is a separate choice.",
    tip: "Review profile visibility, who can start a private conversation, quiet hours, and blocks in You. Trust scores explain activity signals; they do not verify someone’s credentials or safety.",
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
            <Text style={s.h3}>Your group chats</Text>
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
            <Text style={s.small}>A room for the first hello.</Text>
            <Text
              style={[
                s.body,
                { backgroundColor: color.soft, borderRadius: 12, padding: 12 },
              ]}
            >
              Introductions → choose a topic, then join in.
            </Text>
          </View>
        </>
      ) : step === 1 ? (
        <>
          <Text style={s.h3}>Choose the volume.</Text>
          {[
            ["Following", "Keep this topic close."],
            ["Muted", "Stay joined, with less noise."],
            ["Hidden", "Give this space a rest."],
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
              <Text style={s.small}>See the plan before you commit.</Text>
            </View>
          </View>
          <View style={s.divider} />
          <View style={[s.row, { alignItems: "flex-start" }]}>
            <Text style={[s.h2, { width: 35 }]}>◎</Text>
            <View style={[s.grow, { gap: 5 }]}>
              <Text style={s.h3}>Private Squads</Text>
              <Text style={s.small}>
                Invited friends decide whether to join.
              </Text>
            </View>
          </View>
        </>
      ) : (
        <>
          <View style={s.row}>
            <Logo size={30} />
            <Text style={s.h3}>You set the boundaries.</Text>
          </View>
          <Text style={s.body}>Profile visibility</Text>
          <Text style={s.body}>Connections and followers</Text>
          <Text style={s.body}>Private conversation settings</Text>
          <Text style={s.small}>
            A thoughtful introduction can be the start. You choose what comes
            next.
          </Text>
        </>
      )}
    </View>
  );
}

export function Tutorial({ nav }: { nav: Nav }) {
  useTheme();
  const reducedMotion = useReducedMotion();
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
      <ScrollView contentContainerStyle={s.content}>
        <Logo size={42} />
        <Text style={s.title}>A little way around.</Text>
        {loading ? (
          <Text style={s.small}>Opening your guide…</Text>
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
          YOUR GUIDE · {progress.step + 1} / 4
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
            title={busy ? "Saving your place…" : "Open group chats ↗"}
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
          title={busy ? "Saving your place…" : "Continue ↗"}
          disabled={busy}
          onPress={() => void persist(next())}
        />
      ) : (
        <Button
          title={busy ? "Saving your place…" : "Finish · make yourself at home"}
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
        Your place is saved on this device. Reopen the guide from You anytime.
      </Text>
    </ScrollView>
  );
}
