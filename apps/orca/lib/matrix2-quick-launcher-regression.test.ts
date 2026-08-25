import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const boardSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2Board.tsx", "utf8");
const pageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const drawerSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2DetailsDrawer.tsx", "utf8");
const quickModulesSource = readFileSync("app/(shell)/matrix-2/_components/matrix2-quick-modules.tsx", "utf8");
const readinessSource = readFileSync("app/(shell)/matrix-2/_components/matrix2-session-readiness.ts", "utf8");
const workspaceSource = readFileSync("app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("Matrix session action launcher is click-pinned, interactive, and safely dismissible", () => {
  assert.match(boardSource, /data-matrix2-session-card-id=\{session\.id\}/);
  assert.match(boardSource, /data-matrix2-action-launcher/);
  assert.match(boardSource, /onClick=\{\(event\) => \{[\s\S]*onToggleActions\(session\.id\);[\s\S]*\}\}/);
  assert.match(boardSource, /setActionLauncherPinned\(!isSameSession \|\| !isPinned\)/);
  assert.match(boardSource, /if \(actionLauncherPinnedRef\.current\) return/);
  assert.match(boardSource, /setTimeout\(\(\) => \{[\s\S]*setActionSessionId/);
  assert.match(boardSource, /window\.clearTimeout/);
  assert.match(boardSource, /onPointerEnter=\{[^}]+\}/);
  assert.match(boardSource, /onPointerLeave=\{[^}]+\}/);
  assert.match(boardSource, /pointer-events-auto[^"]*absolute[^"]*z-(?:\d+|\[\d+\])/);
  assert.match(boardSource, /side === "right" \? "right-full" : "left-full"/);
  assert.match(boardSource, /onSessionAction\(session\.id, item\.action\)/);
  assert.match(boardSource, /onSessionAction\(session\.id, "workspace"\)/);
  assert.match(boardSource, /document\.addEventListener\("pointerdown", handlePointerDown\)/);
  assert.match(boardSource, /document\.addEventListener\("keydown", handleKeyDown\)/);
  assert.match(boardSource, /event\.key === "Escape"/);
});

test("Matrix launcher quick tiles open the fast drawer panels instead of routing to full workspace tabs", () => {
  assert.match(pageSource, /import Matrix2DetailsDrawer, \{ type Matrix2QuickPanelKey \}/);
  assert.match(pageSource, /const \[quickDrawerPanel, setQuickDrawerPanel\] = useState<Matrix2QuickPanelKey \| null>\(null\)/);
  assert.match(pageSource, /action === "basics" \|\| action === "speakers" \|\| action === "av" \|\| action === "fnb" \|\| action === "staffing"/);
  assert.match(pageSource, /setZoomMode\("PLANNING"\)/);
  assert.match(pageSource, /handleOpenQuickDrawer\(sessionId, action === "basics" \? null : action\)/);
  assert.match(pageSource, /setQuickDrawerPanel\(panel\);\s*setSelectedSessionId\(sessionId\)/);
  assert.match(pageSource, /initialQuickPanel=\{quickDrawerPanel\}/);
  assert.match(quickModulesSource, /export type Matrix2QuickPanelKey = "speakers" \| "av" \| "fnb" \| "staffing"/);
  assert.match(drawerSource, /export type \{ Matrix2QuickPanelKey \} from "\.\/matrix2-quick-modules"/);
  assert.match(drawerSource, /initialQuickPanel\?: Matrix2QuickPanelKey \| null/);
  assert.match(drawerSource, /useState<DrawerSelectorKey>\(initialQuickPanel\)/);
});

