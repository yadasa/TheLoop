import React, { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import * as Calendar from "expo-calendar/legacy";
import { useLoop } from "@theloop/client";
import { eventICS, previewEventDraft, type LoopEvent } from "@theloop/core";
import {
  Avatar,
  Button,
  Chip,
  color,
  Empty,
  Field,
  Horizontal,
  Label,
  s,
  Section,
  Touch,
} from "./ui";
import type { Nav } from "./navigation";
import { DetailState } from "./DetailState";
import { shareTargetURL } from "./sharedLinks";

const dayKey = (d: string | Date) => new Date(d).toLocaleDateString("en-CA");
export function Events({ nav }: { nav: Nav }) {
  const { state, hasMore, loadMore } = useLoop();
  const [scope, setScope] = useState("all");
  const [kind, setKind] = useState("all");
  const [mode, setMode] = useState("agenda");
  const [month, setMonth] = useState(() => {
    const next = state.events
      .filter((e) => new Date(e.endAt) > new Date())
      .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
    const d = next ? new Date(next.startAt) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const events = state.events
    .filter(
      (e) =>
        (scope === "all" ||
          (scope === "mine" &&
            (e.attendeeIds.includes(state.currentUserId) ||
              e.waitlistIds.includes(state.currentUserId))) ||
          e.conferenceId === scope) &&
        (kind === "all" || e.kind === kind) &&
        `${e.title} ${e.location} ${e.tags.join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const shown =
    mode === "calendar"
      ? events.filter((e) =>
          selected
            ? dayKey(e.startAt) === selected
            : new Date(e.startAt).getMonth() === month.getMonth() &&
              new Date(e.startAt).getFullYear() === month.getFullYear(),
        )
      : events;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = month.getDay();
  return (
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.between}>
        <View>
          <Text style={s.overline}>FROM ONLINE TO OUTSIDE</Text>
          <Text style={[s.title, { marginTop: 5 }]}>Be there.</Text>
        </View>
        <Touch
          label="Create event"
          onPress={() => nav.open({ kind: "create-event" })}
          style={{
            width: 45,
            height: 45,
            borderRadius: 25,
            backgroundColor: color.ink,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 25, color: "#fff" }}>＋</Text>
        </Touch>
      </View>
      <Text style={s.body}>
        The panels, the link-ups, the in-between moments. Make space for all of
        it.
      </Text>
      <View style={[s.card, { backgroundColor: color.soft }]}>
        <Label>PUBLIC EVENTS · AFROTECH.GUIDE</Label>
        <Text style={s.h2}>The city has plans, too.</Text>
        <Text style={s.small}>
          Explore public conference side events and meetups from the Guide.
        </Text>
        <Button
          secondary
          title="Explore the public Guide ↗"
          onPress={() => nav.open({ kind: "guide" })}
        />
      </View>
      <Horizontal>
        <Chip
          title="Global calendar"
          selected={scope === "all"}
          onPress={() => setScope("all")}
        />
        <Chip
          title="My plans"
          selected={scope === "mine"}
          onPress={() => setScope("mine")}
        />
        {state.conferences.map((c) => (
          <Chip
            key={c.id}
            title={c.shortName}
            selected={scope === c.id}
            onPress={() => setScope(c.id)}
          />
        ))}
      </Horizontal>
      <Field
        value={search}
        onChangeText={setSearch}
        placeholder="Find an event, a city, a vibe…"
      />
      <Button
        small
        secondary
        title="Import events from a spreadsheet ↗"
        onPress={() => nav.open({ kind: "import-events" })}
      />
      <View style={s.between}>
        <Horizontal>
          {["all", "conference", "meetup", "workshop", "social"].map((v) => (
            <Chip
              key={v}
              title={v === "all" ? "Everything" : v}
              selected={kind === v}
              onPress={() => setKind(v)}
            />
          ))}
        </Horizontal>
      </View>
      <View style={s.between}>
        <Text style={s.h2}>{events.length} good reasons</Text>
        <View style={s.row}>
          {["agenda", "calendar"].map((v) => (
            <Touch
              key={v}
              label={`${v} view`}
              onPress={() => {
                setMode(v);
                setSelected("");
              }}
              style={{ padding: 6 }}
            >
              <Text
                style={[
                  s.small,
                  mode === v && { fontWeight: "700", color: color.ink },
                ]}
              >
                {v === "agenda" ? "☷ List" : "▦ Month"}
              </Text>
            </Touch>
          ))}
        </View>
      </View>
      {mode === "calendar" && (
        <View style={s.card}>
          <View style={s.between}>
            <Touch
              label="Previous month"
              onPress={() => {
                setMonth(
                  new Date(month.getFullYear(), month.getMonth() - 1, 1),
                );
                setSelected("");
              }}
              style={{ padding: 8 }}
            >
              <Text>←</Text>
            </Touch>
            <Text style={s.h3}>
              {month.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </Text>
            <Touch
              label="Next month"
              onPress={() => {
                setMonth(
                  new Date(month.getFullYear(), month.getMonth() + 1, 1),
                );
                setSelected("");
              }}
              style={{ padding: 8 }}
            >
              <Text>→</Text>
            </Touch>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <View
                key={`head-${i}`}
                style={{
                  width: "14.285%",
                  height: 32,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={s.small}>{d}</Text>
              </View>
            ))}
            {Array.from({ length: offset }).map((_, i) => (
              <View
                key={`blank-${i}`}
                style={{ width: "14.285%", height: 42 }}
              />
            ))}
            {Array.from({ length: days }).map((_, i) => {
              const date = new Date(
                month.getFullYear(),
                month.getMonth(),
                i + 1,
              );
              const key = dayKey(date);
              const has = events.some((e) => dayKey(e.startAt) === key);
              return (
                <View key={i} style={{ width: "14.285%" }}>
                  <Touch
                    label={`${date.toLocaleDateString()}, ${has ? "has events" : "no events"}`}
                    onPress={() => setSelected(selected === key ? "" : key)}
                    style={{
                      height: 42,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 30,
                      backgroundColor:
                        selected === key ? color.ink : "transparent",
                      gap: 2,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: selected === key ? "#fff" : color.ink,
                      }}
                    >
                      {i + 1}
                    </Text>
                    {has && (
                      <View
                        style={{
                          width: 3,
                          height: 3,
                          borderRadius: 2,
                          backgroundColor:
                            selected === key ? "#fff" : color.ink,
                        }}
                      />
                    )}
                  </Touch>
                </View>
              );
            })}
          </View>
          {selected && (
            <Button
              secondary
              small
              title="Show full month"
              onPress={() => setSelected("")}
            />
          )}
        </View>
      )}
      {shown.map((e) => (
        <EventCard key={e.id} event={e} nav={nav} />
      ))}
      {hasMore.events && (
        <Button
          secondary
          title="Load more plans ↓"
          onPress={() => loadMore("events")}
        />
      )}
      {shown.length === 0 && (
        <Empty
          title={
            scope === "mine"
              ? "Your calendar has room"
              : "A little breathing room"
          }
          body={
            scope === "mine"
              ? "RSVP to an event to keep your plans together."
              : "No events match this view. Try another date or start something yourself."
          }
          action="Host a link-up"
          onPress={() => nav.open({ kind: "create-event" })}
        />
      )}
      <Text style={[s.small, { textAlign: "center" }]}>
        Times shown in your device timezone. Event details include the host
        timezone.
      </Text>
    </ScrollView>
  );
}

export function EventCard({ event: e, nav }: { event: LoopEvent; nav: Nav }) {
  const { state } = useLoop();
  const date = new Date(e.startAt);
  const going = e.attendeeIds.includes(state.currentUserId);
  const wait = e.waitlistIds.includes(state.currentUserId);
  return (
    <Touch
      label={`View ${e.title}`}
      onPress={() => nav.open({ kind: "event", id: e.id })}
      style={s.card}
    >
      <View style={[s.row, { alignItems: "flex-start", gap: 15 }]}>
        <View
          style={{
            width: 52,
            padding: 9,
            backgroundColor: color.soft,
            borderRadius: 12,
            alignItems: "center",
            gap: 3,
          }}
        >
          <Text style={[s.overline, { fontSize: 9, letterSpacing: 1 }]}>
            {date
              .toLocaleDateString(undefined, { month: "short" })
              .toUpperCase()}
          </Text>
          <Text
            style={{
              fontSize: 25,
              lineHeight: 29,
              fontWeight: "600",
              color: color.ink,
            }}
          >
            {date.getDate()}
          </Text>
        </View>
        <View style={[s.grow, { gap: 6 }]}>
          <View style={s.wrap}>
            <Label>{e.kind.toUpperCase()}</Label>
            {going && <Label dark>YOU'RE GOING</Label>}
            {wait && <Label>WAITLISTED</Label>}
          </View>
          <Text style={s.h3}>{e.title}</Text>
          <Text style={s.small}>
            {date.toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            · {e.location}
          </Text>
        </View>
      </View>
      <View style={s.between}>
        <View style={[s.row, { gap: 0 }]}>
          {e.attendeeIds.slice(0, 4).map((id, i) => (
            <View key={id} style={{ marginLeft: i ? -9 : 0 }}>
              <Avatar
                size={26}
                profile={state.profiles.find((p) => p.id === id)}
              />
            </View>
          ))}
          <Text style={[s.small, { marginLeft: 8 }]}>
            {e.attendeeIds.length} going
          </Text>
        </View>
        <Text style={s.small}>
          {state.conferences.find((c) => c.id === e.conferenceId)?.shortName} ↗
        </Text>
      </View>
    </Touch>
  );
}

export function EventDetail({ id, nav }: { id: string; nav: Nav }) {
  const { state, role, watchEvent, eventStatus } = useLoop();
  useEffect(() => {
    watchEvent(id);
    return () => watchEvent(null);
  }, [id, watchEvent]);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const event = state.events.find((e) => e.id === id);
  if (
    eventStatus.id !== id ||
    eventStatus.loading ||
    eventStatus.error ||
    eventStatus.notFound ||
    !event
  )
    return (
      <DetailState
        kind="event"
        id={id}
        status={eventStatus}
        retry={() => watchEvent(id)}
      />
    );
  const going = event.attendeeIds.includes(state.currentUserId);
  const waiting = event.waitlistIds.includes(state.currentUserId);
  const full = event.capacity > 0 && event.attendeeIds.length >= event.capacity;
  const expired = new Date(event.endAt) < new Date();
  const conference = state.conferences.find(
    (c) => c.id === event.conferenceId,
  ) as { organizerIds?: string[] } | undefined;
  const canCheckin =
    role === "admin" ||
    role === "moderator" ||
    (event.hostId === state.currentUserId &&
      !!conference?.organizerIds?.includes(state.currentUserId));
  const addCalendar = async () => {
    try {
      if (Platform.OS === "web") {
        await Share.share({ message: eventICS(event) });
        return;
      }
      await Calendar.createEventInCalendarAsync({
        title: event.title,
        startDate: new Date(event.startAt),
        endDate: new Date(event.endAt),
        location: event.location,
        notes: `${event.description}\n\nTheLoop: ${shareTargetURL({ kind: "event", id: event.id })}`,
        timeZone: event.timezone,
        alarms: state.preferences.eventReminders
          ? [{ relativeOffset: -30 }]
          : [],
      });
    } catch {
      nav.toast("Calendar unavailable. Share the event details instead.");
    }
  };
  return (
    <ScrollView contentContainerStyle={s.content}>
      <View
        style={{
          height: 130,
          backgroundColor: color.ink,
          borderRadius: 23,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <View
          style={{
            position: "absolute",
            width: 200,
            height: 200,
            borderRadius: 100,
            borderWidth: 1,
            borderColor: "#4A4B43",
            transform: [{ scaleX: 0.6 }, { rotate: "40deg" }],
          }}
        />
        <View
          style={{
            position: "absolute",
            left: 45,
            width: 200,
            height: 200,
            borderRadius: 100,
            borderWidth: 1,
            borderColor: "#4A4B43",
            transform: [{ scaleX: 0.6 }, { rotate: "40deg" }],
          }}
        />
        <Text style={{ fontSize: 12, letterSpacing: 5, color: "#DADDD1" }}>
          {event.kind.toUpperCase()} / THELOOP
        </Text>
      </View>
      <Label>
        {state.conferences.find((c) => c.id === event.conferenceId)?.name ||
          "COMMUNITY EVENT"}
      </Label>
      <Text style={s.title}>{event.title}</Text>
      <View style={s.card}>
        <Text style={s.h3}>
          {new Date(event.startAt).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </Text>
        <Text style={s.body}>
          {new Date(event.startAt).toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })}{" "}
          –{" "}
          {new Date(event.endAt).toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })}
        </Text>
        <Text style={s.small}>
          Host time:{" "}
          {new Date(event.startAt).toLocaleString(undefined, {
            timeZone: event.timezone,
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}{" "}
          · {event.timezone}
        </Text>
        <View style={s.divider} />
        <Text style={s.h3}>↗ {event.location}</Text>
        <Text style={s.small}>
          {event.capacity > 0
            ? `${event.attendeeIds.length} of ${event.capacity} spots filled`
            : "Open invitation"}
          {event.waitlistIds.length > 0
            ? ` · ${event.waitlistIds.length} waiting`
            : ""}
        </Text>
      </View>
      <Text style={s.body}>{event.description}</Text>
      <View style={s.wrap}>
        {event.tags.map((t) => (
          <Label key={t}>#{t}</Label>
        ))}
      </View>
      <Button
        title={
          expired
            ? "This one is in the books"
            : going
              ? "Going ✓ · Change RSVP"
              : waiting
                ? "Waitlisted · Leave waitlist"
                : full
                  ? "Join the waitlist"
                  : "Count me in ↗"
        }
        disabled={expired}
        onPress={() => {
          if (going || waiting) {
            Alert.alert(
              "Change your plans?",
              going
                ? "Your spot will go to the next person in line."
                : "You will leave this event waitlist.",
              [
                { text: "Keep my plan", style: "cancel" },
                {
                  text: "Leave event",
                  onPress: () =>
                    void nav.run(
                      { type: "event.rsvp", eventId: id },
                      "RSVP updated",
                    ),
                },
              ],
            );
          } else
            void nav.run(
              { type: "event.rsvp", eventId: id },
              full ? "Added to the waitlist" : "See you there!",
            );
        }}
      />
      <View style={s.row}>
        <View style={s.grow}>
          <Button
            secondary
            title="Add to calendar"
            onPress={() => void addCalendar()}
          />
        </View>
        <View style={s.grow}>
          <Button
            secondary
            title="Share ↗"
            onPress={() =>
              void Share.share({
                message: `${event.title}\n${new Date(event.startAt).toLocaleString()}\n${event.location}\n\n${event.description}\n\n${shareTargetURL({ kind: "event", id: event.id })}`,
              })
            }
          />
        </View>
      </View>
      {event.url && (
        <Button
          secondary
          title="Event website ↗"
          onPress={() => {
            if (/^https?:\/\//i.test(event.url || ""))
              void Linking.openURL(event.url!).catch(() =>
                nav.toast("Could not open event link."),
              );
          }}
        />
      )}
      <Section
        title="The people make it"
        subtitle={`${event.attendeeIds.length} going${event.waitlistIds.length ? ` · ${event.waitlistIds.length} on the waitlist` : ""}`}
      />
      {event.hostId === state.currentUserId && !canCheckin && (
        <Text style={s.small}>
          An approved conference organizer confirms attendance for community
          trust.
        </Text>
      )}
      <View style={s.wrap}>
        {event.attendeeIds.map((uid) => {
          const p = state.profiles.find((q) => q.id === uid);
          return (
            <Touch
              key={uid}
              label={`View ${p?.name || "member"}`}
              onPress={() => nav.open({ kind: "profile", id: uid })}
              style={{
                alignItems: "center",
                gap: 5,
                width: 65,
                marginBottom: 9,
              }}
            >
              <Avatar size={45} profile={p} />
              <Text numberOfLines={1} style={s.small}>
                {p?.name.split(" ")[0] || "Member"}
              </Text>
            </Touch>
          );
        })}
      </View>
      {canCheckin &&
        Date.now() >= new Date(event.startAt).getTime() - 6 * 3600000 &&
        Date.now() <= new Date(event.endAt).getTime() + 24 * 3600000 && (
          <View style={s.card}>
            <Section
              title="Host check-in"
              subtitle="Confirm who's here. Real attendance builds real trust."
            />
            {event.attendeeIds
              .filter((uid) => uid !== state.currentUserId)
              .map((uid) => (
                <View key={uid} style={s.between}>
                  <Text style={[s.small, { flex: 1 }]}>
                    {state.profiles.find((p) => p.id === uid)?.name ||
                      "Attendee"}
                  </Text>
                  <Button
                    small
                    secondary
                    title={
                      checkedIds.includes(uid)
                        ? "Confirmed ✓"
                        : "Confirm attendance"
                    }
                    disabled={checkedIds.includes(uid)}
                    onPress={() =>
                      void nav
                        .run(
                          {
                            type: "event.checkin",
                            eventId: event.id,
                            userId: uid,
                          },
                          "Attendance confirmed",
                        )
                        .then((ok) => {
                          if (ok) setCheckedIds((prev) => [...prev, uid]);
                        })
                    }
                  />
                </View>
              ))}
          </View>
        )}
    </ScrollView>
  );
}

export function CreateEvent({ nav }: { nav: Nav }) {
  const { state } = useLoop();
  const [conferenceId, setConference] = useState(
    state.conferences[0]?.id || "",
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [capacity, setCapacity] = useState("30");
  const [kind, setKind] = useState<LoopEvent["kind"]>("meetup");
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const edit = (update: (value: string) => void) => (value: string) => {
    update(value);
    setErrors([]);
  };
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.content}
    >
      <Text style={s.title}>Bring your{`\n`}people together.</Text>
      <Horizontal>
        {state.conferences.map((c) => (
          <Chip
            key={c.id}
            title={c.shortName}
            selected={conferenceId === c.id}
            onPress={() => {
              if (!busy) {
                setConference(c.id);
                setErrors([]);
              }
            }}
          />
        ))}
      </Horizontal>
      <Field
        label="The occasion"
        value={title}
        onChangeText={edit(setTitle)}
        disabled={busy}
        placeholder="Coffee before the keynote"
        maxLength={160}
      />
      <Field
        label="What should people know?"
        value={description}
        onChangeText={edit(setDescription)}
        disabled={busy}
        maxLength={3000}
        multiline
      />
      <Field
        label="Where are we meeting?"
        value={location}
        onChangeText={edit(setLocation)}
        disabled={busy}
        maxLength={240}
        placeholder="Venue or meeting link"
      />
      <Horizontal>
        {(["conference", "meetup", "workshop", "social"] as const).map((k) => (
          <Chip
            key={k}
            title={k}
            selected={kind === k}
            onPress={() => {
              if (!busy) {
                setKind(k);
                setErrors([]);
              }
            }}
          />
        ))}
      </Horizontal>
      <Field
        label="Event website · optional"
        value={url}
        onChangeText={edit(setUrl)}
        disabled={busy}
        maxLength={2048}
        keyboardType="url"
        placeholder="https://…"
      />
      <Field
        label="Tags · comma separated"
        value={tags}
        onChangeText={edit(setTags)}
        disabled={busy}
        placeholder="Founders, Coffee, Networking"
      />
      <Text style={s.small}>
        Add up to 6 tags, each up to 30 characters. Event websites use HTTPS.
      </Text>
      <Field
        label="Event timezone · IANA name"
        value={timezone}
        onChangeText={edit(setTimezone)}
        disabled={busy}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="America/Chicago"
        maxLength={100}
      />
      <Horizontal>
        {Array.from(
          new Set([
            Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            "America/Chicago",
            "America/New_York",
            "America/Los_Angeles",
            "UTC",
          ]),
        ).map((zone) => (
          <Chip
            key={zone}
            title={zone.replace("America/", "").replace(/_/g, " ")}
            selected={timezone === zone}
            onPress={() => {
              if (!busy) {
                setTimezone(zone);
                setErrors([]);
              }
            }}
          />
        ))}
      </Horizontal>
      <Field
        label="Starts · YYYY-MM-DD HH:mm"
        value={start}
        onChangeText={edit(setStart)}
        disabled={busy}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="2026-11-05 18:00"
        maxLength={40}
      />
      <Field
        label="Ends · YYYY-MM-DD HH:mm"
        value={end}
        onChangeText={edit(setEnd)}
        disabled={busy}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="2026-11-05 20:00"
        maxLength={40}
      />
      <Text style={s.small}>
        Enter local times in the event timezone. If a clock change repeats a
        time, include its UTC offset, for example 2026-11-01T01:30-05:00. A Z
        suffix means UTC. Impossible dates and skipped local times need
        correcting.
      </Text>
      <Field
        label="Capacity · 0 for unlimited"
        value={capacity}
        onChangeText={edit(setCapacity)}
        disabled={busy}
        keyboardType="numeric"
        maxLength={4}
      />
      <Text style={s.small}>
        Capacity can be 0 to 1,000. A waitlist opens automatically when the
        event fills up.
      </Text>
      {errors.length > 0 && (
        <View style={s.card} accessibilityRole="alert">
          <Text style={s.h3}>A few details need care</Text>
          {errors.map((error, index) => (
            <Text key={`${index}:${error}`} style={s.small}>
              {error}
            </Text>
          ))}
        </View>
      )}
      <Button
        title={busy ? "Creating…" : "Make it happen ↗"}
        disabled={
          busy ||
          !title.trim() ||
          !description.trim() ||
          !location.trim() ||
          !start ||
          !end ||
          !timezone.trim() ||
          !conferenceId
        }
        onPress={() => {
          const result = previewEventDraft(
            {
              conferenceId,
              title,
              description,
              location,
              kind,
              capacity,
              startAt: start,
              endAt: end,
              timezone,
              tags: tags
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
              url,
            },
            {
              conferences: state.conferences,
              existingEvents: state.events,
              now: new Date().toISOString(),
            },
          );
          if (!result.event) {
            setErrors(
              result.errors.length
                ? result.errors
                : ["Check the event dates and details."],
            );
            return;
          }
          setErrors([]);
          setBusy(true);
          void nav
            .run(
              {
                type: "event.create",
                event: result.event,
              },
              "Your event is ready",
            )
            .then((ok) => {
              if (ok) nav.closeIfTop("create-event");
            })
            .finally(() => setBusy(false));
        }}
      />
    </ScrollView>
  );
}
