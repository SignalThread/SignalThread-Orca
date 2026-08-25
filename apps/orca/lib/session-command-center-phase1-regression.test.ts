import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const eventShellSource = readFileSync("app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx", "utf8");
const sessionWorkspaceSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx",
  "utf8",
);
const matrix2DrawerSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2DetailsDrawer.tsx", "utf8");
const requirementCatalogSource = readFileSync("lib/session-requirement-catalog.ts", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("session workspace renders inside the normal event shell without a rail bypass", () => {
  assert.equal(eventShellSource.includes('return <div className="h-dvh overflow-hidden bg-[#e8edf4]">{children}</div>;'), false);
  assert.equal(eventShellSource.includes("isSessionCommandCenterRoute"), false);
  assert.equal(sessionWorkspaceSource.includes('aria-label="Contextual session rail"'), false);
  assert.equal(sessionWorkspaceSource.includes("function SessionCommandRail"), false);
  assert.equal(sessionWorkspaceSource.includes("Back to event workspace"), false);
});

test("session workspace is a compact content stack with horizontal module tabs", () => {
  assert.equal(sessionWorkspaceSource.includes('className="space-y-2.5 text-slate-900"'), true);
  assert.equal(sessionWorkspaceSource.includes("min-h-screen bg-[#e8edf4]"), false);
  assert.equal(sessionWorkspaceSource.includes("function SessionModuleTabs"), true);
  assert.equal(sessionWorkspaceSource.includes("<SessionModuleTabs"), true);
});

test("event shell keeps a compact event header for Run of Show workspaces", () => {
  const topNavSource = sourceBetween(eventShellSource, "const renderWorkspaceTopNav = () => (", "  return (");

  assert.equal(topNavSource.includes("min-h-[76px]"), true);
  assert.equal(topNavSource.includes("px-6 py-3"), true);
  assert.equal(topNavSource.includes("<EventModuleSwitcher eventId={eventId} runOfShowLabel={terms.runOfShow} />"), true);
  assert.equal(topNavSource.includes("<NotificationsBell />"), true);
  assert.equal(topNavSource.includes("<LogoutButton />"), true);
  assert.equal(eventShellSource.includes("!isRoomSetWorkspaceRoute && !shouldShowWorkspaceTopNav"), true);
});

test("session tabs include required module navigation and compact readiness copy", () => {
  for (const label of [
    "Overview",
    "Speakers",
    "AV",
    "F&B",
    "Staffing",
    "Room Set",
    "Seating",
    "Conflicts",
    "Notes / Activity",
  ]) {
    assert.equal(sessionWorkspaceSource.includes(label), true);
  }

  // Readiness is compact in the header and tabs, and every count is enumerable rather than
  // rendered as inert text.
  assert.equal(sessionWorkspaceSource.includes("<SessionReadinessStatusBar"), true);
  assert.equal(sessionWorkspaceSource.includes("readinessDetailItems"), true);
  assert.equal(sessionWorkspaceSource.includes("readinessSummary"), false);
  assert.equal(sessionWorkspaceSource.includes("No module can be manually marked done here."), false);
  assert.equal(sessionWorkspaceSource.includes("type SessionReadinessStatus"), true);
});

test("session command center uses the shared readiness contract for module status", () => {
  assert.equal(sessionWorkspaceSource.includes("@/lib/session-readiness"), true);
  assert.equal(sessionWorkspaceSource.includes("deriveSessionReadiness"), true);
  assert.equal(sessionWorkspaceSource.includes("SESSION_READINESS_METADATA"), true);
  assert.equal(sessionWorkspaceSource.includes("badge: SESSION_READINESS_METADATA[readiness.status].label"), true);
  assert.equal(sessionWorkspaceSource.includes("moduleReadiness[\"room-set\"].status"), true);
  assert.equal(sessionWorkspaceSource.includes("moduleReadiness.seating.status"), true);
  assert.equal(sessionWorkspaceSource.includes("const combinedRoomSetStatus"), true);
  assert.equal(sessionWorkspaceSource.includes("badge: SESSION_READINESS_METADATA[combinedRoomSetStatus].label"), true);
  assert.equal(sessionWorkspaceSource.includes("entry.status === \"ready\""), true);
  assert.equal(sessionWorkspaceSource.includes("entry.status === \"blocked\""), true);
  assert.equal(sessionWorkspaceSource.includes("readinessBadgeClasses(item.status)"), true);
  assert.equal(sessionWorkspaceSource.includes("readinessDotClasses(item.status)"), true);
  assert.equal(sessionWorkspaceSource.includes("moduleCardClasses(item.status)"), true);
  // The compact tabs and module cards carry readiness color without the old helper.
  assert.equal(sessionWorkspaceSource.includes("readinessBadgeClasses(item.status)"), true);
  assert.equal(sessionWorkspaceSource.includes("railItemClasses"), false);
  assert.equal(sessionWorkspaceSource.includes("type ReadinessTone"), false);
  assert.equal(sessionWorkspaceSource.includes('?? "ready"'), false);
  assert.equal(sessionWorkspaceSource.includes("badge: selectedSpeakers.length"), false);
  assert.equal(sessionWorkspaceSource.includes("badge: hasCapacityBlocker"), false);
  assert.equal(sessionWorkspaceSource.includes("tone: hasCapacityBlocker"), false);
});

test("session command center can render every canonical readiness status through metadata", () => {
  for (const status of ["blocked", "needs_info", "not_started", "ready", "not_needed"]) {
    assert.equal(sessionWorkspaceSource.includes(`SESSION_READINESS_METADATA[${status}`), false);
    assert.equal(sessionWorkspaceSource.includes(`status === "${status}"`) || sessionWorkspaceSource.includes(`status !== "${status}"`), true);
  }

  assert.equal(sessionWorkspaceSource.includes("SESSION_READINESS_METADATA[status].badgeClassName"), true);
  assert.equal(sessionWorkspaceSource.includes("SESSION_READINESS_METADATA[overviewStatus].label"), true);
  assert.equal(sessionWorkspaceSource.includes("SESSION_READINESS_METADATA[readiness.status].label"), true);
});

test("session command center defaults to overview and supports hash/query focus", () => {
  assert.equal(sessionWorkspaceSource.includes("initialWorkspaceFocus(searchParams)"), true);
  assert.equal(sessionWorkspaceSource.includes('return "overview";'), true);
  assert.equal(sessionWorkspaceSource.includes('normalized === "notes"'), true);
  assert.equal(sessionWorkspaceSource.includes('window.addEventListener("hashchange", applyDeepLinkFocus);'), true);
  assert.equal(sessionWorkspaceSource.includes('searchParams.get("tab")'), true);
  assert.equal(sessionWorkspaceSource.includes('id: "fnb"'), true);
  assert.equal(sessionWorkspaceSource.includes('id: "speakers"'), true);
  assert.equal(sessionWorkspaceSource.includes('id: "conflicts"'), true);
});

test("header session switcher reuses loaded snapshot sessions and preserves focused workspace routing", () => {
  assert.equal(sessionWorkspaceSource.includes("function SessionHeaderSwitcher"), true);
  assert.equal(sessionWorkspaceSource.includes("snapshot?.sessions ?? []"), true);
  assert.equal(sessionWorkspaceSource.includes("placeholder=\"Search sessions\""), true);
  assert.equal(sessionWorkspaceSource.includes("buildSessionWorkspaceSwitchHref"), true);
  assert.equal(sessionWorkspaceSource.includes('return roomSetHref(eventId, targetSessionId, "layout")'), true);
  assert.equal(sessionWorkspaceSource.includes('return roomSetHref(eventId, targetSessionId, "seating")'), true);
  assert.equal(sessionWorkspaceSource.includes("runOfShowSessionHref(eventId, targetSessionId)"), true);
  assert.equal(sessionWorkspaceSource.includes('return nextFocus && nextFocus !== "overview" ? `${baseHref}#${nextFocus}` : baseHref;'), true);
});

test("Room Set and Seating remain existing editor link-outs", () => {
  assert.equal(sessionWorkspaceSource.includes('roomSetHref(eventId, sessionId, "layout")'), true);
  assert.equal(sessionWorkspaceSource.includes('roomSetHref(eventId, sessionId, "seating")'), true);
  assert.equal(sessionWorkspaceSource.includes('router.replace(roomSetHref(eventId, sessionId, "layout"))'), true);
  assert.equal(sessionWorkspaceSource.includes('router.replace(roomSetHref(eventId, sessionId, "seating"))'), true);
  assert.equal(sessionWorkspaceSource.includes('activeTab === "room-set"'), false);
});

test("overview body starts with module tabs and keeps Run of Show escape hatch", () => {
  assert.equal(sessionWorkspaceSource.includes("Modules"), true);
  assert.equal(sessionWorkspaceSource.includes("readiness · key facts · one action each"), true);
  const overviewRenderSource = sourceBetween(sessionWorkspaceSource, "{activeTab === \"overview\"", "{activeTab === \"fnb\"");
  assert.equal(overviewRenderSource.indexOf("<SessionModuleTabs") < overviewRenderSource.indexOf("Modules"), true);
  assert.equal(overviewRenderSource.includes("Needs your attention"), false);
  assert.equal(overviewRenderSource.includes("View all"), false);
  assert.equal(overviewRenderSource.includes("resolve in module"), false);
  assert.equal(sessionWorkspaceSource.includes("Session basics"), false);
  assert.equal(sessionWorkspaceSource.includes("Expected attendance"), false);
  assert.equal(sessionWorkspaceSource.includes("eventRunOfShowHref(eventId)"), true);
  assert.equal(sessionWorkspaceSource.includes("terminology.runOfShow"), true);
});

test("needs attention lives in the header popover, not a body drawer or alert bar", () => {
  const overviewRenderSource = sourceBetween(sessionWorkspaceSource, "{activeTab === \"overview\"", "{activeTab === \"fnb\"");
  const headerSource = sourceBetween(sessionWorkspaceSource, "<EventModuleSurface", "{notice ?");
  const popoverSource = sourceBetween(sessionWorkspaceSource, "function AttentionPopoverButton({", "function SessionHeaderSwitcher({");
  const attentionSource = sourceBetween(sessionWorkspaceSource, "const attentionItems = useMemo<AttentionItem[]>(() => {", "function focusWorkspaceTab");

  assert.equal(overviewRenderSource.includes("Needs your attention"), false);
  assert.equal(sessionWorkspaceSource.includes("function AttentionDrawer"), false);
  assert.equal(sessionWorkspaceSource.includes("<AttentionDrawer"), false);
  assert.equal(sessionWorkspaceSource.includes("attentionDrawerOpen"), false);
  assert.equal(sessionWorkspaceSource.includes("inlineAttentionItems"), false);
  assert.equal(headerSource.includes("<AttentionPopoverButton"), true);
  assert.equal(popoverSource.includes("if (items.length === 0) return null;"), true);
  assert.equal(popoverSource.includes("{items.length} need attention"), true);
  assert.equal(popoverSource.includes('aria-expanded={isOpen}'), true);
  assert.equal(popoverSource.includes('aria-label="Needs your attention"'), true);
  assert.equal(popoverSource.includes("worst first"), true);
  assert.equal(popoverSource.includes('document.addEventListener("pointerdown", onPointerDown);'), true);
  assert.equal(popoverSource.includes('event.key === "Escape"'), true);
  assert.equal(popoverSource.includes("items.map((item) =>"), true);
  assert.equal(popoverSource.includes("attentionIssueLabel(item)"), true);
  assert.equal(popoverSource.includes("attentionActionLabel(item)"), true);
  assert.equal(popoverSource.includes("onFollow(item)"), true);
  assert.equal(attentionSource.includes("readinessResult.attentionItems.map"), true);
  assert.equal(attentionSource.includes('id: "overview-ready"'), false);
  assert.equal(attentionSource.includes("selectedSpeakers.length === 0"), false);
  assert.equal(attentionSource.includes("selectedAvRequirementCount === 0"), false);
  assert.equal(attentionSource.includes("expectedAttendance !== null && fnbAssignments.length"), false);
  assert.equal(attentionSource.includes(".slice("), false);
});

test("session header excludes global speaker directory and save actions", () => {
  const headerSource = sourceBetween(
    sessionWorkspaceSource,
    "<EventModuleSurface",
    "{notice ?",
  );

  assert.equal(headerSource.includes("Speaker Directory"), false);
  assert.equal(headerSource.includes('href={`/events/${encodeURIComponent(eventId)}/speakers`}'), false);
  assert.equal(headerSource.includes("void handleSave();"), false);
  assert.equal(headerSource.includes('{isSaving ? "Saving..." : "Save"}'), false);
  assert.equal(sessionWorkspaceSource.includes("<SpeakerPicker"), true);
});

test("module selector row renders Save on the far right as the primary action", () => {
  const tabsSource = sourceBetween(
    sessionWorkspaceSource,
    "function SessionModuleTabs({",
    "function AttentionPopoverButton({",
  );
  const overviewRenderSource = sourceBetween(sessionWorkspaceSource, "{activeTab === \"overview\"", "{activeTab === \"fnb\"");

  assert.equal(tabsSource.includes('className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-100/70 p-1"'), true);
  assert.equal(tabsSource.includes('aria-label="Session modules"'), true);
  assert.equal(tabsSource.includes('className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"'), true);
  assert.equal(tabsSource.includes("onClick={onSave}"), true);
  assert.equal(tabsSource.includes("disabled={isSaving || saveDisabled}"), true);
  assert.equal(tabsSource.includes("inline-flex h-8 shrink-0 items-center rounded-lg px-3.5"), true);
  assert.equal(tabsSource.includes("${EVENT_MODULE_PRIMARY_CLASS}"), true);
  assert.equal(tabsSource.includes('{isSaving ? "Saving..." : "Save"}'), true);
  assert.equal(overviewRenderSource.includes("onSave={handleWorkspaceSave}"), true);
  assert.equal(sessionWorkspaceSource.includes("function handleWorkspaceSave()"), true);
  assert.equal(sessionWorkspaceSource.includes("void handleSave();"), true);
});

test("workspace save omits an empty legacy status instead of sending an invalid update", () => {
  assert.equal(sessionWorkspaceSource.includes("status: statusLabelValue.trim() || undefined"), true);
});

test("session header keeps the Run of Show return control compact and inline", () => {
  const headerSource = sourceBetween(
    sessionWorkspaceSource,
    "<EventModuleSurface",
    "{notice ?",
  );

  assert.equal(headerSource.includes("href={eventRunOfShowHref(eventId)}"), true);
  assert.equal(headerSource.includes('aria-label={`Back to ${terminology.runOfShow}`}'), true);
  assert.equal(headerSource.includes('<ArrowLeft className="h-3.5 w-3.5" aria-hidden />'), true);
  assert.equal(headerSource.includes('className="inline-flex h-8 shrink-0 items-center'), true);
  assert.equal(headerSource.includes('<span className="hidden sm:inline">{terminology.runOfShow}</span>'), true);
  assert.equal(headerSource.includes("<nav"), false);
  assert.equal(headerSource.includes("breadcrumb"), false);
  assert.equal(headerSource.includes("Back to event workspace"), false);
});

test("session workspace SpeakerPicker can create or reuse an event speaker and assign it", () => {
  const pickerSource = sourceBetween(sessionWorkspaceSource, "function SpeakerPicker({", "function AttendeeRosterSection");

  assert.equal(pickerSource.includes("New speaker"), true);
  assert.equal(pickerSource.includes("First name"), true);
  assert.equal(pickerSource.includes("Last name"), true);
  assert.equal(pickerSource.includes("Email"), true);
  assert.equal(pickerSource.includes("function isValidSpeakerEmail"), false);
  assert.equal(sessionWorkspaceSource.includes("function isValidSpeakerEmail(value: string): boolean"), true);
  assert.equal(pickerSource.includes("async function createAndAssignSpeaker()"), true);
  assert.equal(pickerSource.includes("First name and last name are required."), true);
  assert.equal(pickerSource.includes("Enter a valid speaker email."), true);
  assert.equal(pickerSource.includes('fetch(`/api/events/${eventId}/speakers`, {'), true);
  assert.equal(pickerSource.includes('method: "POST"'), true);
  assert.equal(pickerSource.includes("response.status === 409"), true);
  assert.equal(pickerSource.includes("const speakers = await loadSpeakers();"), true);
  assert.equal(pickerSource.includes('normalizeSpeakerEmail(entry.email ?? "") === email'), true);
  assert.equal(pickerSource.includes("await assignSpeaker(speaker);"), true);
  assert.equal(pickerSource.includes('href={`/events/${encodeURIComponent(eventId)}/speakers`}'), true);
  assert.equal(pickerSource.includes("Manage speakers in Speaker Directory"), true);
});

test("overview module grid matches the reference module set", () => {
  assert.equal(sessionWorkspaceSource.includes("OPERATIONAL_GLANCE_FOCUS_IDS"), true);
  assert.equal(sessionWorkspaceSource.includes('new Set<WorkspaceTabId>(["speakers", "av", "fnb", "staffing", "supplies", "signage"])'), true);
  assert.equal(sessionWorkspaceSource.includes('id: "room-set"'), true);

  const glanceSource = sourceBetween(sessionWorkspaceSource, "const overviewModuleCards", "const readinessDetailItems");
  const overviewRenderSource = sourceBetween(sessionWorkspaceSource, "readiness · key facts · one action each", "{activeTab === \"fnb\"");

  assert.equal(glanceSource.includes('item.id !== "overview"'), false);
  assert.equal(glanceSource.includes('id: "conflicts"'), true);
  assert.equal(glanceSource.includes('id: "notes-activity"'), false);
  assert.equal(glanceSource.includes("ROOM_SET_SEATING_COMBINED_LABEL"), true);
  assert.equal(glanceSource.includes('id: "attendee-roster"'), false);
  assert.equal(glanceSource.includes('label: "Attendee Roster"'), false);
  assert.equal(glanceSource.includes('label: "Notes / Activity"'), false);
  assert.equal(glanceSource.includes("No notes yet"), false);
  assert.equal(glanceSource.includes("Log a decision or capture activity for this session."), false);
  assert.equal(glanceSource.includes("Add a note"), false);
  assert.equal(overviewRenderSource.includes("overviewModuleCards.map((item) =>"), true);
  assert.equal(overviewRenderSource.includes("auto-rows-fr"), true);
  assert.equal(overviewRenderSource.includes("min-h-[150px]"), true);
  assert.equal(overviewRenderSource.includes("xl:min-h-[188px]"), true);
  assert.equal(overviewRenderSource.includes("2xl:min-h-[200px]"), true);
  assert.equal(overviewRenderSource.includes("xl:grid-cols-3"), true);
  assert.equal(overviewRenderSource.includes("min-[1320px]:grid-cols-4"), false);
  assert.equal(overviewRenderSource.includes("<AttendeeRosterSection"), false);
  assert.equal(overviewRenderSource.includes("Attendee Roster"), false);
  assert.equal(overviewRenderSource.includes("Session basics"), false);
  assert.equal(overviewRenderSource.includes("Expected attendance"), false);
});

test("at-a-glance overview cards render live operational content and actions", () => {
  const glanceSource = sourceBetween(sessionWorkspaceSource, "const overviewModuleCards", "const readinessDetailItems");

  for (const moduleId of ['id: "speakers"', 'id: "av"', 'id: "fnb"', 'id: "staffing"', 'id: "supplies"', 'id: "signage"', 'id: "conflicts"']) {
    assert.equal(glanceSource.includes(moduleId), true);
  }
  assert.equal(glanceSource.includes("ROOM_SET_SEATING_COMBINED_LABEL"), true);
  assert.equal(glanceSource.includes('id: "notes-activity"'), false);
  assert.equal(glanceSource.includes('id: "attendee-roster"'), false);

  for (const action of ["Assign & confirm", "Confirm AV", "Build menu", "Review crew", "Review supplies", "Review signage", "Review conflicts", "Open Room Set editor"]) {
    assert.equal(glanceSource.includes(action), true);
  }

  for (const operationalCopy of [
    "catalog item",
    "F&B forecast",
    "crew assignment",
    "Capacity",
    "speaker",
  ]) {
    assert.equal(glanceSource.includes(operationalCopy), true);
  }
  assert.equal(glanceSource.includes("Notes / Activity"), false);
  assert.equal(glanceSource.includes("Add a note"), false);
  assert.equal(glanceSource.includes("Attendee Roster"), false);

  assert.equal(glanceSource.includes("SESSION_READINESS_METADATA"), true);
  assert.equal(sessionWorkspaceSource.includes("readinessBadgeClasses(item.status)"), true);
});

test("staffing overview and detail use staffing needs plus assigned crew, not F&B packages", () => {
  const glanceSource = sourceBetween(sessionWorkspaceSource, "const overviewModuleCards", "const readinessDetailItems");
  const staffingTabSource = sourceBetween(sessionWorkspaceSource, '{activeTab === "staffing"', '{activeTab === "speakers"');

  assert.equal(sessionWorkspaceSource.includes("isStaffingNeedRequirementItem"), true);
  assert.equal(sessionWorkspaceSource.includes('sectionType !== "AV" && sectionType !== "STAFFING"'), true);
  assert.equal(glanceSource.includes("selectedStaffingRequirementItems.map(formatStaffingNeedLabel)"), true);
  assert.equal(glanceSource.includes("Staffing needs selected"), true);
  assert.equal(glanceSource.includes("Review crew"), true);
  assert.equal(staffingTabSource.includes('title="Staffing needs"'), true);
  assert.equal(staffingTabSource.includes('title="Assigned crew"'), true);
  assert.equal(staffingTabSource.includes("Crew assignment directory coming next"), true);
  assert.equal(staffingTabSource.includes("Mimosa Bar Package"), false);
  assert.equal(staffingTabSource.includes("Add custom taxonomy item"), false);
});

test("staffing quick drawer filters F&B package items out of staffing needs", () => {
  assert.equal(requirementCatalogSource.includes("export function isStaffingNeedRequirementItem"), true);
  assert.equal(requirementCatalogSource.includes('"mimosa"'), true);
  assert.equal(requirementCatalogSource.includes('"package"'), true);
  assert.equal(matrix2DrawerSource.includes("isStaffingNeedRequirementItem"), true);
  assert.equal(matrix2DrawerSource.includes('sectionType === "STAFFING" && !isStaffingNeedRequirementItem(item)'), true);
  assert.equal(matrix2DrawerSource.includes("Assigned crew"), true);
  assert.equal(matrix2DrawerSource.includes("Staffing needs"), true);
  assert.equal(matrix2DrawerSource.includes("Role/count requirement"), true);
  assert.equal(matrix2DrawerSource.includes("Mimosa Bar Package"), false);
});
