import React, { useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { useLoop } from "@theloop/client";
import {
  previewEventDraft,
  type EventDraft,
  type LoopEvent,
} from "@theloop/core";
import { Field, ModalShell } from "./ui";

function wallTime(instant: string, timezone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}${parts.second === "00" ? "" : `:${parts.second}`}`;
}

export default function EventEditor({
  initial,
  close,
  submit,
}: {
  initial?: LoopEvent;
  close: () => void;
  submit: (event: EventDraft) => Promise<boolean>;
}) {
  const { state, pending, error, clearError } = useLoop();
  const [errors, setErrors] = useState<string[]>([]),
    [failed, setFailed] = useState(false),
    [saving, setSaving] = useState(false);
  const fence = useRef(false),
    feedback = useRef<HTMLDivElement>(null);
  const timezone =
    initial?.timezone ||
    state.preferences.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const start = initial ? wallTime(initial.startAt, timezone) : "",
    end = initial ? wallTime(initial.endAt, timezone) : "";
  const tags = initial?.tags.join(", ") ?? "";
  const problem = (messages: string[]) => {
    setErrors(messages);
    requestAnimationFrame(() => feedback.current?.focus());
  };
  return (
    <ModalShell
      title={initial ? "A little update to the plan." : "Make the next plan."}
      subtitle="Bring good people together, on purpose."
      close={close}
    >
      <form
        className="modal-form"
        onChange={() => {
          setErrors([]);
          setFailed(false);
        }}
        onSubmit={async (event) => {
          event.preventDefault();
          if (fence.current || pending > 0) return;
          const form = new FormData(event.currentTarget),
            field = (name: string) => String(form.get(name) || "");
          const selectedZone = field("timezone"),
            startValue = field("start"),
            endValue = field("end"),
            startOffset = field("startOffset").trim(),
            endOffset = field("endOffset").trim();
          const result = previewEventDraft(
            {
              title: field("title"),
              description: field("description"),
              conferenceId: field("conference"),
              startAt:
                initial &&
                startValue === start &&
                selectedZone === timezone &&
                !startOffset
                  ? initial.startAt
                  : startValue + startOffset,
              endAt:
                initial &&
                endValue === end &&
                selectedZone === timezone &&
                !endOffset
                  ? initial.endAt
                  : endValue + endOffset,
              timezone: selectedZone,
              location: field("location"),
              kind: field("kind") as LoopEvent["kind"],
              capacity: field("capacity"),
              tags:
                initial && field("tags") === tags
                  ? initial.tags
                  : field("tags")
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
              url: field("url"),
            },
            {
              conferences: state.conferences,
              existingEvents: state.events.filter(
                (item) => item.id !== initial?.id,
              ),
              ...(initial ? {} : { now: new Date().toISOString() }),
            },
          );
          if (!result.event) {
            problem(
              result.errors.length
                ? result.errors
                : ["Please check the event details."],
            );
            return;
          }
          fence.current = true;
          setSaving(true);
          setFailed(false);
          clearError();
          try {
            if (!(await submit(result.event))) {
              setFailed(true);
              requestAnimationFrame(() => feedback.current?.focus());
            }
          } catch {
            setFailed(true);
          } finally {
            fence.current = false;
            setSaving(false);
          }
        }}
      >
        {(errors.length > 0 || failed) && (
          <div
            className="event-form-errors"
            ref={feedback}
            role="alert"
            tabIndex={-1}
          >
            {errors.length ? (
              <ul>
                {errors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : (
              <p>
                {error || "This plan could not be saved. Please try again."}
              </p>
            )}
          </div>
        )}
        <fieldset
          className="event-editor-fields"
          disabled={saving || pending > 0}
        >
          <Field label="Event title">
            <input
              name="title"
              defaultValue={initial?.title}
              required
              maxLength={160}
              placeholder="The coffee before the conference"
            />
          </Field>
          <Field label="What is the plan?">
            <textarea
              name="description"
              defaultValue={initial?.description}
              required
              rows={3}
              maxLength={3000}
            />
          </Field>
          <div className="form-row">
            <Field label="Starts">
              <input
                name="start"
                type="datetime-local"
                defaultValue={start}
                step="1"
                required
              />
            </Field>
            <Field label="Ends">
              <input
                name="end"
                type="datetime-local"
                defaultValue={end}
                step="1"
                required
              />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Timezone">
              <input
                name="timezone"
                defaultValue={timezone}
                maxLength={80}
                required
                list="event-editor-zones"
              />
              <datalist id="event-editor-zones">
                {[
                  "America/Chicago",
                  "America/New_York",
                  "America/Los_Angeles",
                  "Europe/London",
                  "Africa/Lagos",
                  "UTC",
                ].map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
            </Field>
            <Field label="Location">
              <input
                name="location"
                defaultValue={initial?.location}
                required
                maxLength={240}
              />
            </Field>
          </div>
          <details className="event-offsets">
            <summary>Clock change? Choose an explicit UTC offset</summary>
            <p>
              Usually you can leave these blank. For a time that occurs twice,
              use its exact offset, such as −05:00 or −06:00. An explicit offset
              determines the instant; the timezone controls how the plan is
              displayed.
            </p>
            <div className="form-row">
              <Field label="Start offset · optional">
                <input
                  name="startOffset"
                  placeholder="-05:00"
                  pattern="[+-][0-9]{2}:[0-9]{2}"
                  maxLength={6}
                />
              </Field>
              <Field label="End offset · optional">
                <input
                  name="endOffset"
                  placeholder="-06:00"
                  pattern="[+-][0-9]{2}:[0-9]{2}"
                  maxLength={6}
                />
              </Field>
            </div>
          </details>
          <div className="form-row">
            <Field label="Conference or hub">
              <select name="conference" defaultValue={initial?.conferenceId}>
                {state.conferences.map((conference) => (
                  <option key={conference.id} value={conference.id}>
                    {conference.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Kind">
              <select name="kind" defaultValue={initial?.kind ?? "meetup"}>
                {["meetup", "workshop", "social", "conference"].map((kind) => (
                  <option key={kind} value={kind}>
                    {kind[0].toUpperCase() + kind.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Capacity · 0 for unlimited">
              <input
                name="capacity"
                type="number"
                min={0}
                max={1000}
                defaultValue={initial?.capacity ?? 30}
                required
              />
            </Field>
          </div>
          <Field label="Event website · optional">
            <input
              name="url"
              type="url"
              maxLength={2048}
              defaultValue={initial?.url}
              placeholder="https://…"
            />
          </Field>
          <Field label="Tags · separated by commas">
            <input
              name="tags"
              maxLength={190}
              defaultValue={tags}
              placeholder="Coffee, Community"
            />
            <small>Up to 6 tags, with 30 characters each.</small>
          </Field>
          <button className="button primary" disabled={saving || pending > 0}>
            {saving
              ? "Saving the plan…"
              : initial
                ? "Save the plan"
                : "Put it on the calendar"}
            <ArrowUpRight size={16} />
          </button>
        </fieldset>
      </form>
    </ModalShell>
  );
}
