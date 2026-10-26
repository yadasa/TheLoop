import React, { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLoop } from "@theloop/client";
import { previewEventDraft, type LoopEvent } from "@theloop/core";
import { Button, Chip, Empty, Field, Horizontal, Label, s } from "./ui";
import { DetailState, type DetailStatus } from "./DetailState";
import type { Nav } from "./navigation";

function copyEvent(event: LoopEvent): LoopEvent {
  return {
    ...event,
    tags: [...event.tags],
    attendeeIds: [...event.attendeeIds],
    waitlistIds: [...event.waitlistIds],
  };
}

function localEventTime(instant: string, timezone: string): string {
  const date = new Date(instant);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const precision = date.getUTCMilliseconds();
  const seconds =
    parts.second !== "00" || precision
      ? `:${parts.second}${precision ? `.${String(precision).padStart(3, "0")}` : ""}`
      : "";
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}${seconds}`;
}

export function CreateEvent({ nav }: { nav: Nav }) {
  const { state } = useLoop();
  if (!state.conferences.length)
    return (
      <ScrollView contentContainerStyle={s.content}>
        <Empty
          title="No conferences yet"
          body="An organizer needs to add a conference before you can create an event. You can still browse public AfroTech events."
          action="Browse AfroTech.guide"
          onPress={() => nav.open({ kind: "guide" })}
        />
      </ScrollView>
    );
  return <EventEditor nav={nav} />;
}

export function EditEvent({ id, nav }: { id: string; nav: Nav }) {
  const { state, watchEvent, eventStatus } = useLoop();
  const initial = useRef<LoopEvent | null>(null);
  const [revision, setRevision] = useState(0);
  const event = state.events.find((record) => record.id === id);
  const confirmed =
    eventStatus.id === id &&
    !eventStatus.loading &&
    !eventStatus.error &&
    !eventStatus.notFound;
  if (!initial.current && confirmed && event)
    initial.current = copyEvent(event);
  useEffect(() => {
    watchEvent(id);
    return () => watchEvent(null);
  }, [id, watchEvent]);
  if (!initial.current)
    return (
      <DetailState
        kind="event"
        id={id}
        status={eventStatus}
        retry={() => watchEvent(id)}
      />
    );
  return (
    <EventEditor
      key={`${id}:${revision}`}
      nav={nav}
      initial={initial.current}
      current={event}
      status={eventStatus}
      retry={() => watchEvent(id)}
      onReload={() => {
        if (confirmed && event) {
          initial.current = copyEvent(event);
          setRevision((value) => value + 1);
        } else watchEvent(id);
      }}
    />
  );
}

function EventEditor({
  nav,
  initial,
  current,
  status,
  retry,
  onReload,
}: {
  nav: Nav;
  initial?: LoopEvent;
  current?: LoopEvent;
  status?: DetailStatus;
  retry?: () => void;
  onReload?: () => void;
}) {
  const { state, role } = useLoop();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [conferenceId, setConference] = useState(
    initial?.conferenceId || state.conferences[0]?.id || "",
  );
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [location, setLocation] = useState(initial?.location || "");
  const [url, setUrl] = useState(initial?.url || "");
  const [tags, setTags] = useState(initial?.tags.join(", ") || "");
  const [initialStart] = useState(() =>
    initial ? localEventTime(initial.startAt, initial.timezone) : "",
  );
  const [initialEnd] = useState(() =>
    initial ? localEventTime(initial.endAt, initial.timezone) : "",
  );
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [capacity, setCapacity] = useState(String(initial?.capacity ?? 30));
  const [kind, setKind] = useState<LoopEvent["kind"]>(
    initial?.kind || "meetup",
  );
  const [timezone, setTimezone] = useState(
    () =>
      initial?.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "UTC",
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const edit = (update: (value: string) => void) => (value: string) => {
    update(value);
    setErrors([]);
  };
  const cancelled =
    current?.status === "cancelled" || initial?.status === "cancelled";
  const ended =
    !!initial &&
    new Date(current?.endAt || initial.endAt).getTime() <= Date.now();
  const stale =
    !!initial &&
    !!current &&
    (initial.sequence ?? 0) !== (current.sequence ?? 0);
  const locked = busy || cancelled || ended;
  if (
    initial &&
    status &&
    (status.id !== initial.id ||
      status.loading ||
      status.error ||
      status.notFound ||
      !current)
  )
    return (
      <DetailState
        kind="event"
        id={initial.id}
        status={status}
        retry={retry!}
      />
    );
  if (initial && role !== "admin" && current?.hostId !== state.currentUserId)
    return (
      <Empty
        title="You can’t edit this event"
        body="Only the event host or an administrator can change its details."
      />
    );
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.content}
    >
      <Text style={s.title}>
        {initial ? "Edit event" : "Create event"}
      </Text>
      {initial && (
        <Text style={s.small}>
          Changes will be reflected in TheLoop. Saved device calendar entries
          need updating separately.
        </Text>
      )}
      {stale && (
        <View style={s.card} accessibilityRole="alert">
          <Text style={s.h3}>This event was updated</Text>
          <Text style={s.small}>
            Your draft is still here. Load the latest details before saving a
            new version.
          </Text>
          <Button
            secondary
            title="Use latest details · discard this draft"
            disabled={busy}
            onPress={() => onReload?.()}
          />
        </View>
      )}
      {(cancelled || ended) && (
        <View style={s.card}>
          <Label dark>{cancelled ? "CANCELLED" : "EVENT ENDED"}</Label>
          <Text style={s.small}>
            {cancelled
              ? "Cancelled events cannot be reopened or edited. The event details and attendee list stay available."
              : "This event has ended. Its details stay available in the calendar."}
          </Text>
        </View>
      )}
      {initial ? (
        <View style={s.card}>
          <Text style={s.label}>Conference · stays the same</Text>
          <Text style={s.body}>
            {state.conferences.find((c) => c.id === conferenceId)?.name ||
              "Community hub"}
          </Text>
        </View>
      ) : (
        <Horizontal>
          {state.conferences.map((c) => (
            <Chip
              key={c.id}
              title={c.shortName}
              selected={conferenceId === c.id}
              onPress={() => {
                if (!locked) {
                  setConference(c.id);
                  setErrors([]);
                }
              }}
            />
          ))}
        </Horizontal>
      )}
      <Field
        label="Event name"
        value={title}
        onChangeText={edit(setTitle)}
        disabled={locked}
        placeholder="Coffee before the keynote"
        maxLength={160}
      />
      <Field
        label="Description · optional"
        value={description}
        onChangeText={edit(setDescription)}
        disabled={locked}
        maxLength={5000}
        multiline
      />
      <Field
        label="Location"
        value={location}
        onChangeText={edit(setLocation)}
        disabled={locked}
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
              if (!locked) {
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
        disabled={locked}
        maxLength={2048}
        keyboardType="url"
        placeholder="https://…"
      />
      <Field
        label="Tags · comma separated"
        value={tags}
        onChangeText={edit(setTags)}
        disabled={locked}
        placeholder="Founders, Coffee, Networking"
      />
      <Text style={s.small}>
        Add up to 6 tags, each up to 30 characters. Event websites use HTTPS.
      </Text>
      <Field
        label="Event timezone · IANA name"
        value={timezone}
        onChangeText={edit(setTimezone)}
        disabled={locked}
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
              if (!locked) {
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
        disabled={locked}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="2026-11-05 18:00"
        maxLength={40}
      />
      <Field
        label="Ends · YYYY-MM-DD HH:mm"
        value={end}
        onChangeText={edit(setEnd)}
        disabled={locked}
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
        disabled={locked}
        keyboardType="numeric"
        maxLength={4}
      />
      <Text style={s.small}>
        Capacity can be 0 to 1,000. A waitlist opens automatically when the
        event fills up.
      </Text>
      {initial && (
        <Text style={s.small}>
          {(current || initial).attendeeIds.length} confirmed. Finite capacity
          must cover everyone already confirmed. Increasing capacity promotes
          the earliest waitlisted members.
        </Text>
      )}
      {errors.length > 0 && (
        <View style={s.card} accessibilityRole="alert">
          <Text style={s.h3}>Check these details</Text>
          {errors.map((error, index) => (
            <Text key={`${index}:${error}`} style={s.small}>
              {error}
            </Text>
          ))}
        </View>
      )}
      <Button
        title={
          busy
            ? initial
              ? "Saving changes…"
              : "Creating…"
            : initial
              ? "Save event changes"
              : "Create event"
        }
        disabled={
          locked ||
          stale ||
          !title.trim() ||
          !location.trim() ||
          !start ||
          !end ||
          !timezone.trim() ||
          !capacity.trim() ||
          !conferenceId
        }
        onPress={() => {
          if (locked || stale) return;
          const preserveStart =
            !!initial &&
            start.trim() === initialStart &&
            timezone.trim() === initial.timezone;
          const preserveEnd =
            !!initial &&
            end.trim() === initialEnd &&
            timezone.trim() === initial.timezone;
          const result = previewEventDraft(
            {
              conferenceId,
              title,
              description,
              location,
              kind,
              capacity,
              startAt: preserveStart ? initial!.startAt : start,
              endAt: preserveEnd ? initial!.endAt : end,
              timezone,
              tags:
                initial && tags === initial.tags.join(", ")
                  ? initial.tags
                  : tags
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
              url,
            },
            {
              conferences: state.conferences,
              existingEvents: state.events.filter(
                (event) => event.id !== initial?.id,
              ),
              ...(initial ? {} : { now: new Date().toISOString() }),
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
          if (initial && new Date(result.event.endAt).getTime() <= Date.now()) {
            setErrors(["An edited event must end in the future."]);
            return;
          }
          if (
            initial &&
            result.event.capacity > 0 &&
            result.event.capacity < (current || initial).attendeeIds.length
          ) {
            setErrors([
              "Capacity cannot be smaller than the confirmed attendee count. Use 0 for unlimited.",
            ]);
            return;
          }
          const { conferenceId: _conferenceId, ...details } = result.event;
          if (preserveStart) details.startAt = initial!.startAt;
          if (preserveEnd) details.endAt = initial!.endAt;
          setErrors([]);
          setBusy(true);
          void nav
            .run(
              initial
                ? {
                    type: "event.edit",
                    eventId: initial.id,
                    expectedSequence: initial.sequence ?? 0,
                    event: { ...details, url: url.trim() },
                  }
                : {
                    type: "event.create",
                    event: result.event,
                  },
              initial ? "Event details updated" : "Event created",
            )
            .then((ok) => {
              if (!mounted.current) return;
              if (ok) {
                // The editor is mounted only for this route instance.
                if (initial) nav.close();
                else nav.closeIfTop("create-event");
              } else
                setErrors([
                  "Your changes were not saved. Your draft is still here; check the latest event details or try again.",
                ]);
            })
            .finally(() => {
              if (mounted.current) setBusy(false);
            });
        }}
      />
      {initial && (
        <Button
          secondary
          title="Back to event"
          disabled={busy}
          onPress={nav.close}
        />
      )}
    </ScrollView>
  );
}
