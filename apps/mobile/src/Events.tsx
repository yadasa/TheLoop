import React, { useEffect, useRef, useState } from "react";
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
import { eventICS, type LoopEvent } from "@theloop/core";
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
import { shareCalendarFile } from "./shareCalendar";

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
          <Text style={s.overline}>CONFERENCES & MEETUPS</Text>
          <Text style={[s.title, { marginTop: 5 }]}>Events</Text>
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
          <Text style={{ fontSize: 25, color: color.onInk }}>＋</Text>
        </Touch>
      </View>
      <Text style={s.body}>
        Find events and keep your RSVPs in one place.
      </Text>
      <Touch
        label="Browse public AfroTech side events from AfroTech.guide"
        onPress={() => nav.open({ kind: "guide" })}
        style={[s.card, s.between, { backgroundColor: color.soft, paddingVertical: 15 }]}
      >
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={[s.overline, { fontSize: 9, letterSpacing: 1 }]}>PUBLIC · AFROTECH.GUIDE</Text>
          <Text style={s.h3}>AfroTech side events</Text>
        </View>
        <Text style={[s.h2, { marginLeft: 10 }]} accessibilityElementsHidden>›</Text>
      </Touch>
      <Horizontal>
        <Chip
          title="Global calendar"
          selected={scope === "all"}
          onPress={() => setScope("all")}
        />
        <Chip
          title="My events"
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
        placeholder="Search events by name, location, or tag"
      />
      <View style={s.between}>
        <Horizontal>
          {["all", "conference", "meetup", "workshop", "social"].map((v) => (
            <Chip
              key={v}
              title={v === "all" ? "Everything" : v.charAt(0).toUpperCase() + v.slice(1)}
              selected={kind === v}
              onPress={() => setKind(v)}
            />
          ))}
        </Horizontal>
      </View>
      <View style={s.between}>
        <Text style={s.h2}>{events.length} {events.length === 1 ? "event" : "events"}</Text>
        <View style={s.row}>
          {["agenda", "calendar"].map((v) => (
            <Touch
              key={v}
              label={`${v} view`}
              selected={mode === v}
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
              <Text style={{ color: color.ink }}>←</Text>
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
              <Text style={{ color: color.ink }}>→</Text>
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
                    selected={selected === key}
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
                        color: selected === key ? color.onInk : color.ink,
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
                            selected === key ? color.onInk : color.ink,
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
          title="Load more events"
          onPress={() => loadMore("events")}
        />
      )}
      {shown.length === 0 && (
        <Empty
          title="No events in this view"
          body={
            scope === "mine"
              ? "Try another date or filter, or load more events. Events you RSVP to appear here."
              : "Try another date or filter, or create an event."
          }
          action="Create event"
          onPress={() => nav.open({ kind: "create-event" })}
        />
      )}
      <Button
        small
        secondary
        title="Import events from a spreadsheet"
        onPress={() => nav.open({ kind: "import-events" })}
      />
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
  const cancelled = e.status === "cancelled";
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
            {cancelled && <Label dark>CANCELLED</Label>}
            {going && (
              <Label dark>
                {cancelled ? "YOU WERE GOING" : "YOU'RE GOING"}
              </Label>
            )}
            {wait && (
              <Label>{cancelled ? "WAS WAITLISTED" : "WAITLISTED"}</Label>
            )}
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
            {e.attendeeIds.length} {cancelled ? "previously going" : "going"}
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
  const { state, role, watchEvent, eventStatus, pending } = useLoop();
  useEffect(() => {
    watchEvent(id);
    return () => watchEvent(null);
  }, [id, watchEvent]);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [cancelDraft, setCancelDraft] = useState<{
    initial: LoopEvent;
    reason: string;
  } | null>(null);
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
  const cancelled = event.status === "cancelled";
  const canManage = role === "admin" || event.hostId === state.currentUserId;
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
      if (cancelled) {
        await shareCalendarFile(eventICS(event), "Share event cancellation");
        return;
      }
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
          backgroundColor: color.hero,
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
            borderColor: color.heroLine,
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
            borderColor: color.heroLine,
            transform: [{ scaleX: 0.6 }, { rotate: "40deg" }],
          }}
        />
        <Text
          style={{ fontSize: 12, letterSpacing: 5, color: color.heroMuted }}
        >
          {event.kind.toUpperCase()} / THELOOP
        </Text>
      </View>
      <Label>
        {state.conferences.find((c) => c.id === event.conferenceId)?.name ||
          "COMMUNITY EVENT"}
      </Label>
      <Text style={s.title}>{event.title}</Text>
      {cancelled && (
        <View style={s.card}>
          <Label dark>CANCELLED</Label>
          <Text style={s.h3}>This event is cancelled.</Text>
          {!!event.cancellationReason && (
            <Text style={s.body}>{event.cancellationReason}</Text>
          )}
          <Text style={s.small}>
            The details and attendee list stay available. Update or remove any
            saved device calendar entry yourself.
          </Text>
        </View>
      )}
      {!!event.updatedAt && (
        <Text style={s.small}>
          Event updated {new Date(event.updatedAt).toLocaleString()}. Saved
          device calendars do not update automatically.
        </Text>
      )}
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
        <Text style={s.h3}>{event.location}</Text>
        <Text style={s.small}>
          {cancelled
            ? `${event.attendeeIds.length} previously confirmed`
            : event.capacity > 0
              ? `${event.attendeeIds.length} of ${event.capacity} spots filled`
              : "Open invitation"}
          {event.waitlistIds.length > 0
            ? ` · ${event.waitlistIds.length} waiting`
            : ""}
        </Text>
      </View>
      {!!event.description && <Text style={s.body}>{event.description}</Text>}
      <View style={s.wrap}>
        {event.tags.map((t) => (
          <Label key={t}>#{t}</Label>
        ))}
      </View>
      <Button
        title={
          going
            ? cancelled || expired
              ? "Withdraw my RSVP"
              : "Going ✓ · Change RSVP"
            : waiting
              ? "Leave waitlist"
              : cancelled
                ? "This event is cancelled"
                : expired
                  ? "Event ended"
                  : full
                    ? "Join the waitlist"
                    : "RSVP"
        }
        disabled={(expired || cancelled) && !going && !waiting}
        onPress={() => {
          if (going || waiting) {
            Alert.alert(
              waiting ? "Leave this waitlist?" : "Withdraw your RSVP?",
              cancelled || expired
                ? "Your RSVP will be removed. This event is closed, so its waitlist will not change."
                : going
                  ? "Your RSVP will be removed. If there’s a waitlist, the next person will get your spot."
                  : "You will leave this event waitlist.",
              [
                { text: waiting ? "Stay on waitlist" : "Keep RSVP", style: "cancel" },
                {
                  text: waiting ? "Leave waitlist" : "Withdraw RSVP",
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
            title={cancelled ? "Cancellation calendar file" : "Add to calendar"}
            onPress={() => void addCalendar()}
          />
        </View>
        <View style={s.grow}>
          <Button
            secondary
            title="Share"
            onPress={() =>
              void Share.share({
                message: `${cancelled ? "CANCELLED: " : ""}${event.title}\n${new Date(event.startAt).toLocaleString()}\n${event.location}\n\n${cancelled ? event.cancellationReason || "This event has been cancelled." : event.description}\n\n${shareTargetURL({ kind: "event", id: event.id })}`,
              })
            }
          />
        </View>
      </View>
      {!cancelled && (
        <Button
          secondary
          title="Share calendar file (.ics)"
          onPress={() =>
            void shareCalendarFile(eventICS(event)).catch(() =>
              nav.toast("Calendar sharing is unavailable."),
            )
          }
        />
      )}
      <Text style={s.small}>
        Changes in TheLoop do not sync to saved device calendar entries. Update
        or remove the saved entry yourself, or share the latest calendar file.
      </Text>
      {canManage && !cancelled && !expired && (
        <Button
          secondary
          title="Edit event details"
          disabled={pending > 0}
          onPress={() => nav.open({ kind: "edit-event", id: event.id })}
        />
      )}
      {canManage && !cancelled && !expired && (
        <Button
          secondary
          title={cancelDraft ? "Keep event" : "Cancel this event"}
          disabled={pending > 0}
          onPress={() =>
            setCancelDraft((draft) =>
              draft ? null : { initial: { ...event }, reason: "" },
            )
          }
        />
      )}
      {canManage && cancelDraft && !cancelled && !expired && (
        <EventCancellation
          key={event.id}
          event={event}
          nav={nav}
          draft={cancelDraft}
          onChange={setCancelDraft}
          onDone={() => setCancelDraft(null)}
        />
      )}
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
        title={
          cancelled ? "RSVPs before cancellation" : "Attendees"
        }
        subtitle={`${event.attendeeIds.length} ${cancelled ? "planned to come" : "going"}${event.waitlistIds.length ? ` · ${event.waitlistIds.length} ${cancelled ? "were waitlisted" : "on the waitlist"}` : ""}`}
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
      {!cancelled &&
        canCheckin &&
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

function EventCancellation({
  event,
  nav,
  draft,
  onChange,
  onDone,
}: {
  event: LoopEvent;
  nav: Nav;
  draft: { initial: LoopEvent; reason: string };
  onChange: (draft: { initial: LoopEvent; reason: string }) => void;
  onDone: () => void;
}) {
  const { initial, reason } = draft;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const stale = (event.sequence ?? 0) !== (initial.sequence ?? 0);
  return (
    <View style={s.card}>
      <Text style={s.h3}>Cancel “{initial.title}”?</Text>
      <Text style={s.small}>
        Cancellation is final. The event and its attendee list stay available so
        people can understand the change. Create a new event if you want to meet
        another time.
      </Text>
      <Field
        label="Reason for cancellation · optional"
        value={reason}
        onChangeText={(value) => onChange({ initial, reason: value })}
        disabled={busy}
        multiline
        maxLength={500}
        placeholder="Let people know what changed…"
      />
      {stale && (
        <View style={{ gap: 9 }}>
          <Text style={s.small}>
            This event changed after you opened cancellation. Review its latest
            title and details before continuing.
          </Text>
          <Button
            secondary
            title="Review latest event details"
            disabled={busy}
            onPress={() => {
              onChange({ initial: { ...event }, reason });
              setError("");
            }}
          />
        </View>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={s.small}>
          {error}
        </Text>
      )}
      <Button
        title={busy ? "Cancelling…" : "Confirm event cancellation"}
        disabled={busy || stale}
        onPress={() => {
          if (new Date(event.endAt).getTime() <= Date.now()) {
            setError("This event has ended and cannot be cancelled.");
            return;
          }
          setBusy(true);
          void nav
            .run(
              {
                type: "event.cancel",
                eventId: initial.id,
                expectedSequence: initial.sequence ?? 0,
                reason,
              },
              "The event was cancelled",
            )
            .then((ok) => {
              if (!mounted.current) return;
              if (ok) onDone();
              else
                setError(
                  "The cancellation was not saved. Check the latest event details and try again.",
                );
            })
            .finally(() => {
              if (mounted.current) setBusy(false);
            });
        }}
      />
    </View>
  );
}

export { CreateEvent, EditEvent } from "./EventForm";
