import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { EXHIBITOR_EVENTS_ENTRY_HREF } from "../lib/exhibitor/exhibitor-app-nav";

const repoRoot = process.cwd();
const topBarSrc = readFileSync(
  path.join(repoRoot, "components/layout/exhibitor-app-top-bar-event-slot.tsx"),
  "utf8"
);

const forbiddenMenuCopy = [
  "Event settings",
  "View all events",
  "Create event",
  "Current event",
  "CURRENT EVENT",
  "Switch event",
  "exhibitorEventSettingsHref",
  "EXHIBITOR_ACCOUNT_HREF",
  "EXHIBITOR_EVENTS_CREATE_HREF",
  ">Account<"
];

test("top bar event menu: no removed / forbidden items; Manage link gated on showManageEventsLink", () => {
  for (const needle of forbiddenMenuCopy) {
    assert.equal(
      topBarSrc.includes(needle),
      false,
      `top bar dropdown must not contain "${needle}"`
    );
  }
  assert.match(topBarSrc, /Manage/);
  assert.match(topBarSrc, /showManageEventsLink/);
  assert.match(topBarSrc, /showManageEventsLink \? \(/);
  assert.match(topBarSrc, /href=\{EXHIBITOR_EVENTS_ENTRY_HREF\}/);
});

test("Manage events routes to /app/events", () => {
  assert.equal(EXHIBITOR_EVENTS_ENTRY_HREF, "/app/events");
});

test("top bar maps over accessibleEvents for selectable rows", () => {
  assert.match(topBarSrc, /accessibleEvents\.map/);
  assert.match(topBarSrc, /navigateToEvent/);
});

test("event selection from account routes uses the canonical open-event destination", () => {
  assert.match(topBarSrc, /exhibitorOpenEventHref/);
  assert.match(topBarSrc, /router\.push\(exhibitorOpenEventHref\(eventId\)\)/);
  assert.doesNotMatch(topBarSrc, /else\s*\{\s*router\.refresh\(\);\s*\}/);
});

test("event switcher uses checkmark selection + neutral gray styling (no accent blocks)", () => {
  assert.match(topBarSrc, /<Check /);
  assert.match(topBarSrc, /min-w-\[220px\]/);
  assert.match(topBarSrc, /max-w-\[300px\]/);
  assert.match(topBarSrc, /hover:bg-gray-100/);
  assert.equal(topBarSrc.includes("bg-accentSoft"), false);
  assert.equal(topBarSrc.includes("text-accent"), false);
});
