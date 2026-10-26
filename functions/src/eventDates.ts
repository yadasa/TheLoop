import { assert, text } from "./policy";

/** Absolute ISO instant only: validate wall components before offset conversion to reject rollover. */
export function absoluteEventInstant(value: unknown, label: string): string {
  const input = text(value, label, 40);
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/i.exec(
      input,
    );
  assert(
    match,
    "invalid-argument",
    `${label} must be an ISO time with an explicit Z or UTC offset.`,
  );
  const [year, month, day, hour, minute, second] = [
    match[1],
    match[2],
    match[3],
    match[4],
    match[5],
    match[6] || "0",
  ].map(Number);
  const millisecond = Number((match[7] || "").padEnd(3, "0"));
  const wall = new Date(0);
  wall.setUTCFullYear(year, month - 1, day);
  wall.setUTCHours(hour, minute, second, millisecond);
  assert(
    month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      hour <= 23 &&
      minute <= 59 &&
      second <= 59 &&
      wall.getUTCFullYear() === year &&
      wall.getUTCMonth() === month - 1 &&
      wall.getUTCDate() === day,
    "invalid-argument",
    `${label} must use a real calendar date and time.`,
  );
  const suffix = match[8];
  if (suffix.toUpperCase() === "Z") return wall.toISOString();
  const offsetHour = Number(suffix.slice(1, 3)),
    offsetMinute = Number(suffix.slice(4, 6));
  assert(
    offsetHour <= 23 && offsetMinute <= 59,
    "invalid-argument",
    `${label} has an invalid UTC offset.`,
  );
  const offset =
    (offsetHour * 60 + offsetMinute) * 60000 * (suffix[0] === "+" ? 1 : -1);
  const instant = new Date(wall.getTime() - offset);
  assert(
    instant.getUTCFullYear() >= 0 && instant.getUTCFullYear() <= 9999,
    "invalid-argument",
    `${label} is outside the supported calendar range.`,
  );
  return instant.toISOString();
}
