import {
  previewEventCSV,
  type EventCSVOptions,
  type EventDraft,
} from "./import";
import type { LoopEvent } from "./types";

export type EventFormValues = {
  conferenceId: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  timezone: string;
  location: string;
  kind: LoopEvent["kind"];
  capacity: string | number;
  tags?: string[];
  url?: string;
};

/** Manual entry and spreadsheet import use the same strict timezone/date rules. */
export function previewEventDraft(
  values: EventFormValues,
  options: EventCSVOptions,
): {
  event?: EventDraft;
  errors: string[];
  duplicate: boolean;
} {
  if (values.tags?.some((tag) => tag.includes("|")))
    return {
      errors: ["Tags cannot contain the | separator."],
      duplicate: false,
    };
  const keys = [
    "conferenceId",
    "title",
    "description",
    "startAt",
    "endAt",
    "timezone",
    "location",
    "kind",
    "capacity",
    "tags",
    "url",
  ] as const;
  const csv = `${keys.join(",")}\n${keys.map((key) => `"${String(key === "tags" ? (values.tags ?? []).join("|") : (values[key] ?? "")).replace(/"/g, '""')}"`).join(",")}`;
  const preview = previewEventCSV(csv, options),
    row = preview.rows[0];
  return {
    ...(row?.event ? { event: row.event } : {}),
    errors: [...preview.errors, ...(row?.errors ?? [])],
    duplicate: row?.duplicate ?? false,
  };
}
