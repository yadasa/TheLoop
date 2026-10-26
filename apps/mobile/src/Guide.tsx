import React, { useMemo, useState } from "react";
import {
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import * as Calendar from "expo-calendar/legacy";
import { useGuideEvents } from "@theloop/client";
import {
  guideEventICS,
  guideHTTPSURL,
  type GuideEvent,
  type GuideEventFilters,
} from "@theloop/core";
import {
  Button,
  Chip,
  color,
  Empty,
  Field,
  Horizontal,
  Label,
  LinkifiedText,
  s,
  Touch,
} from "./ui";
import type { Nav } from "./navigation";

const guideTimezone = "America/Chicago";
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    timeZone: guideTimezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });

export function PublicGuide({ nav }: { nav: Nav }) {
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [category, setCategory] = useState("");
  const [filters, setFilters] = useState<GuideEventFilters>({ limit: 50 });
  const [expanded, setExpanded] = useState<string | null>(null);
  const result = useGuideEvents(filters);
  const categories = useMemo(
    () =>
      [
        ...new Set(
          [
            category,
            ...result.events.flatMap((event) => event.categories),
          ].filter(Boolean),
        ),
      ]
        .sort()
        .slice(0, 12),
    [category, result.events],
  );
  const open = (url: string) => {
    const safe = guideHTTPSURL(url);
    if (!safe) return;
    void Linking.openURL(safe).catch(() =>
      nav.toast("Could not open this listing. Try again."),
    );
  };
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={result.loading}
          onRefresh={result.refresh}
          tintColor={color.ink}
        />
      }
    >
      <View>
        <Text style={s.overline}>PUBLIC LISTINGS · AFROTECH.GUIDE</Text>
        <Text style={[s.title, { marginTop: 8 }]}>
          Find your{`\n`}next good plan.
        </Text>
        <Text style={[s.body, { marginTop: 12 }]}>
          The city is part of the conference. Explore public meetups, side
          events, and the moments in between.
        </Text>
      </View>
      <View style={[s.card, { backgroundColor: color.soft }]}>
        <Text style={s.h3}>Fresh from the public Guide.</Text>
        <Text style={s.small}>
          These external listings are separate from your Loop community
          calendar. Registration and final event details belong with the
          organizer.
        </Text>
        <Touch
          label="Open the full AfroTech Guide"
          onPress={() => open("https://afrotech.guide")}
          style={{ paddingVertical: 6 }}
        >
          <Text style={[s.small, { color: color.ink }]}>
            Open the full Guide ↗
          </Text>
        </Touch>
      </View>
      <Field
        label="Find your kind of plan"
        value={query}
        onChangeText={setQuery}
        placeholder="A host, a topic, a little after-hours energy…"
        maxLength={300}
      />
      <Field
        label="Date · Houston time"
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD · leave blank for all dates"
        maxLength={10}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Horizontal>
        <Chip
          title="All categories"
          selected={!category}
          onPress={() => setCategory("")}
        />
        {categories.map((value) => (
          <Chip
            key={value}
            title={value}
            selected={category === value}
            onPress={() => setCategory(value)}
          />
        ))}
      </Horizontal>
      <View style={s.row}>
        <View style={s.grow}>
          <Button
            title="Search the Guide ↗"
            onPress={() => {
              setExpanded(null);
              setFilters({
                q: query.trim(),
                date: date.trim(),
                category,
                limit: 50,
              });
              result.refresh();
            }}
          />
        </View>
        <Button
          secondary
          title="Reset"
          onPress={() => {
            setQuery("");
            setDate("");
            setCategory("");
            setExpanded(null);
            setFilters({ limit: 50 });
            result.refresh();
          }}
        />
      </View>
      <View style={s.between}>
        <Text style={s.h2}>
          {result.loading
            ? "Finding the good stuff…"
            : `${result.events.length} public plan${result.events.length === 1 ? "" : "s"}`}
        </Text>
        <Touch
          label="Refresh public Guide listings"
          onPress={result.refresh}
          disabled={result.loading}
          style={{ padding: 7 }}
        >
          <Text style={s.small}>Refresh ↻</Text>
        </Touch>
      </View>
      {result.error && (
        <View style={s.card}>
          <Text style={s.h3}>The Guide needs a moment.</Text>
          <Text style={s.small}>{result.error}</Text>
          <Button secondary title="Try again" onPress={result.refresh} />
          <Button
            secondary
            title="Open AfroTech.guide ↗"
            onPress={() => open("https://afrotech.guide")}
          />
        </View>
      )}
      {!result.error && !result.loading && result.events.length === 0 && (
        <Empty
          title="A little room to explore"
          body="Try another date, category, or search. The full Guide may have more details."
          action="Open the full Guide"
          onPress={() => open("https://afrotech.guide")}
        />
      )}
      {result.events.map((event) => (
        <GuideCard
          key={event.id}
          event={event}
          expanded={expanded === event.id}
          toggle={() => setExpanded(expanded === event.id ? null : event.id)}
          open={open}
          nav={nav}
        />
      ))}
      {result.bounded && (
        <Text style={s.small}>
          Showing up to {result.limit} matches. Narrow the date, category, or
          search to find more specific plans.
        </Text>
      )}
      {result.skipped > 0 && (
        <Text style={s.small}>
          Some listings could not be displayed. Check the full Guide for
          details.
        </Text>
      )}
      <Text style={[s.small, { textAlign: "center" }]}>
        Dates and times use Houston time. Check the organizer's listing before
        making plans.
      </Text>
    </ScrollView>
  );
}

