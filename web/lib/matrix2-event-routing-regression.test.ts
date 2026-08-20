import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const VALID_EVENT_ID = "ae4325f3-6a76-469e-ab50-78d0dcd4a4aa";

const eventAccessSource = readFileSync("lib/event-access.ts", "utf8");
const matrix2PageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const eventMatrixPageSource = readFileSync("app/(shell)/events/[eventId]/matrix/page.tsx", "utf8");
const eventMatrixAliasPageSource = readFileSync("app/(shell)/events/[eventId]/matrix-2/page.tsx", "utf8");
const matrix2ApiRouteSource = readFileSync("app/api/events/[eventId]/matrix-2/route.ts", "utf8");
const eventShellSource = readFileSync("app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx", "utf8");

function extractUuidRegex(): RegExp {
  const match = eventAccessSource.match(/const UUID_REGEX = \/(.*)\/i;/);
  assert.ok(match, "expected event access helper to define UUID_REGEX");
  return new RegExp(match[1], "i");
}

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("canonical event access UUID validation accepts real route UUIDs and rejects placeholders", () => {
  const uuidRegex = extractUuidRegex();

  assert.equal(uuidRegex.test(VALID_EVENT_ID), true);
  assert.equal(uuidRegex.test(":eventId"), false);
  assert.equal(uuidRegex.test("docs"), false);
  assert.equal(uuidRegex.test("matrix-2"), false);
  assert.equal(uuidRegex.test(VALID_EVENT_ID.slice(0, -1)), false);
});

test("Matrix v2 scoped page passes the route eventId directly into the snapshot loader", () => {
  assert.equal(eventMatrixPageSource.includes("const { eventId } = await params;"), true);
  assert.equal(eventMatrixPageSource.includes("<Matrix2Page eventIdOverride={eventId} hideEventSelector />"), true);
  assert.equal(matrix2PageSource.includes("if (eventIdOverride.trim()) return eventIdOverride.trim();"), true);
  assert.equal(
    matrix2PageSource.includes("fetch(`/api/events/${eventId}/matrix-2?source=${encodeURIComponent(source)}`"),
    true,
  );
});

test("Matrix v2 discards stale snapshots and derives visible rows from the scoped event", () => {
  assert.equal(matrix2PageSource.includes("snapshotRequestVersionRef"), true);
  assert.equal(matrix2PageSource.includes("isCurrentMatrix2SnapshotRequest(requestVersion, snapshotRequestVersionRef.current)"), true);
  assert.equal(matrix2PageSource.includes("isMatrix2SnapshotForEvent(nextSnapshot, eventId)"), true);
  assert.equal(matrix2PageSource.includes("preserveSelectedDate: !eventChanged"), true);
  assert.equal(
    matrix2PageSource.includes("matrix2SessionsForEventDate({ snapshot, eventId: selectedEventId, date: selectedDate })"),
    true,
  );
  assert.equal(matrix2PageSource.includes("setSnapshot(null);\n      setSelectedDate(\"\");"), true);
  const snapshotLoaderSource = sourceBetween(matrix2PageSource, "const loadSnapshot = useCallback", "useEffect(() => {");
  assert.equal(snapshotLoaderSource.includes("setSnapshotLoadError(error instanceof Error"), true);
  assert.equal(snapshotLoaderSource.includes("setErrorMessage(error instanceof Error"), false);
  assert.equal(snapshotLoaderSource.includes("setSnapshot(null);"), true);
  assert.equal(snapshotLoaderSource.includes("setSelectedDate(\"\");"), true);
});

test("Matrix v2 alias preserves the event UUID when redirecting to Run of Show", () => {
  assert.equal(eventMatrixAliasPageSource.includes("const { eventId } = await params;"), true);
  assert.equal(
    eventMatrixAliasPageSource.includes("redirect(`/events/${encodeURIComponent(eventId)}/matrix`)"),
    true,
  );
});

test("Matrix v2 API reads eventId only from the dynamic route params", () => {
  const handlerSource = sourceBetween(matrix2ApiRouteSource, "async function getMatrix2SnapshotRoute", "export const GET");

  assert.equal(handlerSource.includes("{ params }: { params: Promise<{ eventId: string }> }"), true);
  assert.equal(handlerSource.includes("const { eventId } = await params;"), true);
  assert.equal(handlerSource.includes("requestUrl.searchParams.get(\"eventId\")"), false);
  assert.equal(handlerSource.includes('assertEventAccessForUser(eventId, currentUserResult.user, "read")'), true);
});

