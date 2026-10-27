import test from "node:test";
import assert from "node:assert/strict";
import { absoluteEventInstant, calendarDate } from "../src/eventDates";
import { DomainError } from "../src/policy";

test("conference days reject impossible dates without silently moving to another month", () => {
  for (const value of [
    "2024-02-29",
    "2026-11-02",
    "0099-12-31",
    "2000-02-29",
  ]) {
    assert.equal(calendarDate(value, "Start"), value);
  }
  for (const value of [
    "2026-02-30",
    "2025-02-29",
    "1900-02-29",
    "2026-04-31",
    "2026-00-01",
    "2026-13-01",
    "2026-01-00",
    "2026-1-02",
    "11/02/2026",
    "2026-11-02T00:00Z",
  ]) {
    assert.throws(
      () => calendarDate(value, "Start"),
      (error) =>
        error instanceof DomainError && error.code === "invalid-argument",
      value,
    );
  }
});

test("absolute event dates normalize explicit offsets and valid leap dates without using the server timezone", () => {
  assert.equal(
    absoluteEventInstant("2026-11-01T01:30:00-05:00", "Start"),
    "2026-11-01T06:30:00.000Z",
  );
  assert.equal(
    absoluteEventInstant("2026-11-01T01:30:00-06:00", "Start"),
    "2026-11-01T07:30:00.000Z",
  );
  assert.equal(
    absoluteEventInstant("2024-02-29T23:30:00.123+02:00", "Start"),
    "2024-02-29T21:30:00.123Z",
  );
  assert.equal(
    absoluteEventInstant("2026-01-01T00:30+01:00", "Start"),
    "2025-12-31T23:30:00.000Z",
  );
  assert.equal(
    absoluteEventInstant("2026-10-26T12:00:00.1Z", "Start"),
    "2026-10-26T12:00:00.100Z",
  );
  assert.equal(
    absoluteEventInstant("0099-01-01T00:00:00Z", "Start"),
    "0099-01-01T00:00:00.000Z",
  );
});

test("absolute event dates reject rollover, zone-less dates, invalid offsets, ambiguous formats and unsupported clock values", () => {
  for (const input of [
    "2026-02-30T12:00:00Z",
    "2025-02-29T12:00:00Z",
    "2026-04-31T12:00:00Z",
    "2026-00-01T12:00:00Z",
    "2026-13-01T12:00:00Z",
    "2026-01-00T12:00:00Z",
    "2026-10-26T12:00:00",
    "2026-10-26",
    "10/26/2026 12:00",
    "Mon, 26 Oct 2026 12:00:00 GMT",
    "2026-10-26T24:00:00Z",
    "2026-10-26T12:60:00Z",
    "2026-10-26T12:00:60Z",
    "2026-10-26T12:00:00+24:00",
    "2026-10-26T12:00:00+05:60",
    "2026-10-26T12:00:00-99:99",
    "2026-10-26T12:00:00+0500",
    "2026-10-26T12:00:00.1234Z",
    "0000-01-01T00:00:00+01:00",
  ])
    assert.throws(
      () => absoluteEventInstant(input, "Start"),
      (error) =>
        error instanceof DomainError && error.code === "invalid-argument",
      input,
    );
});
