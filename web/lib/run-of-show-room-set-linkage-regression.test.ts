import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const eventNavSource = readFileSync("components/event/event-nav.tsx", "utf8");
const eventShellSource = readFileSync("app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx", "utf8");
const eventSeatingRouteSource = readFileSync("app/(shell)/events/[eventId]/seating/page.tsx", "utf8");
const standaloneSeatingRouteSource = readFileSync("app/(shell)/seating/page.tsx", "utf8");
const matrix2PageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const matrix2BoardSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2Board.tsx", "utf8");
const matrix2ReadinessSource = readFileSync("app/(shell)/matrix-2/_components/matrix2-session-readiness.ts", "utf8");
const matrix2TopStripSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2TopStrip.tsx", "utf8");
const matrix2DrawerSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2DetailsDrawer.tsx", "utf8");
const matrix2QuickModulesSource = readFileSync("app/(shell)/matrix-2/_components/matrix2-quick-modules.tsx", "utf8");
const matrix2TypesSource = readFileSync("app/(shell)/matrix-2/_components/types.ts", "utf8");
const sessionDetailSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx",
  "utf8",
);
const roomSetWorkspaceSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/room-set-workspace.tsx",
  "utf8",
);
const routeHelperSource = readFileSync("lib/planning/routes.ts", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("visible event navigation uses Run of Show and omits standalone Seating", () => {
  const eventTabs = sourceBetween(eventNavSource, "const TABS", "function tabHref");
  const planningItems = sourceBetween(eventShellSource, "const planningItems", "const isPlanningActive");

  assert.equal(eventTabs.includes('key: "matrix", label: "Run of Show"'), true);
  assert.equal(eventNavSource.includes('const label = tab.key === "matrix" ? terms.runOfShow : tab.label'), true);
  assert.equal(planningItems.includes("label: terms.runOfShow"), true);
  for (const source of [eventTabs, planningItems]) {
    assert.equal(source.includes('label: "Matrix"'), false);
    assert.equal(source.includes('label: "Seating"'), false);
    assert.equal(source.includes("/seating"), false);
  }
});

test("retired standalone Seating routes redirect instead of rendering the old module", () => {
  assert.equal(eventSeatingRouteSource.includes("redirect(`/events/${eventId}/matrix`)"), true);
  assert.equal(eventSeatingRouteSource.includes("SeatingPage"), false);
  assert.equal(standaloneSeatingRouteSource.includes('redirect("/events")'), true);
  assert.equal(standaloneSeatingRouteSource.includes("fetch(`/api/events/${eventId}/seating`)"), false);
});

test("Run of Show board and workspace surfaces link directly to Room Set layout and seating", () => {
  assert.equal(routeHelperSource.includes('export type RoomSetMode = "layout" | "seating";'), true);
  assert.equal(routeHelperSource.includes("roomSetHref"), true);
  assert.equal(routeHelperSource.includes("mode=${mode}"), true);

  assert.equal(matrix2PageSource.includes('roomSetHref(eventId, session.id, "layout")'), false);
  assert.equal(matrix2PageSource.includes('roomSetHref(eventId, session.id, "seating")'), false);
  assert.equal(matrix2PageSource.includes('roomSetHref(selectedEventId, sessionId, "layout")'), true);
  assert.equal(matrix2PageSource.includes('roomSetHref(selectedEventId, sessionId, "seating")'), true);
  assert.equal(matrix2DrawerSource.includes('roomSetHref(session.eventId, session.id, "layout")'), true);
  assert.equal(matrix2DrawerSource.includes('roomSetHref(session.eventId, session.id, "seating")'), false);
  assert.equal(sessionDetailSource.includes('roomSetHref(eventId, sessionId, "layout")'), true);
  assert.equal(sessionDetailSource.includes('roomSetHref(eventId, sessionId, "seating")'), true);
});

test("Run of Show command center shell uses Board/List and preserves full workspace routing", () => {
  const zoomOptions = sourceBetween(matrix2TopStripSource, "const ZOOM_OPTIONS", "export const EMPTY_MATRIX_LIST_FILTERS");
  const pageHeader = sourceBetween(matrix2PageSource, "<EventModuleHeader", "<Matrix2TopStrip");
  const shellTopNavSource = sourceBetween(eventShellSource, "const workspaceTopNavItems", "const commandCenterItem");

  assert.equal(matrix2PageSource.includes('useState<Matrix2ZoomMode>("PLANNING")'), true);
  assert.equal(pageHeader.includes("Command Center"), true);
  assert.equal(pageHeader.includes('label: "sessions", value: String(stats.sessions)'), true);
  assert.equal(pageHeader.includes('label: "rooms", value: String(stats.roomsActive)'), true);
  assert.equal(pageHeader.includes('label: "conflicts", value: String(stats.conflicts)'), true);
  assert.equal(matrix2PageSource.includes("const workspaceNavItems = workspaceNavEventId"), false);
  assert.equal(shellTopNavSource.includes('label: "Roadmap"'), true);
  assert.equal(shellTopNavSource.includes("href: `/events/${eventId}/timeline`"), true);
  assert.equal(shellTopNavSource.includes('label: "Budget"'), true);
  assert.equal(shellTopNavSource.includes("href: `/events/${eventId}/budget`"), true);
  assert.equal(shellTopNavSource.includes("label: terms.runOfShow"), true);
  assert.equal(shellTopNavSource.includes("href: `/events/${eventId}/matrix`"), true);
  assert.equal(shellTopNavSource.includes('label: "Matrix"'), false);
  assert.equal(shellTopNavSource.includes("href: `/events/${eventId}/matrix-2`"), false);
  assert.equal(shellTopNavSource.includes("isPathActive(currentPathname, `/events/${eventId}/matrix-2`)"), true);
  assert.equal(eventShellSource.includes("<EventModuleSwitcher eventId={eventId} runOfShowLabel={terms.runOfShow} />"), true);
  assert.equal(eventShellSource.includes('aria-current={active ? "page" : undefined}'), true);

  assert.equal(zoomOptions.includes('value: "PLANNING", label: "Board"'), true);
  assert.equal(zoomOptions.includes('value: "OVERVIEW", label: "List"'), true);
  assert.equal(zoomOptions.includes("Operations"), false);
  assert.equal(matrix2TopStripSource.includes('aria-label={`${terminology.runOfShow} view`}'), true);

  assert.equal(
    matrix2PageSource.includes("router.push(`/events/${encodeURIComponent(selectedEventId)}/matrix/sessions/${encodeURIComponent(operationsSessionId)}`)"),
    true,
  );
});

test("event planning workspace shell normalizes top offset and bounded scrolling", () => {
  assert.equal(eventShellSource.includes('const eventWorkspaceContentClassName ='), true);
  assert.equal(eventShellSource.includes("const shouldShowWorkspaceTopNav ="), true);
  assert.equal(eventShellSource.includes("const renderWorkspaceTopNav = () =>"), true);
  assert.equal(eventShellSource.includes('"h-dvh overflow-hidden bg-[#f8f8fb]"'), true);
  assert.match(eventShellSource, /className="[^"]*shrink-0[^"]*border-b border-slate-200 bg-\[#f8f8fb\] px-6 py-3"/);
  assert.equal(eventShellSource.includes("title={currentEvent.name}"), true);
  assert.equal(eventShellSource.includes('? "min-h-0 flex-1 overflow-hidden"'), true);
  assert.equal(eventShellSource.includes(': "p-6"'), true);
  assert.equal(eventShellSource.includes('className={eventWorkspaceContentClassName}'), true);
  assert.equal(eventShellSource.includes('className={workspaceChildClassName}'), true);
  assert.equal(eventShellSource.includes('className={isPlanningActive || isRoomSetWorkspaceRoute ? "min-h-screen" : "p-6"}'), false);
  assert.equal(eventShellSource.includes('isRunOfShowWorkspaceRoute'), true);
  assert.equal(eventShellSource.includes('"min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3"'), true);
  assert.equal(eventShellSource.includes('"min-h-0 flex-1 overflow-hidden p-3"'), false);
  assert.equal(matrix2PageSource.includes('className="flex min-h-0 flex-col gap-4 overflow-visible"'), true);
  assert.equal(matrix2PageSource.includes('className="flex h-full min-h-0 flex-col gap-4 overflow-hidden"'), false);
  assert.equal(matrix2PageSource.includes('paddingClassName="p-0"'), false);
  assert.equal(matrix2PageSource.includes("h-[calc(100dvh-7rem)]"), false);
});

test("Run of Show session cards expose focused quick-change actions without replacing workspace routes", () => {
  for (const label of ["Open full workspace"]) {
    assert.equal(matrix2BoardSource.includes(label), true);
  }
  for (const label of ["Details", "Speakers", "AV", "F&B", "Staffing", "Room Set", "Seating", "Conflicts"]) {
    assert.equal(matrix2QuickModulesSource.includes(`label: "${label}"`), true);
  }

  assert.equal(matrix2BoardSource.includes("function SessionActionLauncher"), true);
  assert.equal(matrix2BoardSource.includes('onSessionAction(session.id, "workspace")'), true);
  assert.match(matrix2QuickModulesSource, /action: "room-set"[\s\S]*label: "Room Set"[\s\S]*destination: "workspace"[\s\S]*enabled: MATRIX2_ROOM_SET_SEATING_QUICK_LAUNCH_ENABLED/);
  assert.match(matrix2QuickModulesSource, /action: "seating"[\s\S]*label: "Seating"[\s\S]*destination: "workspace"[\s\S]*enabled: MATRIX2_ROOM_SET_SEATING_QUICK_LAUNCH_ENABLED/);
  assert.doesNotMatch(matrix2QuickModulesSource, /destination: "unavailable"|unavailableLabel|Coming soon/);
  assert.equal(matrix2BoardSource.includes("ROOM_SET_SEATING_COMBINED_LABEL"), false);
  assert.equal(matrix2PageSource.includes("const sessionHref = `/events/${encodeURIComponent(selectedEventId)}/matrix/sessions/${encodeURIComponent(sessionId)}`;"), true);
  assert.equal(matrix2PageSource.includes('router.push(roomSetHref(selectedEventId, sessionId, "layout"))'), true);
  assert.equal(matrix2PageSource.includes('router.push(roomSetHref(selectedEventId, sessionId, "seating"))'), true);
  assert.equal(matrix2PageSource.includes("router.push(`${sessionHref}?tab=overview`);"), true);
  assert.equal(matrix2PageSource.includes("onSessionAction={handleSessionAction}"), true);
  assert.equal(
    matrix2PageSource.includes('if (action === "basics" || action === "speakers" || action === "av" || action === "fnb" || action === "staffing")'),
    true,
  );
  assert.equal(matrix2PageSource.includes("handleOpenQuickDrawer(sessionId, action === \"basics\" ? null : action);"), true);
  assert.equal(matrix2PageSource.includes("if (quickModule && !quickModule.enabled) return;"), true);
  assert.equal(matrix2PageSource.includes("router.push(`${sessionHref}?tab=${encodeURIComponent(action)}`);"), true);
  assert.equal(matrix2PageSource.includes("focusedModule={quickChangeFocus}"), false);
  assert.equal(matrix2DrawerSource.includes("focusedModule?: Matrix2SessionAction | null"), false);
});

test("Run of Show launcher tiles preserve quick panels and route rich module destinations", () => {
  assert.equal(matrix2PageSource.includes("router.push(`${sessionHref}?tab=overview`);"), true);
  assert.equal(matrix2PageSource.includes("router.push(`${sessionHref}?tab=${encodeURIComponent(action)}`);"), true);
  for (const action of ["speakers", "av", "fnb", "staffing", "conflicts"]) {
    assert.equal(matrix2QuickModulesSource.includes(`action: "${action}"`), true);
  }
  assert.equal(matrix2PageSource.includes("handleOpenQuickDrawer(sessionId, action === \"basics\" ? null : action);"), true);
  assert.equal(matrix2PageSource.includes('router.push(roomSetHref(selectedEventId, sessionId, "layout"))'), true);
  assert.equal(matrix2PageSource.includes('router.push(roomSetHref(selectedEventId, sessionId, "seating"))'), true);
  assert.equal(matrix2BoardSource.includes("Edit drawer · click"), false);
  assert.equal(matrix2BoardSource.includes("Open section"), false);
  assert.equal(matrix2BoardSource.includes("Choose a card"), true);

  const order = Array.from(matrix2QuickModulesSource.matchAll(/action: "([^"]+)"/g)).map((match) => match[1]);
  assert.deepEqual(order, ["basics", "speakers", "av", "fnb", "staffing", "conflicts", "room-set", "seating"]);
});

test("Run of Show action launcher renders above board lanes and shares readiness colors", () => {
  assert.equal(matrix2BoardSource.includes("const activeLauncher = useMemo(() =>"), true);
  assert.equal(matrix2BoardSource.includes("const activeSessionId = actionSessionId;"), true);
  assert.equal(matrix2BoardSource.includes("const actionLauncherRef = useRef<HTMLDivElement | null>(null);"), true);
  assert.equal(matrix2BoardSource.includes("const closeActionLauncherTimerRef = useRef<number | null>(null);"), true);
  assert.equal(matrix2BoardSource.includes("const BOARD_HEADER_HEIGHT = 48;"), true);
  assert.equal(matrix2BoardSource.includes("const ACTION_LAUNCHER_WIDTH = 340;"), true);
  assert.equal(matrix2BoardSource.includes("const ACTION_LAUNCHER_ESTIMATED_HEIGHT = 326;"), true);
  assert.equal(matrix2BoardSource.includes("const ACTION_LAUNCHER_VIEWPORT_PADDING = 12;"), true);
  assert.equal(matrix2BoardSource.includes("const rightSideLeft = roomLabelWidth + placement.left + placement.width + ACTION_LAUNCHER_GAP;"), true);
  assert.equal(matrix2BoardSource.includes("const leftSideLeft = roomLabelWidth + placement.left - ACTION_LAUNCHER_WIDTH - ACTION_LAUNCHER_GAP;"), true);
  assert.equal(matrix2BoardSource.includes("top: Math.min(Math.max(minTop, desiredTop), maxTop)"), true);
  assert.equal(matrix2BoardSource.includes('className="pointer-events-none absolute inset-0 z-50"'), true);
  assert.equal(matrix2BoardSource.includes("w-[min(340px,calc(100vw-24px))]"), true);
  assert.equal(matrix2BoardSource.includes("h-11 items-center gap-2 rounded-xl px-2.5 text-left text-[14px]"), true);
  assert.equal(matrix2BoardSource.includes("h-7 w-7 shrink-0"), true);
  assert.equal(matrix2BoardSource.includes("text-[13px] font-semibold text-[#28439A]"), true);
  assert.equal(matrix2BoardSource.includes("data-matrix2-action-launcher"), true);
  assert.equal(matrix2BoardSource.includes("const clearActionLauncherCloseTimer = useCallback(() =>"), true);
  assert.equal(matrix2BoardSource.includes("const closeActionLauncher = useCallback(() =>"), true);
  assert.equal(matrix2BoardSource.includes("const handleShowActions = useCallback("), true);
  assert.equal(matrix2BoardSource.includes("const scheduleActionLauncherClose = useCallback("), true);
  assert.equal(matrix2BoardSource.includes("ACTION_LAUNCHER_CLOSE_DELAY_MS"), true);
  assert.match(matrix2BoardSource, /onPointerLeave=\{\(\) => \{\s*if \(!isDragging\) onHideActions\(session\.id\);\s*\}\}/);
  assert.equal(matrix2BoardSource.includes("onPointerEnter={onPointerEnter}"), true);
  assert.equal(matrix2BoardSource.includes("onPointerLeave={onPointerLeave}"), true);
  assert.equal(matrix2BoardSource.includes('document.addEventListener("pointerdown", handlePointerDown);'), true);
  assert.equal(matrix2BoardSource.includes('document.addEventListener("keydown", handleKeyDown);'), true);
  assert.equal(matrix2BoardSource.includes('event.key === "Escape"'), true);
  assert.equal(matrix2BoardSource.includes('target.closest("[data-matrix2-session-card-id]")'), true);
  assert.equal(matrix2BoardSource.includes("onClose();"), true);
  assert.equal(matrix2BoardSource.includes("setActionSessionId(null);"), true);
  assert.equal(matrix2BoardSource.includes("JUMP INTO"), true);
  assert.equal(matrix2BoardSource.includes("sessionContext"), true);
  assert.equal(matrix2BoardSource.includes("function launcherTileClasses"), true);
  assert.equal(matrix2BoardSource.includes("function launcherIconPillClasses"), true);
  assert.equal(matrix2BoardSource.includes("Open full workspace →"), true);
  assert.equal(matrix2BoardSource.includes("Open section"), false);
  assert.equal(matrix2BoardSource.includes("Choose a card"), true);

  const lanePlacementRender = sourceBetween(matrix2BoardSource, "{placements.map(({ session, left, width, top }) => {", "{activeLauncher ? (");
  assert.equal(lanePlacementRender.includes("SessionActionLauncher"), false);

  assert.equal(matrix2BoardSource.includes("deriveMatrix2SessionReadiness(session, conflicts)"), true);
  assert.equal(matrix2BoardSource.includes("function moduleReadinessForSession(session: Matrix2Session)"), false);
  assert.equal(matrix2ReadinessSource.includes("deriveSessionModuleReadiness"), true);
  assert.equal(matrix2ReadinessSource.includes("SESSION_READINESS_METADATA"), true);
  assert.equal(matrix2ReadinessSource.includes('status === "ready") return "ready"'), true);
  assert.equal(matrix2ReadinessSource.includes('status === "blocked") return "missing"'), true);
  assert.equal(matrix2ReadinessSource.includes('status === "needs_info" || status === "not_started") return "attention"'), true);
  assert.equal(matrix2ReadinessSource.includes('conflicts: {'), true);
  assert.equal(matrix2BoardSource.includes("launcherTileClasses(item.launcherVariant, item.tone)"), true);
  assert.equal(matrix2BoardSource.includes("launcherIconPillClasses(item.launcherVariant, item.tone)"), true);
  assert.equal(matrix2BoardSource.includes('const conflictTone = getPlanningTone("Conflict", { intent: "conflict" }).className;'), true);
});

test("Run of Show session quick-action popover is stable and interactive", () => {
  const launcherRenderSource = sourceBetween(matrix2BoardSource, "{activeLauncher ? (", ") : null}\n      </div>");
  const launcherSource = sourceBetween(matrix2BoardSource, "function SessionActionLauncher({", "function SessionCard({");
  const cardStart = matrix2BoardSource.indexOf("function SessionCard({");
  assert.notEqual(cardStart, -1, "missing source marker: function SessionCard");
  const cardSource = matrix2BoardSource.slice(cardStart);

  assert.equal(matrix2BoardSource.includes("data-matrix2-action-launcher"), true);
  assert.equal(cardSource.includes("data-matrix2-session-card-id={session.id}"), true);
  assert.equal(cardSource.includes("onClick={(event) =>"), true);
  assert.equal(cardSource.includes("onToggleActions(session.id);"), true);
  assert.equal(matrix2PageSource.includes("onSelectSession={(sessionId) =>"), false);

  assert.match(matrix2BoardSource, /setTimeout\(\(\) => \{[\s\S]*setActionSessionId/);
  assert.equal(matrix2BoardSource.includes("window.clearTimeout"), true);
  assert.equal(matrix2BoardSource.includes("return () => {\n      clearActionLauncherCloseTimer();"), true);
  assert.equal(matrix2BoardSource.includes("if (actionLauncherPinnedRef.current) return;"), true);
  assert.match(launcherRenderSource, /onPointerEnter=\{[^}]+\}/);
  assert.match(launcherRenderSource, /onPointerLeave=\{[^}]+\}/);
  assert.match(launcherSource, /className="[^"]*pointer-events-auto[^"]*absolute[^"]*z-(?:\d+|\[\d+\])[^"]*"/);
  assert.equal(launcherSource.includes("ACTION_LAUNCHER_HOVER_BRIDGE_PX"), true);
  assert.equal(launcherSource.includes('side === "right" ? "right-full" : "left-full"'), true);

  assert.equal(matrix2BoardSource.includes('document.addEventListener("pointerdown", handlePointerDown);'), true);
  assert.equal(matrix2BoardSource.includes("closeActionLauncher();"), true);
  assert.equal(matrix2BoardSource.includes('event.key === "Escape"'), true);
  assert.match(cardSource, /onFocus=\{\(\) => \{\s*if \(!isDragging\) onShowActions\(session\.id\);\s*\}\}/);
  assert.equal(cardSource.includes("onKeyDown={(event) =>"), true);
  assert.equal(cardSource.includes("onCloseActions();"), true);
  assert.equal(launcherSource.includes("onBlur="), false);

  assert.equal(launcherSource.includes("onSessionAction(session.id, item.action);"), true);
  assert.equal(launcherSource.includes('onSessionAction(session.id, "workspace");'), true);
});

test("Run of Show board density is compact and responsive", () => {
  assert.equal(matrix2BoardSource.includes("const ROOM_LABEL_WIDTH_MAX = 228;"), true);
  assert.equal(matrix2BoardSource.includes("const ROOM_LABEL_WIDTH_MIN = 136;"), true);
  assert.equal(matrix2BoardSource.includes("const TRACK_GAP = 6;"), true);
  assert.equal(matrix2BoardSource.includes("const LANE_TOP_PADDING = 6;"), true);
  assert.equal(matrix2BoardSource.includes("const LANE_BOTTOM_PADDING = 6;"), true);
  assert.equal(matrix2BoardSource.includes("const roomLabelBasis = viewportWidth > 0 ? viewportWidth : boardFrameWidth;"), true);
  assert.equal(matrix2BoardSource.includes("roomLabelBasis * 0.18"), true);
  assert.equal(matrix2BoardSource.includes('window.addEventListener("resize", update);'), true);
  assert.equal(matrix2BoardSource.includes("style={{ width: roomLabelWidth"), true);
  assert.equal(matrix2BoardSource.includes("trackCount * input.cardHeight + Math.max(0, trackCount - 1) * TRACK_GAP + LANE_TOP_PADDING + LANE_BOTTOM_PADDING"), true);
  assert.equal(matrix2BoardSource.includes("trackIndex,"), true);
  assert.equal(matrix2BoardSource.includes("const [expandedRoomIds, setExpandedRoomIds] = useState<Set<string>>"), true);
  assert.equal(matrix2BoardSource.includes("const hasStackedSessions = trackCount > 1;"), true);
  assert.equal(matrix2BoardSource.includes("validPlacements.filter((placement) => placement.trackIndex === 0)"), true);
  assert.equal(matrix2BoardSource.includes("const hiddenSessionCount = validPlacements.length - placements.length;"), true);
  assert.equal(matrix2BoardSource.includes("const compactLaneHeight = zoom.cardHeight + LANE_TOP_PADDING + LANE_BOTTOM_PADDING;"), true);
  assert.equal(matrix2BoardSource.includes("toggleRoomExpanded(room.id);"), true);
  assert.equal(matrix2BoardSource.includes("aria-expanded={isExpanded}"), true);
  assert.equal(matrix2BoardSource.includes("`+${hiddenSessionCount} more`"), true);
  assert.equal(matrix2BoardSource.includes('const titleClampClass = canUseTwoLineTitle ? "line-clamp-2" : "truncate";'), true);
  assert.equal(matrix2BoardSource.includes("SESSION_CARD_MIN_READABLE_WIDTH"), false);
  assert.equal(matrix2BoardSource.includes("const visualWidth = Math.max"), false);
  assert.equal(matrix2BoardSource.includes("const durationSize = isTimeByRoomCard ? height : width;"), true);
  assert.equal(matrix2BoardSource.includes("height >= TIME_BY_ROOM_SESSION_CARD_MEDIUM_HEIGHT"), true);
  assert.equal(matrix2BoardSource.includes("width >= 92"), true);
  assert.equal(matrix2BoardSource.includes("aria-label={`${session.title}, ${formattedTimeRange}`}"), true);
  assert.equal(matrix2BoardSource.includes('const cardPaddingClass = isTimeByRoomCard ? "px-1.5 py-1" : "px-2 py-1";'), true);
  assert.equal(matrix2BoardSource.includes("cardPaddingClass,"), true);
  assert.equal(matrix2BoardSource.includes("flex h-full min-w-0 flex-col justify-center overflow-hidden"), true);
  assert.equal(matrix2BoardSource.includes("Operational assignments"), false);
  assert.equal(matrix2BoardSource.includes("visibleOperationalIndicators"), false);
  assert.equal(matrix2BoardSource.includes("hiddenIndicatorCount"), false);
  assert.equal(matrix2BoardSource.includes("Ops {operationalIndicators.length}"), false);
  assert.equal(matrix2BoardSource.includes("CircleCheck"), false);

  assert.equal(matrix2TypesSource.includes("laneMinHeight: 56"), true);
  assert.equal(matrix2TypesSource.includes("cardHeight: 44"), true);
  assert.equal(matrix2TypesSource.includes("laneMinHeight: 58"), true);
  assert.equal(matrix2TypesSource.includes("cardHeight: 46"), true);
});

test("Run of Show Details drawer is session-specific and does not render the old module card grid", () => {
  const basicsDrawerShell = sourceBetween(matrix2DrawerSource, "Session details", "</aside>");

  assert.equal(matrix2DrawerSource.includes("Session Quick Change"), false);
  assert.equal(matrix2DrawerSource.includes("function ReadinessCard"), false);
  assert.equal(matrix2DrawerSource.includes("function QuickPanelShell"), true);
  assert.equal(matrix2DrawerSource.includes("function FocusedEditPanel"), false);
  assert.equal(matrix2DrawerSource.includes("function DeepWorkLink"), false);
  assert.equal(matrix2DrawerSource.includes("function AccordionSection"), false);
  assert.equal(matrix2DrawerSource.includes("isOpen={openSections."), false);
  assert.equal(matrix2DrawerSource.includes("onToggle={() =>"), false);
  assert.equal(matrix2DrawerSource.includes("activeQuickPanel"), true);
  assert.equal(matrix2DrawerSource.includes("toggleQuickPanel"), false);
  assert.equal(matrix2DrawerSource.includes("data-session-quick-panel"), true);
  assert.equal(matrix2PageSource.includes("fixed inset-0 z-50 bg-slate-950/30 backdrop-blur-[1px]"), true);
  assert.equal(matrix2PageSource.includes("ml-auto h-dvh w-full sm:w-[min(720px,calc(100vw-32px))]"), true);
  assert.equal(matrix2PageSource.includes('window.addEventListener("keydown", handleKeyDown);'), true);
  assert.equal(matrix2PageSource.includes('event.key === "Escape"'), true);
  assert.equal(matrix2DrawerSource.includes("flex h-dvh max-h-dvh flex-col overflow-hidden border-l"), true);
  assert.equal(matrix2DrawerSource.includes("sm:rounded-l-[1.1rem]"), true);

  for (const label of ["Session details", "Session info", "Title", "Session Type", "Room", "Start", "End"]) {
    assert.equal(basicsDrawerShell.includes(label), true);
  }

  for (const label of ["Speakers", "AV", "F&B", "Staffing", "Room Set", "Seating"]) {
    assert.equal(basicsDrawerShell.includes(`title="${label}"`), false);
  }

  assert.equal(basicsDrawerShell.includes("Attendee registration"), true);
  assert.equal(basicsDrawerShell.includes("No attendees registered yet."), true);
  assert.equal(basicsDrawerShell.includes("Search event attendees"), true);
  assert.equal(basicsDrawerShell.includes("Add attendee"), true);
  assert.equal(basicsDrawerShell.includes("Remove from roster"), true);
  assert.equal(basicsDrawerShell.includes("Save changes"), true);
  assert.equal(basicsDrawerShell.includes("Full workspace"), true);
  assert.equal(basicsDrawerShell.includes("Open full workspace"), false);
  assert.equal(basicsDrawerShell.includes("Room Set"), false);
  assert.equal(basicsDrawerShell.includes("Seating"), false);
  assert.equal(basicsDrawerShell.includes("Save Session"), false);
  assert.equal(basicsDrawerShell.includes("Duplicate"), false);
  assert.equal(basicsDrawerShell.includes("Delete"), false);

  assert.equal(matrix2DrawerSource.includes("const baseHref = runOfShowSessionHref(session.eventId, session.id);"), true);
  assert.equal(matrix2DrawerSource.includes("return activeQuickPanel ? `${baseHref}#${activeQuickPanel}` : baseHref;"), true);
  assert.equal(matrix2DrawerSource.includes('const roomSetLayoutHref = roomSetHref(session.eventId, session.id, "layout");'), false);
  assert.equal(matrix2DrawerSource.includes('const seatingHref = roomSetHref(session.eventId, session.id, "seating");'), false);
  assert.equal(matrix2DrawerSource.includes("href={fullWorkspaceHref}"), true);
  assert.equal(matrix2DrawerSource.includes("void handleSave();"), true);
  assert.equal(matrix2DrawerSource.includes("void onDuplicate(session.id);"), false);
  assert.equal(matrix2DrawerSource.includes("void onDelete(session.id);"), false);
});

test("Run of Show drawer keeps module quick panels separate from Details", () => {
  assert.equal(matrix2DrawerSource.includes("function isPlaceholderSpeakerName"), true);
  assert.equal(matrix2DrawerSource.includes("function isRealSpeakerSelection"), true);
  assert.equal(matrix2DrawerSource.includes('normalized === "tbd"'), true);
  assert.equal(matrix2DrawerSource.includes('normalized === "unassigned"'), true);
  assert.equal(matrix2DrawerSource.includes("const speakers = Array.isArray(payload) ? (payload as Matrix2EventSpeakerRecord[]) : [];"), true);
  assert.equal(matrix2DrawerSource.includes("setEventSpeakers(speakers);"), true);
  assert.equal(matrix2DrawerSource.includes("setFnbCatalogItems("), true);
  assert.equal(matrix2DrawerSource.includes("availableStaffPeople"), true);
  assert.equal(matrix2DrawerSource.includes("selectedRequirementItemsByType.AV"), true);
  assert.equal(matrix2DrawerSource.includes("selectedRequirementItemsByType.FNB"), true);
  assert.equal(matrix2DrawerSource.includes("selectedRequirementItemsByType.STAFFING"), true);
  assert.equal(matrix2DrawerSource.includes('title="F&B"'), true);
  assert.equal(matrix2DrawerSource.includes('title="Staffing"'), true);
  assert.equal(matrix2DrawerSource.includes('title="Room Set"'), false);
  assert.equal(matrix2DrawerSource.includes('title="Seating"'), false);
  assert.equal(matrix2PageSource.includes("people={snapshot?.people ?? []}"), true);
});

test("Room Set preserves mode and returns directly to Run of Show", () => {
  assert.equal(roomSetWorkspaceSource.includes("eventRunOfShowHref(eventId)"), true);
  assert.equal(roomSetWorkspaceSource.includes("Back to {terminology.runOfShow}"), true);
  assert.equal(roomSetWorkspaceSource.includes('aria-label="Switch room/session"'), true);
  assert.equal(roomSetWorkspaceSource.includes("handleRoomSetSessionChangeLedger(eventLedger.target.value)"), true);
  assert.equal(roomSetWorkspaceSource.includes("roomSetHref("), true);
  assert.equal(roomSetWorkspaceSource.includes("Jump to another Run of Show session room set"), false);
  assert.equal(roomSetWorkspaceSource.includes('nextSearchLedger.set("mode", "layout")'), true);
  assert.equal(roomSetWorkspaceSource.includes("nextSearchLedger.set(\"mode\", normalizedModeLedger)"), true);
});

test("embedded Room Set seating remains session-scoped and exact-chair capable", () => {
  assert.equal(roomSetWorkspaceSource.includes("matrixRowId=${encodeURIComponent(sessionId)}"), true);
  assert.equal(roomSetWorkspaceSource.includes("Session-scoped seating for this {terminology.runOfShow} item."), true);
  assert.equal(roomSetWorkspaceSource.includes("Event-wide seating, shown over this room set."), false);
  assert.equal(roomSetWorkspaceSource.includes("standalone Seating page"), false);
  assert.equal(roomSetWorkspaceSource.includes("seatIndex: seatIndexLedger"), true);
  assert.equal(roomSetWorkspaceSource.includes("Chair assignments"), true);
});
