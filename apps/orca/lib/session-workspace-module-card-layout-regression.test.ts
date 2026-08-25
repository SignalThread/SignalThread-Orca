import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sessionWorkspaceSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx",
  "utf8",
);

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

const overviewCardSource = sourceBetween(
  sessionWorkspaceSource,
  "overviewModuleCards.map((item) =>",
  "{activeTab !== \"overview\" ? (",
);
const moduleCardsSource = sourceBetween(
  sessionWorkspaceSource,
  "const overviewModuleCards",
  "const readinessDetailItems",
);

test("Run of Show session overview module cards use taller responsive equal-height rows", () => {
  assert.match(sessionWorkspaceSource, /grid auto-rows-fr grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3/);
  assert.match(overviewCardSource, /min-h-\[150px\]/);
  assert.match(overviewCardSource, /sm:min-h-\[160px\]/);
  assert.match(overviewCardSource, /lg:min-h-\[176px\]/);
  assert.match(overviewCardSource, /xl:min-h-\[188px\]/);
  assert.match(overviewCardSource, /2xl:min-h-\[200px\]/);
  assert.doesNotMatch(overviewCardSource, /auto-rows-\[128px\]/);
  assert.doesNotMatch(overviewCardSource, /h-\[128px\]/);
});

test("Run of Show session overview module cards anchor action text at the bottom", () => {
  assert.match(overviewCardSource, /const moduleCardContent = \(/);
  assert.match(overviewCardSource, /flex min-h-0 flex-1 flex-col px-3 py-3/);
  assert.match(overviewCardSource, /className=\{\[\s*"mt-auto flex h-10 items-center justify-between/);
  assert.match(overviewCardSource, /group-hover:bg-slate-50/);
});

test("Run of Show session overview module card itself is the only active interactive target", () => {
  const linkBranch = sourceBetween(
    overviewCardSource,
    "if (item.href) {",
    "return (\n                    <button",
  );
  const buttonBranch = sourceBetween(
    overviewCardSource,
    "return (\n                    <button",
    "                })}",
  );

  assert.match(overviewCardSource, /<Link[\s\S]*href=\{item\.href\}[\s\S]*data-session-module-card=\{item\.id\}/);
  assert.match(overviewCardSource, /onKeyDown=\{\(event\) => \{[\s\S]*event\.key === " "[\s\S]*event\.currentTarget\.click\(\)/);
  assert.match(overviewCardSource, /<button[\s\S]*type="button"[\s\S]*onClick=\{\(\) => focusWorkspaceTab\(item\.target as WorkspaceTabId\)\}/);
  assert.match(overviewCardSource, /data-session-module-action=\{item\.target\}/);
  assert.doesNotMatch(linkBranch, /<button/);
  assert.doesNotMatch(buttonBranch, /<Link/);
});

test("Run of Show disabled module cards remain non-clickable and aria-disabled", () => {
  const disabledBranch = sourceBetween(
    overviewCardSource,
    "if (item.disabled) {",
    "if (item.href) {",
  );

  assert.match(disabledBranch, /<article/);
  assert.match(disabledBranch, /data-session-module-unavailable=\{item\.id\}/);
  assert.match(disabledBranch, /aria-disabled="true"/);
  assert.doesNotMatch(disabledBranch, /<button|<Link|onClick=|onKeyDown=|href=|tabIndex=|hover:|active:|focus:/);
  assert.match(overviewCardSource, /item\.disabled\s*\? "border-slate-200 border-l-slate-300 border-dashed bg-slate-50 text-slate-500"/);
  assert.match(overviewCardSource, /item\.disabled\s*\? "bg-slate-100 text-slate-500"/);
  assert.doesNotMatch(disabledBranch, /cursor-not-allowed/);
  assert.match(overviewCardSource, /item\.disabled \? item\.actionLabel/);
});

test("Run of Show overview still renders the same six module cards and actions", () => {
  for (const moduleId of ['id: "speakers"', 'id: "av"', 'id: "fnb"', 'id: "staffing"', 'id: "conflicts"']) {
    assert.match(moduleCardsSource, new RegExp(moduleId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(moduleCardsSource, /id: roomSetAndSeatingAvailable \? "room-set" : "room-set-seating"/);

  for (const action of ["Assign & confirm", "Confirm AV", "Build menu", "Review crew", "Review conflicts", "Open Room Set editor"]) {
    assert.match(moduleCardsSource, new RegExp(action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(overviewCardSource, /readinessBadgeClasses\(item\.status\)/);
  assert.match(overviewCardSource, /moduleCardClasses\(item\.status\)/);
  assert.match(overviewCardSource, /moduleAccentClasses\(item\.status\)/);
});
