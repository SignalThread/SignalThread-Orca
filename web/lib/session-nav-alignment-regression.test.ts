import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const eventShellSource = readFileSync(
  "app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx",
  "utf8",
);
const sessionWorkspaceSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx",
  "utf8",
);

function tabsSource(): string {
  const start = sessionWorkspaceSource.indexOf("function SessionModuleTabs(");
  assert.ok(start > -1, "SessionModuleTabs not found");
  const end = sessionWorkspaceSource.indexOf("function SessionHeaderSwitcher(");
  assert.ok(end > start, "SessionHeaderSwitcher marker not found");
  return sessionWorkspaceSource.slice(start, end);
}

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("the event shell does not bypass its chrome for the session route", () => {
  assert.doesNotMatch(eventShellSource, /if \(isSessionCommandCenterRoute\) \{/);
  assert.doesNotMatch(eventShellSource, /h-dvh overflow-hidden bg-\[#e8edf4\]/);
  assert.match(eventShellSource, /const isRoomSetWorkspaceRoute =/);
});

test("the separate session left rail is absent", () => {
  assert.doesNotMatch(sessionWorkspaceSource, /function SessionCommandRail/);
  assert.doesNotMatch(sessionWorkspaceSource, /<SessionCommandRail/);
  assert.doesNotMatch(sessionWorkspaceSource, /aria-label="Contextual session rail"/);
  assert.doesNotMatch(sessionWorkspaceSource, /railItemClasses/);
});

test("session module navigation remains an in-content horizontal tab row", () => {
  const tabs = tabsSource();
  assert.match(sessionWorkspaceSource, /<SessionModuleTabs\s/);
  assert.match(tabs, /className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-100\/70 p-1"/);
  assert.match(tabs, /<nav\s+aria-label="Session modules"/);
  assert.match(tabs, /className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"/);
  assert.match(tabs, /inline-flex h-8 shrink-0 items-center gap-1\.5 rounded-lg border px-2\.5 text-\[12px\]/);
  assert.match(tabs, /onClick=\{\(\) => onFocus\(item\.id\)\}/);
  assert.match(tabs, /const active = activeTab === item\.id;/);
  assert.match(tabs, /aria-current=\{active \? "page" : undefined\}/);
});

test("session module selector carries the compact primary save action", () => {
  const tabs = tabsSource();
  assert.match(tabs, /onClick=\{onSave\}/);
  assert.match(tabs, /disabled=\{isSaving \|\| saveDisabled\}/);
  assert.match(tabs, /inline-flex h-8 shrink-0 items-center rounded-lg px-3\.5/);
  assert.match(tabs, /\$\{EVENT_MODULE_PRIMARY_CLASS\}/);
  assert.match(tabs, /\{isSaving \? "Saving\.\.\." : "Save"\}/);
});

test("module tabs preserve readiness color and Room Set/Seating production gate", () => {
  const tabs = tabsSource();
  const unavailableTab = sourceBetween(tabs, "return item.disabled ? (", ") : (\n            <Link");
  assert.match(tabs, /readinessDotClasses\(item\.status\)/);
  assert.match(tabs, /href=\{item\.href \?\? "#"\}/);
  assert.doesNotMatch(tabs, /aria-label=\{ROOM_SET_SEATING_COMING_SOON_BADGE\}/);
  assert.match(unavailableTab, /<span/);
  assert.match(unavailableTab, /data-session-module-unavailable=\{item\.id\}/);
  assert.match(unavailableTab, /aria-disabled="true"/);
  assert.match(unavailableTab, /border-transparent bg-slate-200\/70 text-slate-500/);
  assert.doesNotMatch(unavailableTab, /cursor-not-allowed/);
  assert.doesNotMatch(unavailableTab, /<button|<Link|onClick|onKeyDown|href=|tabIndex=|hover:|active:|focus:/);
  assert.doesNotMatch(tabs, /title=\{`\$\{item\.label\} is not available in production\.`\}/);
  assert.match(tabs, /\) : \(\s*<Link[\s\S]*href=\{item\.href \?\? "#"\}/);
});