test("event workspace sidebar links preserve the eventId segment for Matrix-adjacent modules", () => {
  const navSource = sourceBetween(eventShellSource, "const planningItems", "return (");

  for (const href of [
    "`/events/${eventId}`",
    "`/events/${eventId}/timeline`",
    "`/events/${eventId}/budget`",
    "`/events/${eventId}/matrix`",
    "`/events/${eventId}/attendees`",
    "`/events/${eventId}/speakers`",
    "`/events/${eventId}/docs`",
    "`/events/${eventId}/activity`",
    "`/events/${eventId}/settings`",
  ]) {
    assert.equal(navSource.includes(href), true, href);
  }

  assert.equal(navSource.includes("`/events/${eventId}/reports`"), false);
  assert.equal(navSource.includes("/events/:eventId"), false);
});

test("event workspace navigation matches planner journey labels and ordering", () => {
  const navSource = sourceBetween(eventShellSource, "const planningItems", "return (");
  const planningSource = sourceBetween(eventShellSource, "const planningItems", "const eventDirectoryChildren");
  const eventDirectorySource = sourceBetween(eventShellSource, "const eventDirectoryChildren", "const isPlanningActive");
  const workspaceTopNavSource = sourceBetween(eventShellSource, "const workspaceTopNavItems", "const commandCenterItem");
  const operationsSource = sourceBetween(eventShellSource, 'label: "Operations"', "const renderNavItem");
  const supportSource = sourceBetween(eventShellSource, 'label: "Support"', "const renderNavItem");
  const eventNavigationSource = sourceBetween(eventShellSource, '<nav className={isCollapsed', "</nav>");

  const planningLabels = [
    'label: "Roadmap"',
    'label: "Budget"',
    "label: terms.runOfShow",
  ];
  for (let index = 0; index < planningLabels.length - 1; index += 1) {
    assert.equal(
      planningSource.indexOf(planningLabels[index]) < planningSource.indexOf(planningLabels[index + 1]),
      true,
      `${planningLabels[index]} should come before ${planningLabels[index + 1]}`,
    );
  }

  assert.equal(eventShellSource.includes('aria-label="Back to Events"'), false);
  assert.equal(eventShellSource.includes('aria-label="Go to all events"'), true);
  assert.equal(eventShellSource.includes('aria-label="Current event"'), true);
  assert.equal(eventShellSource.includes('href="/events"'), true);
  assert.equal(navSource.includes('badge: "Coming soon"'), true);
  assert.equal(planningSource.includes('label: "Staffing"'), false);
  assert.equal(planningSource.includes('label: "Speakers"'), false);
  assert.equal(eventShellSource.includes("Event Directory"), true);
  assert.equal(eventShellSource.includes("eventDirectoryOpen"), true);
  assert.equal(eventShellSource.includes("isEventDirectoryOpen"), true);
  assert.equal(eventShellSource.includes("isPathActive(pathname, `/events/${eventId}/directory`)"), true);
  assert.equal(eventShellSource.includes("href={`/events/${eventId}/directory`}"), true);
  assert.equal(eventShellSource.includes("useState<boolean | null>(null)"), true);
  assert.equal(eventShellSource.includes("const isEventDirectoryOpen = eventDirectoryOpen ?? isEventDirectoryActive"), true);
  assert.equal(eventShellSource.includes("setEventDirectoryOpen((open) => !(open ?? isEventDirectoryActive))"), true);
  assert.equal(eventShellSource.includes('aria-label={isEventDirectoryOpen ? "Collapse Event Directory" : "Expand Event Directory"}'), true);
  assert.equal(eventShellSource.includes("event.stopPropagation();"), true);
  assert.equal(eventShellSource.includes("aria-controls=\"event-directory-nav\""), true);
  assert.equal(eventDirectorySource.includes('label: "All People"'), false);
  assert.equal(eventDirectorySource.includes('label: "Speakers"'), true);
  assert.equal(eventDirectorySource.includes("href: `/events/${eventId}/speakers`"), true);
  assert.equal(eventDirectorySource.includes('label: "Staffing"'), true);
  assert.equal(eventDirectorySource.includes("href: `/events/${eventId}/staffing`"), false);
  assert.equal(eventDirectorySource.includes('badge: "Coming soon"'), true);
  assert.equal(eventDirectorySource.includes('label: "Attendees"'), true);
  assert.equal(eventDirectorySource.includes("href: `/events/${eventId}/attendees`"), true);
  assert.equal(eventDirectorySource.includes("isPathActive(currentPathname, `/events/${eventId}/attendees`)"), true);
  assert.equal(eventDirectorySource.includes('label: "Exhibitors"'), true);
  assert.equal(eventDirectorySource.includes('badge: "Coming soon"'), true);
  assert.equal(
    eventDirectorySource.indexOf('label: "Speakers"') < eventDirectorySource.indexOf('label: "Attendees"'),
    true,
  );
  assert.equal(
    eventDirectorySource.indexOf('label: "Attendees"') < eventDirectorySource.indexOf('label: "Staffing"'),
    true,
  );
  assert.equal(
    eventDirectorySource.indexOf('label: "Attendees"') < eventDirectorySource.indexOf('label: "Exhibitors"'),
    true,
  );
  assert.equal(eventDirectorySource.includes('label: "Attendees",\n      badge: "Coming soon"'), false);
  assert.equal(eventShellSource.includes("isEventDirectoryActive"), true);
  for (const item of [
    ['label: "Roadmap"', "href: `/events/${eventId}/timeline`"],
    ['label: "Budget"', "href: `/events/${eventId}/budget`"],
    ["label: terms.runOfShow", "href: `/events/${eventId}/matrix`"],
  ]) {
    assert.equal(workspaceTopNavSource.includes(item[0]), true, item[0]);
    assert.equal(workspaceTopNavSource.includes(item[1]), true, item[1]);
  }
  assert.equal(workspaceTopNavSource.includes('label: "Matrix"'), false);
  assert.equal(workspaceTopNavSource.includes("href: `/events/${eventId}/matrix-2`"), false);
  assert.equal(workspaceTopNavSource.includes("isPathActive(currentPathname, `/events/${eventId}/matrix-2`)"), true);
  assert.equal(eventShellSource.includes("shouldShowWorkspaceTopNav"), true);
  assert.equal(eventShellSource.includes("<EventModuleSwitcher eventId={eventId} runOfShowLabel={terms.runOfShow} />"), true);
  assert.equal(navSource.includes('label: "Planning"'), true);
  assert.equal(navSource.includes('label: "Operations"'), true);
  assert.equal(navSource.includes('label: "Support"'), true);
  assert.equal(navSource.includes('label: "Overview"'), false);
  assert.equal(navSource.includes('label: "Management"'), false);
  assert.equal(navSource.includes('label: "Resources"'), false);
  assert.equal(eventShellSource.indexOf("renderNavItem(commandCenterItem)") < eventShellSource.indexOf("navSections.map"), true);
  for (const label of [
    'label: "Marketing"',
    'label: "Documents"',
    'label: "Activity"',
    'label: "Settings"',
  ]) {
    assert.equal(operationsSource.includes(label), true, label);
  }
  assert.equal(operationsSource.includes('label: "Financial Reports"'), false);
  assert.equal(eventNavigationSource.includes('section.label === "Operations"'), true);
  assert.equal(
    eventNavigationSource.indexOf('renderEventDirectoryItem()') < eventNavigationSource.indexOf("section.items.map"),
    true,
  );
  assert.equal(
    operationsSource.indexOf('label: "Marketing"') < operationsSource.indexOf('label: "Documents"') &&
      operationsSource.indexOf('label: "Documents"') < operationsSource.indexOf('label: "Activity"') &&
      operationsSource.indexOf('label: "Activity"') < operationsSource.indexOf('label: "Settings"'),
    true,
  );
  assert.equal(supportSource.includes('label: "Help Center"'), true);
  assert.equal(supportSource.includes('href: "/help"'), true);
  assert.equal(supportSource.includes("CircleHelp"), true);
  assert.equal(eventShellSource.includes("Financial Reports is intentionally hidden from navigation for now"), true);
  assert.equal(eventShellSource.includes("const utilityItems"), false);
  assert.equal(eventShellSource.includes('border-t border-slate-200/80 pt-4 space-y-1.5'), false);
  assert.equal(eventShellSource.includes('aria-current={active ? "page" : undefined}'), true);
});
