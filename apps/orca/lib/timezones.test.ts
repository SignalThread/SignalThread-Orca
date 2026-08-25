import assert from "node:assert/strict";
import test from "node:test";
import {
  FALLBACK_EVENT_CREATION_TIMEZONE,
  formatTimezoneLabel,
  getDefaultTimezone,
  getEventCreationDefaultTimezone,
  getTimezoneOptions,
  isSupportedTimezone,
} from "./timezones";

test("timezone options include browser-safe IANA values and readable labels", () => {
  const options = getTimezoneOptions();
  assert.ok(options.length > 0);
  const eastern = options.find((option) => option.value === "America/New_York");
  assert.ok(eastern);
  assert.equal(eastern!.label, "Eastern Time — America/New_York");
  assert.equal(options.find((option) => option.value === "America/Chicago")?.label, "Central Time — America/Chicago");
  assert.equal(options.find((option) => option.value === "America/Denver")?.label, "Mountain Time — America/Denver");
  assert.equal(options.find((option) => option.value === "America/Los_Angeles")?.label, "Pacific Time — America/Los_Angeles");
  assert.equal(options.find((option) => option.value === "America/Anchorage")?.label, "Alaska Time — America/Anchorage");
  assert.equal(options.find((option) => option.value === "Pacific/Honolulu")?.label, "Hawaii Time — Pacific/Honolulu");
  assert.equal(options.find((option) => option.value === "America/Phoenix")?.label, "Arizona — America/Phoenix");
});

test("supported timezone validation accepts IANA values and rejects arbitrary text", () => {
  assert.equal(isSupportedTimezone("America/New_York"), true);
  assert.equal(isSupportedTimezone("Eastern Time"), false);
});

test("default timezone resolves only to a supported IANA value or empty", () => {
  const defaultTimezone = getDefaultTimezone();
  assert.equal(defaultTimezone === "" || isSupportedTimezone(defaultTimezone), true);
});

test("default timezone is empty when browser timezone is unsupported", () => {
  const originalDateTimeFormat = Intl.DateTimeFormat;
  try {
    Intl.DateTimeFormat = (() => ({
      resolvedOptions: () => ({ timeZone: "Not/AZone" }),
    })) as unknown as typeof Intl.DateTimeFormat;
    assert.equal(getDefaultTimezone(), "");
  } finally {
    Intl.DateTimeFormat = originalDateTimeFormat;
  }
});

test("event creation timezone default always resolves to a supported value", () => {
  const value = getEventCreationDefaultTimezone();
  assert.equal(isSupportedTimezone(value), true);
  assert.equal(FALLBACK_EVENT_CREATION_TIMEZONE, "America/New_York");
});

test("formatTimezoneLabel keeps the stored IANA value visible", () => {
  assert.match(formatTimezoneLabel("America/Los_Angeles"), /America\/Los_Angeles/);
});
