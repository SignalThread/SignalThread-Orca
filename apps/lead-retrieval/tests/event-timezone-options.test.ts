import test from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_TIMEZONE_OPTIONS,
  eventTimezoneLabel,
  findEventTimezoneOption
} from "@/lib/events/event-timezone-options";

test("existing America/New_York displays as Eastern Time", () => {
  assert.equal(eventTimezoneLabel("America/New_York"), "Eastern Time");
});

test("Pacific Time and Arizona map to their canonical IANA values", () => {
  assert.equal(findEventTimezoneOption("America/Los_Angeles")?.label, "Pacific Time");
  assert.equal(EVENT_TIMEZONE_OPTIONS.find((option) => option.label === "Pacific Time")?.value, "America/Los_Angeles");
  assert.equal(EVENT_TIMEZONE_OPTIONS.find((option) => option.label === "Arizona")?.value, "America/Phoenix");
});

test("an existing timezone outside the curated list is preserved with a clear fallback label", () => {
  assert.equal(findEventTimezoneOption("Europe/London"), null);
  assert.equal(eventTimezoneLabel("Europe/London"), "Other — Europe/London");
});
