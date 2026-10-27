import React, { useState } from "react";
import { Text, View } from "react-native";
import { Button, Chip, Field, MotionScene, s, Touch } from "./ui";
import { profileTags, type ProfileLinkDraft } from "./profileForm";

export function ProfileTags({
  title,
  values,
  onChange,
  pending,
  onPending,
  suggestions = [],
  disabled,
}: {
  title: string;
  values: string[];
  onChange(values: string[]): void;
  pending: string;
  onPending(value: string): void;
  suggestions?: string[];
  disabled: boolean;
}) {
  const [error, setError] = useState("");
  const add = (value?: string) => {
    try {
      onChange(profileTags(values, value ?? pending));
      if (value === undefined) onPending("");
      setError("");
    } catch (caught) {
      setError((caught as Error).message);
    }
  };
  return (
    <View style={{ gap: 12 }}>
      <View style={s.between}>
        <Text style={s.h3}>{title}</Text>
        <Text style={s.small}>{values.length}/20</Text>
      </View>
      {values.length > 0 && (
        <View style={s.wrap}>
          {values.map((value) => (
            <Touch
              key={value}
              label={`Remove ${value}`}
              disabled={disabled}
              onPress={() => onChange(values.filter((item) => item !== value))}
              style={[s.chip, { minHeight: 44 }]}
            >
              <Text style={s.small}>{value} ×</Text>
            </Touch>
          ))}
        </View>
      )}
      <View style={[s.row, { alignItems: "center" }]}>
        <View style={s.grow}>
          <Field
            value={pending}
            onChangeText={onPending}
            placeholder={`Add ${title === "Skills" ? "a skill" : "what you’re open to"}`}
            disabled={disabled}
            maxLength={240}
            returnKeyType="done"
            onSubmit={() => add()}
          />
        </View>
        <Button
          small
          secondary
          title="Add"
          disabled={disabled || !pending.trim()}
          onPress={() => add()}
        />
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={s.small}>
          {error}
        </Text>
      )}
      {suggestions.length > 0 && (
        <View style={s.wrap}>
          {suggestions
            .filter(
              (value) =>
                !values.some(
                  (item) => item.toLowerCase() === value.toLowerCase(),
                ),
            )
            .map((value) => (
              <Chip
                key={value}
                title={`+ ${value}`}
                disabled={disabled || values.length >= 20}
                onPress={() => add(value)}
              />
            ))}
        </View>
      )}
    </View>
  );
}

export function ProfileLinks({
  rows,
  onChange,
  disabled,
}: {
  rows: ProfileLinkDraft[];
  onChange(rows: ProfileLinkDraft[]): void;
  disabled: boolean;
}) {
  const update = (index: number, patch: Partial<ProfileLinkDraft>) =>
    onChange(
      rows.map((row, slot) => (slot === index ? { ...row, ...patch } : row)),
    );
  return (
    <View style={{ gap: 14 }}>
      <View style={s.between}>
        <Text style={s.h3}>Links</Text>
        <Text style={s.small}>{rows.length}/8</Text>
      </View>
      <Text style={s.small}>
        Your LinkedIn, portfolio, project or wherever people can learn more
        about your work.
      </Text>
      {rows.map((row, index) => (
        <MotionScene
          key={index}
          identity={index}
          style={[s.card, { padding: 16 }]}
        >
          <View style={s.between}>
            <Text style={s.overline}>LINK {index + 1}</Text>
            <Button
              small
              secondary
              title="Remove"
              disabled={disabled}
              onPress={() => onChange(rows.filter((_, slot) => slot !== index))}
            />
          </View>
          <Field
            label={`Link ${index + 1} name`}
            placeholder="LinkedIn or portfolio"
            value={row.label}
            onChangeText={(label) => update(index, { label })}
            maxLength={40}
            disabled={disabled}
          />
          <Field
            label={`Link ${index + 1} address`}
            placeholder="https://…"
            value={row.url}
            onChangeText={(url) => update(index, { url })}
            maxLength={2048}
            keyboardType="url"
            autoCorrect={false}
            autoCapitalize="none"
            disabled={disabled}
          />
        </MotionScene>
      ))}
      {rows.length < 8 && (
        <Button
          secondary
          title="Add a link"
          disabled={disabled}
          onPress={() => onChange([...rows, { label: "", url: "" }])}
        />
      )}
    </View>
  );
}
