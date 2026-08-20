import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webFile = (path: string) => new URL(`../${path}`, import.meta.url);

test("event launchers validate responses and expose distinct loading, empty, error, and retry states", async () => {
  const [launcher, shell] = await Promise.all([
    readFile(webFile("app/(shell)/dashboard/EventLauncher.tsx"), "utf8"),
    readFile(webFile("app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx"), "utf8"),
  ]);

  assert.match(launcher, /function parseLauncherEvents\(value: unknown\)/);
  assert.match(launcher, /Loading events\.\.\./);
  assert.match(launcher, /No events yet\./);
  assert.match(launcher, /No events match your search\./);
  assert.match(launcher, /Event list unavailable\./);
  assert.match(launcher, /onClick=\{\(\) => void loadEvents\(\)\}/);

  assert.match(shell, /eventsRequestVersionRef/);
  assert.match(shell, /controller\.abort\(\)/);
  assert.match(shell, /Loading event list…/);
  assert.match(shell, /Event list unavailable\. Showing current event only\./);
  assert.match(shell, /onClick=\{\(\) => void loadEvents\(\)\}/);
});

test("collapsed mobile event context includes direct searchable event selection", async () => {
  const shell = await readFile(
    webFile("app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx"),
    "utf8",
  );
  const collapsedStart = shell.indexOf("{isCollapsed && collapsedHubOpen ? (");
  assert.ok(collapsedStart >= 0);
  const collapsed = shell.slice(collapsedStart);
  assert.match(collapsed, /placeholder="Search events"/);
  assert.match(collapsed, /role="listbox" aria-label="Select event"/);
  assert.match(collapsed, /buildEventSwitchHref\(pathname, currentEvent\.id, event\.id\)/);
  assert.match(collapsed, /No events match your search\./);
  assert.doesNotMatch(shell, /onFocus=\{\(\) => setCollapsedHubOpen\(true\)\}/);
});

test("roadmap event changes abort stale reads and never retain prior-event items", async () => {
  const page = await readFile(webFile("app/(shell)/timeline/page.tsx"), "utf8");
  const dashboard = await readFile(
    webFile("app/(shell)/timeline/_components/TimelineDashboardView.tsx"),
    "utf8",
  );

  assert.match(page, /itemsRequestVersionRef/);
  assert.match(page, /ownersRequestVersionRef/);
  assert.match(page, /setItems\(\[\]\);[\s\S]*setOwnerOptions\(\[\]\);[\s\S]*controller\.abort\(\)/);
  assert.match(page, /item\.eventId !== eventId/);
  assert.match(page, /if \(hideEventSelector \|\| scopedEventId\) return;/);
  assert.match(page, /onClick=\{\(\) => void loadItems\(selectedEventId\)\}/);
  assert.match(page, /onClick=\{\(\) => void loadOwnerOptions\(selectedEventId\)\}/);

  assert.match(dashboard, /requestVersionRef/);
  assert.match(dashboard, /isDashboardPayload\(payload, eventId\)/);
  assert.match(dashboard, /controller\.abort\(\)/);
  assert.match(dashboard, /dashboardLoadError\(response\.status\)/);
  assert.match(page, /<TimelineDashboardView\s+eventId=\{selectedEventId\}\s+key=\{selectedEventId\}/);
});

test("roadmap guidance explains persisted concepts and viewer actions are permission-aware", async () => {
  const [page, dashboard] = await Promise.all([
    readFile(webFile("app/(shell)/timeline/page.tsx"), "utf8"),
    readFile(webFile("app/(shell)/timeline/_components/TimelineDashboardView.tsx"), "utf8"),
  ]);

  assert.match(page, /data-testid="roadmap-first-use-guidance"/);
  assert.match(page, /<strong>Statuses<\/strong>/);
  assert.match(page, /<strong>Workstreams<\/strong>/);
  assert.match(page, /<strong>Planning stages<\/strong>/);
  assert.match(page, /<strong>Critical Path<\/strong> is a manual flag/);
  assert.match(page, /canEdit=\{canEdit\}/);
  assert.match(dashboard, /disabled=\{!canEdit \|\| !onAddItem\}/);
  assert.match(dashboard, /disabled=\{!canEdit \|\| !onAddMilestone\}/);
});
