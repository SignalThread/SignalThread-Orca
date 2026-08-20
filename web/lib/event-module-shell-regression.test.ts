import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const switcherSource = readFileSync("app/(shell)/events/[eventId]/_components/event-module-switcher.tsx", "utf8");
const headerSource = readFileSync("app/(shell)/events/[eventId]/_components/event-module-header.tsx", "utf8");
const shellSource = readFileSync("app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx", "utf8");
const budgetPageSource = readFileSync("app/(shell)/events/[eventId]/budget/page.tsx", "utf8");
const budgetHeaderSource = readFileSync("app/(shell)/events/[eventId]/budget/_components/budget-page-header.tsx", "utf8");
const budgetViewSwitchSource = readFileSync("app/(shell)/events/[eventId]/budget/_components/budget-view-switch.tsx", "utf8");
const timelinePageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
const matrixPageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");

test("shared event module switcher uses Roadmap, Budget, and the event Run of Show label with blue active styling", () => {
  for (const label of ['label: "Roadmap"', 'label: "Budget"', "label: runOfShowLabel"]) {
    assert.equal(switcherSource.includes(label), true, label);
  }
  assert.equal(switcherSource.includes('href: `/events/${eventId}/timeline`'), true);
  assert.equal(switcherSource.includes('href: `/events/${eventId}/budget`'), true);
  assert.equal(switcherSource.includes('href: `/events/${eventId}/matrix`'), true);
  assert.equal(switcherSource.includes("EVENT_MODULE_PRIMARY_CLASS"), true);
  assert.equal(switcherSource.includes('label: "Timeline"'), false);
});

test("event workspace shell renders the shared switcher component", () => {
  assert.equal(shellSource.includes('import { EventModuleSwitcher } from "./event-module-switcher";'), true);
  assert.equal(shellSource.includes("<EventModuleSwitcher eventId={eventId} runOfShowLabel={terms.runOfShow} />"), true);
  assert.equal(shellSource.includes('label: "Roadmap"'), true);
});

test("event selector uses All events as its only return path", () => {
  const expandedHubStart = shellSource.indexOf('aria-label="Open current event context"');
  const expandedHubEnd = shellSource.indexOf("{selectorOpen ?", expandedHubStart);
  const expandedHubSource = shellSource.slice(expandedHubStart, expandedHubEnd);
  const collapsedHubStart = shellSource.indexOf('id="current-event-popover-title"');
  const collapsedHubEnd = shellSource.indexOf("</section>", collapsedHubStart);
  const collapsedHubSource = shellSource.slice(collapsedHubStart, collapsedHubEnd);

  assert.equal(shellSource.includes('aria-label="Back to Events"'), false);
  assert.equal(shellSource.includes("<ArrowLeft"), false);
  assert.equal(expandedHubSource.includes('href="/events"'), true);
  assert.equal(expandedHubSource.includes('aria-label="Go to all events"'), true);
  assert.equal(expandedHubSource.includes("All events"), true);
  assert.equal(expandedHubSource.includes("Command Center"), false);
  assert.equal(collapsedHubSource.includes('href="/events"'), true);
  assert.equal(collapsedHubSource.includes("Go to all events"), true);
  assert.equal(collapsedHubSource.includes("Go to Command Center"), false);
  assert.equal(shellSource.includes('aria-label="Open current event context"'), true);
  assert.equal(shellSource.includes('aria-label="Current event"'), true);
  assert.equal(shellSource.includes("collapsedHubOpen"), true);
  assert.equal(shellSource.includes("current-event-popover"), true);
  assert.equal(shellSource.includes("formatEventMetadata(currentEvent)"), true);
  assert.equal(shellSource.includes("getEventInitials"), true);
});

test("collapsed event sidebar stacks logo, arrow, divider, then current event hub", () => {
  assert.equal(shellSource.includes('isCollapsed ? "flex flex-col items-center gap-3 px-2 py-4" : "px-4 py-4"'), true);
  assert.equal(shellSource.includes('isCollapsed ? "" : "absolute right-4 top-1/2 -translate-y-1/2"'), true);
  assert.equal(shellSource.includes('isCollapsed ? "right-2 top-2"'), false);

  const headerStart = shellSource.indexOf('aria-label="OrcaOS dashboard"');
  const collapseStart = shellSource.indexOf('aria-label={isCollapsed ? "Expand event sidebar" : "Collapse event sidebar"}');
  const hubStart = shellSource.indexOf('aria-label="Current event"');

  assert.ok(headerStart > -1, "collapsed header logo link exists");
  assert.ok(collapseStart > headerStart, "collapse arrow renders after the logo");
  assert.ok(hubStart > collapseStart, "calendar event hub renders below the collapse arrow");
});

