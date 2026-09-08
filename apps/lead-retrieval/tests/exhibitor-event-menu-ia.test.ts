import test from "node:test";
import assert from "node:assert/strict";
import {
  EXHIBITOR_ACCOUNT_HREF,
  EXHIBITOR_EVENTS_CREATE_HREF,
  EXHIBITOR_EVENTS_ENTRY_HREF,
  exhibitorEventSettingsHref
} from "../lib/exhibitor/exhibitor-app-nav";

/**
 * IA regression: canonical routes for events index, create, account, and per-event settings (left nav).
 * Top bar dropdown only lists events + "Manage events" → /app/events; it does not link here.
 */
test("events index and create routes stay under /app/events", () => {
  assert.equal(EXHIBITOR_EVENTS_ENTRY_HREF, "/app/events");
  assert.equal(EXHIBITOR_EVENTS_CREATE_HREF, "/app/events/new");
});

test("event settings href is never the company account settings route", () => {
  assert.notEqual(exhibitorEventSettingsHref("any-event-id"), EXHIBITOR_ACCOUNT_HREF);
  assert.match(exhibitorEventSettingsHref("evt_1"), /^\/app\/events\/[^/]+\/settings$/);
});

test("account settings stay on /app/settings (not under /app/events)", () => {
  assert.equal(EXHIBITOR_ACCOUNT_HREF, "/app/settings");
  assert.equal(EXHIBITOR_ACCOUNT_HREF.startsWith("/app/events"), false);
});
