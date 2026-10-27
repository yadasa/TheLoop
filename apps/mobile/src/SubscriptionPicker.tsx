import React, { useState } from "react";
import { Text, View } from "react-native";
import type { Subscription } from "@theloop/core";
import { Sheet } from "./Sheet";
import { color, s, Touch } from "./ui";

const choices: {
  value: Subscription;
  title: string;
  description: string;
  symbol: string;
}[] = [
  {
    value: "following",
    title: "Follow",
    description:
      "Receive updates, subject to your notification settings.",
    symbol: "◉",
  },
  {
    value: "muted",
    title: "Mute",
    description: "Turn off updates. You can still open it whenever you want.",
    symbol: "◌",
  },
  {
    value: "hidden",
    title: "Hide",
    description:
      "Remove it from your normal views. Find it again in Discover, Topics, or the community directory.",
    symbol: "−",
  },
];

export function useSubscriptionPicker() {
  const [request, setRequest] = useState<{
    title: string;
    current: Subscription;
    onPick: (value: Subscription) => void;
  } | null>(null);
  const pickSubscription = (
    title: string,
    current: Subscription,
    onPick: (value: Subscription) => void,
  ) => setRequest({ title, current, onPick });
  return {
    isOpen: !!request,
    pickSubscription,
    subscriptionSheet: (
      <Sheet
        visible={!!request}
        title="Notifications"
        description={request?.title}
        onClose={() => setRequest(null)}
      >
        {choices.map((choice) => (
          <Touch
            key={choice.value}
            label={`${choice.title}${request?.current === choice.value ? ", selected" : ""}`}
            selected={request?.current === choice.value}
            onPress={() => {
              const current = request;
              setRequest(null);
              if (current && current.current !== choice.value)
                current.onPick(choice.value);
            }}
            style={[
              s.card,
              {
                padding: 16,
                backgroundColor:
                  request?.current === choice.value ? color.soft : color.card,
              },
            ]}
          >
            <View style={s.row}>
              <Text style={{ color: color.ink, fontSize: 24, width: 28 }}>
                {choice.symbol}
              </Text>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={s.h3}>{choice.title}</Text>
                <Text style={s.small}>{choice.description}</Text>
              </View>
              {request?.current === choice.value && (
                <Text style={{ color: color.ink }}>✓</Text>
              )}
            </View>
          </Touch>
        ))}
      </Sheet>
    ),
  };
}