test("event directory sidebar groups active items before upcoming items", () => {
  const speakersIndex = shellSource.indexOf('label: "Speakers"');
  const attendeesIndex = shellSource.indexOf('label: "Attendees"');
  const staffingIndex = shellSource.indexOf('label: "Staffing"');
  const exhibitorsIndex = shellSource.indexOf('label: "Exhibitors"');

  assert.ok(speakersIndex > -1, "Speakers child item exists");
  assert.ok(attendeesIndex > speakersIndex, "Attendees follows Speakers");
  assert.ok(staffingIndex > attendeesIndex, "Staffing follows active directory items");
  assert.ok(exhibitorsIndex > staffingIndex, "Exhibitors follows Staffing");

  const staffingBlock = shellSource.slice(staffingIndex, exhibitorsIndex);
  assert.equal(staffingBlock.includes('badge: "Coming soon"'), true);
  assert.equal(staffingBlock.includes("disabled: true"), true);
  assert.equal(staffingBlock.includes("/staffing"), false);

  const attendeesBlock = shellSource.slice(attendeesIndex, staffingIndex);
  assert.equal(attendeesBlock.includes('href: `/events/${eventId}/attendees`'), true);
  assert.equal(attendeesBlock.includes("active: (currentPathname) => isPathActive(currentPathname, `/events/${eventId}/attendees`)"), true);
  assert.equal(attendeesBlock.includes('badge: "Coming soon"'), false);
  assert.equal(attendeesBlock.includes("disabled: true"), false);
  assert.equal(shellSource.includes('href={`/events/${eventId}/directory`}'), true);
  assert.equal(shellSource.includes('aria-label={isEventDirectoryOpen ? "Collapse Event Directory" : "Expand Event Directory"}'), true);
});

test("Roadmap, Budget, and Run of Show pages share the event module header shell", () => {
  assert.equal(headerSource.includes("export function EventModuleHeader"), true);
  assert.equal(headerSource.includes("export function EventModuleSurface"), true);
  for (const className of [
    "eventModuleSwitcher",
    "eventModuleShell",
    "eventModuleHeader",
    "eventModuleHeaderLeft",
    "eventModuleHeaderStats",
    "eventModuleHeaderActions",
    "eventModuleControlRow",
    "eventModuleViewToggle",
  ]) {
    assert.equal(headerSource.includes(className) || switcherSource.includes(className), true, className);
  }
  assert.equal(budgetHeaderSource.includes('import { EventModuleHeader } from "../../_components/event-module-header";'), true);
  assert.equal(budgetPageSource.includes('import { EventModuleSurface } from "../_components/event-module-header";'), true);
  assert.equal(timelinePageSource.includes("EventModuleHeader") && timelinePageSource.includes("EventModuleSurface"), true);
  assert.equal(matrixPageSource.includes("EventModuleHeader") && matrixPageSource.includes("EventModuleSurface"), true);
});

test("roadmap module copy and primary action use the harmonized event module styling", () => {
  assert.equal(timelinePageSource.includes('title="Roadmap"'), true);
  assert.equal(timelinePageSource.includes('badge="Command Center"'), true);
  assert.equal(timelinePageSource.includes("openCreateItemModal"), true);
  assert.equal(timelinePageSource.includes("Add Timeline Item"), false);
  assert.equal(timelinePageSource.includes("EVENT_MODULE_PRIMARY_CLASS"), true);
  assert.equal(timelinePageSource.includes('{ value: "LIST", label: "Matrix" }'), true);
  assert.equal(timelinePageSource.includes('{ value: "TIMELINE", label: "Workstream" }'), true);
});

test("Budget view toggle uses shared primary blue instead of black active states", () => {
  assert.equal(budgetViewSwitchSource.includes("EVENT_MODULE_PRIMARY_CLASS"), true);
  assert.equal(budgetViewSwitchSource.includes("eventModuleClasses.viewToggle"), true);
  assert.equal(budgetViewSwitchSource.includes("bg-slate-900"), false);
  assert.equal(budgetViewSwitchSource.includes("bg-slate-800"), false);
  assert.equal(budgetViewSwitchSource.includes("budget?view=grid"), true);
});