test("Details launcher styling and workspace counts use canonical session readiness", () => {
  assert.match(readinessSource, /details: \{[\s\S]*title: session\.title,[\s\S]*sessionType: session\.sessionType,[\s\S]*roomId: session\.roomId,[\s\S]*startTime: session\.startTime,[\s\S]*endTime: session\.endTime/);
  assert.match(readinessSource, /basics: moduleActionReadiness\(modules, "details", null\)/);
  assert.match(boardSource, /const moduleReadiness = readinessByAction\[module\.action\]/);
  assert.match(boardSource, /status: moduleReadiness\.status/);
  assert.match(boardSource, /tone: moduleReadiness\.tone/);
  assert.doesNotMatch(boardSource, /defaultTone|moduleReadiness\?\./);
  assert.match(boardSource, /data-readiness-status=\{item\.status\}/);
  assert.match(boardSource, /data-readiness-tone=\{item\.tone\}/);
  assert.match(boardSource, /launcherTileClasses\(item\.launcherVariant, item\.tone\)/);
  assert.match(boardSource, /launcherIconPillClasses\(item\.launcherVariant, item\.tone\)/);
  assert.match(workspaceSource, /const statusItems = \[moduleReadiness\.details,/);
  assert.match(boardSource, /Rendering \$\{session\.id\} with fallback layout: invalid time range/);
  assert.doesNotMatch(boardSource, /Skipping \$\{session\.id\}: invalid time range/);
  assert.doesNotMatch(boardSource, /item\.action === "basics"[\s\S]{0,160}(?:emerald|amber|rose|ready|attention|missing)/);
});

test("Matrix launcher guards unavailable Room Set and Seating actions before routing", () => {
  assert.match(pageSource, /const quickModule = matrix2QuickModule\(action\)/);
  assert.match(pageSource, /if \(quickModule && !quickModule\.enabled\) return/);
  assert.match(pageSource, /if \(action === "room-set"\) \{[\s\S]*router\.push\(roomSetHref\(selectedEventId, sessionId, "layout"\)\)/);
  assert.match(pageSource, /if \(action === "seating"\) \{[\s\S]*router\.push\(roomSetHref\(selectedEventId, sessionId, "seating"\)\)/);
  assert.match(boardSource, /Open full workspace/);
  assert.doesNotMatch(boardSource, /Open section/);
});

test("Matrix quick drawer exposes an in-drawer module switcher without closing", () => {
  assert.match(drawerSource, /MATRIX2_QUICK_DRAWER_MODULES\.map/);
  assert.match(quickModulesSource, /module\.destination === "drawer" && module\.quickPanel !== null/);
  for (const label of ['label: "Details"', 'label: "Speakers"', 'label: "AV"', 'label: "F&B"', 'label: "Staffing"']) {
    assert.match(quickModulesSource, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(drawerSource, /function QuickDrawerModuleSwitcher/);
  assert.match(drawerSource, /aria-label="Quick drawer modules"/);
  assert.match(drawerSource, /setActiveQuickPanel\(panel\)/);
  assert.match(drawerSource, /<QuickDrawerModuleSwitcher activePanel=\{activeQuickPanel\} onSwitch=\{switchQuickPanel\} conflictCount=\{activeConflicts\.length\} \/>/);
  assert.doesNotMatch(drawerSource, /function switchQuickPanel[\s\S]{0,240}onClose/);
});

test("Matrix quick drawer exposes a full workspace link from every quick panel", () => {
  assert.match(drawerSource, /import \{ roomSetHref, runOfShowSessionHref \} from "@\/lib\/planning\/routes"/);
  assert.match(drawerSource, /const fullWorkspaceHref = useMemo\(\(\) => \{/);
  assert.match(drawerSource, /return activeQuickPanel \? `\$\{baseHref\}#\$\{activeQuickPanel\}` : baseHref;/);

  assert.equal(drawerSource.match(/href=\{fullWorkspaceHref\}/g)?.length, 1);
  assert.match(drawerSource, /data-session-quick-drawer-footer[\s\S]*href=\{fullWorkspaceHref\}[\s\S]*Full workspace/);
});

test("Matrix quick drawer uses one anchored footer outside tab content", () => {
  const drawerShell = sourceBetween(drawerSource, "return (\n    <aside", "</aside>");
  const footerSource = sourceBetween(drawerShell, "<footer", "</footer>");

  assert.equal(drawerSource.match(/data-session-quick-drawer-footer/g)?.length, 1);
  assert.ok(drawerShell.indexOf("QuickDrawerModuleSwitcher") < drawerShell.indexOf("min-h-0 flex-1 overflow-y-auto"));
  assert.ok(drawerShell.indexOf("min-h-0 flex-1 overflow-y-auto") < drawerShell.indexOf("data-session-quick-drawer-footer"));
  assert.match(footerSource, /grid min-h-\[72px\] shrink-0 grid-cols-2 items-center gap-3/);
  assert.match(footerSource, /px-5 py-3/);
  assert.match(footerSource, /h-11 w-full min-w-0 rounded-xl bg-\[#28439A\]/);
  assert.match(footerSource, /Save changes/);
  assert.match(footerSource, /isBusy \? "Saving\.\.\." : "Save changes"/);
  assert.match(footerSource, /disabled=\{isBusy\}/);
  assert.match(footerSource, /href=\{fullWorkspaceHref\}/);
  assert.match(footerSource, /h-11 w-full min-w-0 items-center justify-center rounded-xl border border-slate-200 bg-white/);
  assert.match(footerSource, /Full workspace/);
  assert.doesNotMatch(drawerSource, /Save session info/);
});

test("Room Set and Seating are intentional, non-interactive production coming-soon tiles", () => {
  const quickModuleEntries = Array.from(quickModulesSource.matchAll(/\{\n\s+action: "([^"]+)"[\s\S]*?\n\s+\},/g)).map((match) => ({
    action: match[1],
    source: match[0],
  }));
  const order = quickModuleEntries.map((entry) => entry.action);
  assert.deepEqual(order, ["basics", "speakers", "av", "fnb", "staffing", "conflicts", "room-set", "seating"]);

  const roomSetEntry = quickModuleEntries.find((entry) => entry.action === "room-set");
  const seatingEntry = quickModuleEntries.find((entry) => entry.action === "seating");
  assert.ok(roomSetEntry, "Room Set quick module should be registered");
  assert.ok(seatingEntry, "Seating quick module should be registered");
  assert.match(roomSetEntry.source, /destination: "workspace"/);
  assert.match(seatingEntry.source, /destination: "workspace"/);
  assert.match(quickModulesSource, /import \{ isSessionModuleAvailable \} from "@\/config\/features"/);
  assert.match(quickModulesSource, /const MATRIX2_ROOM_SET_SEATING_QUICK_LAUNCH_ENABLED = isSessionModuleAvailable\("room-set"\);/);
  assert.match(roomSetEntry.source, /enabled: MATRIX2_ROOM_SET_SEATING_QUICK_LAUNCH_ENABLED/);
  assert.match(seatingEntry.source, /enabled: MATRIX2_ROOM_SET_SEATING_QUICK_LAUNCH_ENABLED/);
  assert.match(roomSetEntry.source, /launcherVariant: "workflow-link"/);
  assert.match(seatingEntry.source, /launcherVariant: "workflow-link"/);
  assert.match(roomSetEntry.source, /launcherTooltip: "Open layout workspace"/);
  assert.match(seatingEntry.source, /launcherTooltip: "Open seating workspace"/);
  assert.doesNotMatch(roomSetEntry.source, /unavailableLabel|destination: "unavailable"/);
  assert.doesNotMatch(seatingEntry.source, /unavailableLabel|destination: "unavailable"/);

  assert.match(boardSource, /const isComingSoonModule = item\.disabled\s*&& \(item\.action === "room-set" \|\| item\.action === "seating"\);/);
  const comingSoonTileSource = sourceBetween(boardSource, "if (isComingSoonModule) {", "if (item.disabled) {");
  assert.match(comingSoonTileSource, /<div/);
  assert.match(comingSoonTileSource, /data-matrix2-coming-soon-action=\{item\.action\}/);
  assert.match(comingSoonTileSource, /Coming soon/);
  assert.doesNotMatch(comingSoonTileSource, /<button|<Link|onClick|onKeyDown|onKeyUp|href=|tabIndex=|role=|cursor-pointer|hover:|active:|opacity-/);
  assert.match(comingSoonTileSource, /bg-\[#f4f7ff\]/);
  assert.match(comingSoonTileSource, /text-\[#243d8e\]/);

  assert.match(boardSource, /if \(item\.disabled\) \{/);
  const disabledTileSource = sourceBetween(boardSource, "if (item.disabled) {", "return (\n            <button");
  assert.match(disabledTileSource, /data-matrix2-disabled-action=\{item\.action\}/);
  assert.match(disabledTileSource, /aria-disabled="true"/);
  assert.match(disabledTileSource, /tabIndex=\{-1\}/);
  assert.match(disabledTileSource, /pointer-events-none[^\"]*cursor-not-allowed/);
  assert.doesNotMatch(disabledTileSource, /onClick|onKeyDown|title=|href=/);
  assert.match(boardSource, /disabled: !module\.enabled \|\| !isSessionModuleAvailable\(module\.action\)/);
  assert.match(boardSource, /launcherVariant: module\.launcherVariant \?\? "module"/);
  assert.match(boardSource, /statusLabel: module\.launcherTooltip \?\? moduleReadiness\.label/);
  assert.match(boardSource, /if \(launcherVariant === "workflow-link"\) return "bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200 hover:text-slate-800"/);
  assert.match(boardSource, /if \(launcherVariant === "workflow-link"\) return "bg-slate-200 text-slate-500"/);
  assert.match(boardSource, /launcherTileClasses\(item\.launcherVariant, item\.tone\)/);
  assert.match(boardSource, /launcherIconPillClasses\(item\.launcherVariant, item\.tone\)/);
  assert.doesNotMatch(boardSource, /action === "room-set" && tone === "ready"/);
  assert.doesNotMatch(roomSetEntry.source, /amber|yellow|emerald|green/);
  assert.doesNotMatch(seatingEntry.source, /amber|yellow|emerald|green/);
  assert.doesNotMatch(boardSource, /item\.unavailableLabel/);
  assert.doesNotMatch(comingSoonTileSource, /bg-slate-|text-slate-/);
  assert.doesNotMatch(comingSoonTileSource, /cursor-not-allowed/);
});
