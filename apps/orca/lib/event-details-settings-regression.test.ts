import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseEventDateOnly, serializeEventDateOnly } from "@/lib/event-date-only";

const pageSource = readFileSync("app/(shell)/events/[eventId]/settings/page.tsx", "utf8");
const hubSource = readFileSync("app/(shell)/events/[eventId]/settings/_components/event-settings-hub.tsx", "utf8");
const routeSource = readFileSync("app/api/events/[eventId]/route.ts", "utf8");
const serviceSource = readFileSync("lib/events.ts", "utf8");

test("event settings loads the canonical Event record and renders Event details first", () => {
  assert.match(pageSource, /getEventSettingsById\(eventId\)/);
  assert.match(pageSource, /serializeEventDateOnly\(event\.startDate\)/);
  assert.match(pageSource, /listClientsForEventOrganization\(event\.orgId\)/);
  assert.ok(hubSource.indexOf("<EventDetailsSettings") < hubSource.indexOf("eyebrow={props.initialTerminology.terms.runOfShow}"));
  assert.match(hubSource, /Event name/);
  assert.match(hubSource, /Start date/);
  assert.match(hubSource, /End date/);
  assert.match(hubSource, /Time zone/);
  assert.match(hubSource, /Location \/ venue/);
  assert.match(hubSource, /Event status/);
});

test("event details save through the canonical authorized PATCH path", () => {
  assert.match(hubSource, /fetch\(`\/api\/events\/\$\{eventId\}`/);
  assert.match(hubSource, /method: "PATCH"/);
  assert.match(hubSource, /router\.refresh\(\)/);
  assert.match(pageSource, /resolveEventAccessForUser/);
  assert.match(pageSource, /canEdit = decision\.canEdit/);
  assert.match(routeSource, /requireEventRouteAccess\(nextRequest, eventId, "write"\)/);
  assert.match(routeSource, /updateEvent\(eventId, data, actorUserId/);
});

test("event details validate unchanged forms, required names, and invalid date ranges", () => {
  assert.match(hubSource, /const isDirty = JSON\.stringify\(values\) !== JSON\.stringify\(savedValues\)/);
  assert.match(hubSource, /disabled=\{!canEdit \|\| !isDirty \|\| state === "saving"\}/);
  assert.match(hubSource, /Event name is required\./);
  assert.match(hubSource, /Start date cannot be after end date\./);
  assert.match(serviceSource, /nextStartDate\.getTime\(\) > nextEndDate\.getTime\(\)/);
});

test("event calendar dates remain the selected date in every browser timezone", () => {
  const selected = "2026-09-17";
  assert.equal(parseEventDateOnly(selected)?.toISOString(), "2026-09-17T00:00:00.000Z");
  assert.equal(serializeEventDateOnly(new Date("2026-09-17T00:00:00.000Z")), selected);
  assert.equal(parseEventDateOnly("2026-09-31"), null);
  assert.match(routeSource, /parseEventDateOnly\(startDate\)/);
  assert.match(routeSource, /parseEventDateOnly\(endDate\)/);
  assert.match(hubSource, /Dates are saved as event calendar days\./);
});

test("Event client assignment is organization-scoped and status/timezone use supported values", () => {
  assert.match(serviceSource, /where: \{ id: data\.clientId, orgId: before\.orgId \}/);
  assert.match(routeSource, /isSupportedTimezone\(timezone\)/);
  assert.match(routeSource, /status must be a supported event status/);
});