function GuideCard({
  event,
  expanded,
  toggle,
  open,
  nav,
}: {
  event: GuideEvent;
  expanded: boolean;
  toggle(): void;
  open(url: string): void;
  nav: Nav;
}) {
  const [busy, setBusy] = useState(false);
  const ics = guideEventICS(event);
  const location = [event.venueName, event.address].filter(Boolean).join(" · ");
  const addCalendar = async () => {
    if (!ics || !event.startAt || !event.endAt) return;
    setBusy(true);
    try {
      if (Platform.OS === "web") await shareCalendar(ics);
      else
        await Calendar.createEventInCalendarAsync({
          title: event.title,
          startDate: new Date(event.startAt),
          endDate: new Date(event.endAt),
          location,
          notes: [event.description, event.canonicalUrl]
            .filter(Boolean)
            .join("\n\n"),
          timeZone: guideTimezone,
        });
    } catch {
      nav.toast(
        "Calendar unavailable. Share the calendar file or open the listing instead.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={s.card}>
      <View style={s.between}>
        <Label>{event.kind || "PUBLIC EVENT"}</Label>
        {event.priceType && (
          <Label>{event.priceType.replace(/[-_]/g, " ")}</Label>
        )}
      </View>
      <Touch
        label={`${expanded ? "Collapse" : "Details for"} ${event.title}`}
        onPress={toggle}
        style={{ gap: 9 }}
      >
        <Text style={[s.h2, { fontSize: 23, lineHeight: 29 }]}>
          {event.title}
        </Text>
        {event.host && <Text style={s.small}>Hosted by {event.host}</Text>}
        <Text style={[s.body, { fontWeight: "500" }]}>
          {event.timeLabel ||
            (event.startAt
              ? dateLabel(event.startAt)
              : "Timing to be confirmed")}
        </Text>
        {location && <Text style={s.small}>{location}</Text>}
        <Text style={s.small}>
          {expanded ? "Less detail ↑" : "More detail ↓"}
        </Text>
      </Touch>
      {expanded && (
        <>
          {event.description && <LinkifiedText text={event.description} />}
          <View style={s.wrap}>
            {event.categories.map((value) => (
              <Label key={value}>{value}</Label>
            ))}
          </View>
          {!!event.startAt && !!event.endAt && (
            <Text style={s.small}>
              {dateLabel(event.startAt)} ·{" "}
              {new Date(event.startAt).toLocaleTimeString(undefined, {
                timeZone: guideTimezone,
                hour: "numeric",
                minute: "2-digit",
              })}
              –
              {new Date(event.endAt).toLocaleTimeString(undefined, {
                timeZone: guideTimezone,
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              Houston time
            </Text>
          )}
          <Text style={s.small}>
            {event.sourceLabel || "AfroTech.guide public listing"}
            {event.verifiedAt
              ? ` · Source checked ${new Date(event.verifiedAt).toLocaleDateString()}`
              : ""}
          </Text>
          <Button
            title="View on AfroTech.guide ↗"
            onPress={() => open(event.canonicalUrl)}
          />
          {event.ticketUrl && event.ticketUrl !== event.canonicalUrl && (
            <Button
              secondary
              title="Tickets / organizer ↗"
              onPress={() => open(event.ticketUrl!)}
            />
          )}
          <View style={s.row}>
            <View style={s.grow}>
              <Button
                small
                secondary
                title={busy ? "One moment…" : "Add to calendar"}
                disabled={!ics || busy}
                onPress={() => void addCalendar()}
              />
            </View>
            <Button
              small
              secondary
              title="Share listing ↗"
              onPress={() =>
                void Share.share({
                  title: event.title,
                  message: `${event.title}\n${event.timeLabel || "Check the listing for timing"}\n${location}\n\n${event.canonicalUrl}`,
                }).catch(() =>
                  nav.toast(
                    "Sharing is unavailable. Open the listing instead.",
                  ),
                )
              }
            />
          </View>
          {ics ? (
            <Button
              small
              secondary
              title="Share calendar file ↗"
              onPress={() =>
                void shareCalendar(ics).catch(() =>
                  nav.toast("Calendar sharing is unavailable on this device."),
                )
              }
            />
          ) : (
            <Text style={s.small}>
              Calendar saving becomes available when the source confirms both
              start and end times.
            </Text>
          )}
          {event.address && (
            <Button
              small
              secondary
              title="Directions ↗"
              onPress={() =>
                open(
                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([event.venueName, event.address].filter(Boolean).join(", "))}`,
                )
              }
            />
          )}
          {event.sourceUrl &&
            event.sourceUrl !== event.canonicalUrl &&
            event.sourceUrl !== event.ticketUrl && (
              <Button
                small
                secondary
                title="Original source ↗"
                onPress={() => open(event.sourceUrl!)}
              />
            )}
        </>
      )}
    </View>
  );
}

async function shareCalendar(ics: string): Promise<void> {
  if (Platform.OS === "web") {
    await Share.share({ title: "Event calendar file", message: ics });
    return;
  }
  const FileSystem = await import("expo-file-system/legacy");
  const Sharing = await import("expo-sharing");
  if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync()))
    throw new Error("Calendar sharing is unavailable.");
  const uri = `${FileSystem.cacheDirectory}theloop-guide-event.ics`;
  await FileSystem.writeAsStringAsync(uri, ics, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await Sharing.shareAsync(uri, {
    mimeType: "text/calendar",
    dialogTitle: "Share this public event",
  });
}
