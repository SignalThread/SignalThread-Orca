import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Session workspace density pass: the session header uses the event module
// surface, but stays compact instead of rendering a tall hero card.

const sessionWorkspaceSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx",
  "utf8",
);

const statusBarSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-readiness-status-bar.tsx",
  "utf8",
);

function headerSource(): string {
  const start = sessionWorkspaceSource.indexOf("<EventModuleSurface");
  assert.ok(start > -1, "session header EventModuleSurface not found");
  const end = sessionWorkspaceSource.indexOf("{notice ?", start);
  assert.ok(end > start, "header end marker not found");
  return sessionWorkspaceSource.slice(start, end);
}

test("session header adopts the event module surface with compact density", () => {
  assert.match(
    sessionWorkspaceSource,
    /import \{\s*EVENT_MODULE_PRIMARY_CLASS,\s*EventModuleSurface,\s*\} from "@\/app\/\(shell\)\/events\/\[eventId\]\/_components\/event-module-header";/,
  );
  const header = headerSource();
  assert.match(header, /<EventModuleSurface/);
  assert.match(header, /paddingClassName="px-4 py-3"/);
  assert.match(header, /className="rounded-xl"/);
  assert.match(header, /flex min-h-14 flex-wrap items-center/);
  assert.match(header, /<SessionReadinessStatusBar/);
  assert.match(statusBarSource, /role="group"\s*\n\s*aria-label="Session readiness"/);
});

test("session header includes a compact inline Run of Show back control", () => {
  const header = headerSource();
  assert.match(header, /href=\{eventRunOfShowHref\(eventId\)\}/);
  assert.match(header, /aria-label=\{`Back to \$\{terminology\.runOfShow\}`\}/);
  assert.match(header, /<ArrowLeft className="h-3\.5 w-3\.5" aria-hidden \/>/);
  assert.match(header, /inline-flex h-8 shrink-0 items-center/);
  assert.match(header, /<span className="hidden sm:inline">\{terminology\.runOfShow\}<\/span>/);
});

test("session header preserves switcher, type, and inline time/room context", () => {
  const header = headerSource();
  assert.match(header, /<SessionHeaderSwitcher/);
  assert.match(header, /\{sessionType \|\| "Session"\}/);
  assert.match(header, /<Clock3 className="h-3\.5 w-3\.5 shrink-0 text-slate-500" aria-hidden \/>/);
  assert.match(header, /\{formatTimeLabel\(startTime\)\}-\{formatTimeLabel\(endTime\)\}/);
  assert.match(header, /<MapPin className="h-3\.5 w-3\.5 shrink-0 text-slate-500" aria-hidden \/>/);
  assert.match(header, /\{session\.roomName \|\| "Room unassigned"\}/);
});

test("session header keeps readiness inline and compact, now as interactive status chips", () => {
  const header = headerSource();
  // Readiness stays in the header action cluster rather than growing into a panel or card.
  assert.match(header, /<SessionReadinessStatusBar/);
  assert.match(header, /items=\{readinessDetailItems\}/);
  assert.match(header, /<AttentionPopoverButton/);
  // The chips themselves stay compact: min-h-9 pills matching the surrounding controls.
  assert.match(statusBarSource, /min-h-9 items-center gap-1\.5 rounded-full border px-3 py-1\.5 text-\[11px\]/);
  assert.match(statusBarSource, /flex-wrap/);
});

test("session header folds attention issues into an anchored popover trigger", () => {
  const header = headerSource();
  const popoverStart = sessionWorkspaceSource.indexOf("function AttentionPopoverButton({");
  assert.ok(popoverStart > -1, "AttentionPopoverButton not found");
  const popoverEnd = sessionWorkspaceSource.indexOf("function SessionHeaderSwitcher({", popoverStart);
  assert.ok(popoverEnd > popoverStart, "AttentionPopoverButton end marker not found");
  const popover = sessionWorkspaceSource.slice(popoverStart, popoverEnd);

  assert.match(popover, /if \(items\.length === 0\) return null;/);
  assert.match(popover, /\{items\.length\} need attention/);
  assert.match(popover, /aria-expanded=\{isOpen\}/);
  assert.match(popover, /onClick=\{\(\) => setIsOpen\(\(current\) => !current\)\}/);
  assert.match(popover, /role="dialog"/);
  assert.match(popover, /Needs your attention/);
  assert.match(popover, /worst first/);
  assert.doesNotMatch(header, /View all/);
});

test("session header leaves global actions to the module selector and speaker workflow", () => {
  const header = headerSource();
  assert.doesNotMatch(header, /Speaker Directory/);
  assert.doesNotMatch(header, /href=\{`\/events\/\$\{encodeURIComponent\(eventId\)\}\/speakers`\}/);
  assert.doesNotMatch(header, /void handleSave\(\);/);
  assert.doesNotMatch(header, /\{isSaving \? "Saving\.\.\." : "Save"\}/);
});

test("module selector row owns the compact primary Save action", () => {
  const tabsStart = sessionWorkspaceSource.indexOf("function SessionModuleTabs(");
  assert.ok(tabsStart > -1, "SessionModuleTabs not found");
  const tabsEnd = sessionWorkspaceSource.indexOf("function AttentionPopoverButton({", tabsStart);
  assert.ok(tabsEnd > tabsStart, "SessionModuleTabs end marker not found");
  const tabs = sessionWorkspaceSource.slice(tabsStart, tabsEnd);

  assert.match(tabs, /className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-100\/70 p-1"/);
  assert.match(tabs, /<nav\s+aria-label="Session modules"/);
  assert.match(tabs, /className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"/);
  assert.match(tabs, /onClick=\{onSave\}/);
  assert.match(tabs, /disabled=\{isSaving \|\| saveDisabled\}/);
  assert.match(tabs, /inline-flex h-8 shrink-0 items-center rounded-lg px-3\.5/);
  assert.match(tabs, /\$\{EVENT_MODULE_PRIMARY_CLASS\}/);
  assert.match(tabs, /\{isSaving \? "Saving\.\.\." : "Save"\}/);
});
