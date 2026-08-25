import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const boardSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2Board.tsx", "utf8");
const sessionVisualsSource = readFileSync("lib/matrix2-session-visuals.ts", "utf8");
const pageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const conflictUtilsSource = readFileSync("app/(shell)/matrix-2/_components/conflict-utils.ts", "utf8");
const readinessSource = readFileSync("app/(shell)/matrix-2/_components/matrix2-session-readiness.ts", "utf8");
const workspaceSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx",
  "utf8",
);

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : source.length;
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("Run of Show board cards use the canonical session-type visual mapping", () => {
  const typeColorSource = sourceBetween(boardSource, "export function typeColorClasses", "function layoutRoomSessions");
  const sessionCardSource = sourceBetween(boardSource, "const SessionCard = memo(function SessionCard", "");

  assert.match(typeColorSource, /export function sessionCardTypeClasses/);
  assert.match(typeColorSource, /matrix2SessionTypeBadgeClasses/);
  assert.match(typeColorSource, /matrix2SessionCardTypeClasses/);
  assert.match(sessionCardSource, /sessionCardTypeClasses\(session\.sessionType\)/);
  assert.doesNotMatch(sessionCardSource, /typeColorClasses\(session\.sessionType\)/);
  assert.match(sessionVisualsSource, /border-l-4/);
  assert.match(sessionVisualsSource, /border-l-violet-500/);
  assert.match(sessionVisualsSource, /border-l-sky-500/);
  assert.match(sessionVisualsSource, /border-l-fuchsia-500/);
  assert.match(sessionVisualsSource, /border-l-amber-500/);
  assert.match(sessionVisualsSource, /border-l-teal-500/);
  assert.match(sessionVisualsSource, /border-l-cyan-500/);
  assert.match(sessionVisualsSource, /border-l-indigo-500/);
});

test("Run of Show conflicts layer a subtle red top accent over the session type card", () => {
  const sessionCardSource = sourceBetween(boardSource, "const SessionCard = memo(function SessionCard", "");

  assert.match(sessionCardSource, /const conflictAccentClass = summary\.total > 0/);
  assert.match(sessionCardSource, /border-t-2 border-t-rose-200/);
  assert.match(sessionCardSource, /isSelected[\s\S]*border-t-2 border-t-rose-400/);
  assert.doesNotMatch(sessionCardSource, /border-amber-300|border-rose-300/);
  assert.match(sessionCardSource, /MatrixConflictTooltipList conflicts=\{conflicts\}/);
  assert.match(sessionCardSource, /AlertTriangle/);
  assert.doesNotMatch(sessionCardSource, /bg-rose-50 text-rose-950/);
  assert.doesNotMatch(sessionCardSource, /bg-amber-50 text-amber-950/);
  assert.doesNotMatch(sessionCardSource, /bg-emerald-50 text-emerald-950/);
});

test("Run of Show launcher and list use shared readiness metadata", () => {
  assert.match(boardSource, /deriveMatrix2SessionReadiness\(session, conflicts\)/);
  assert.doesNotMatch(boardSource, /function moduleReadinessForSession/);
  assert.match(readinessSource, /deriveSessionModuleReadiness/);
  assert.match(readinessSource, /SESSION_READINESS_METADATA/);
  assert.match(readinessSource, /status === "needs_info" \|\| status === "not_started"\) return "attention"/);
  assert.match(readinessSource, /status === "blocked"\) return "missing"/);

  assert.match(pageSource, /import \{ SESSION_READINESS_METADATA \}/);
  assert.match(pageSource, /SESSION_READINESS_METADATA\[readiness\.status\]\.label/);
  assert.match(pageSource, /sessionStatusBadgeClassName\(normalized\)/);
  assert.doesNotMatch(pageSource, /includes\("confirm"\)[\s\S]*bg-emerald-50 text-emerald-700/);
});

test("Run of Show type pills remain type-based in List view", () => {
  const overviewSource = sourceBetween(pageSource, "function MatrixOverviewTable", "export default function Matrix2Page");

  assert.match(pageSource, /typeColorClasses as matrixSessionTypeColorClasses/);
  assert.match(overviewSource, /matrixSessionTypeColorClasses\(session\.sessionType\)/);
});

test("Session workspace module card colors follow readiness metadata semantics", () => {
  assert.match(workspaceSource, /if \(status === "needs_info"\) return "bg-amber-500"/);
  assert.match(workspaceSource, /if \(status === "blocked"\) return "bg-rose-600"/);
  assert.match(workspaceSource, /if \(status === "needs_info"\) return "border-l-amber-500"/);
  assert.match(workspaceSource, /if \(status === "blocked"\) return "border-l-rose-600"/);
  assert.match(workspaceSource, /if \(status === "needs_info"\) return "border-amber-200"/);
  assert.match(workspaceSource, /if \(status === "ready"\) return "border-emerald-200"/);
  assert.match(workspaceSource, /readinessWarningTextClasses\(item\.status\)/);
});

test("Room Set production availability removes Room Set and Seating conflicts consistently", () => {
  assert.match(conflictUtilsSource, /export function visibleMatrix2Conflicts/);
  assert.match(conflictUtilsSource, /conflict\.type !== ROOM_CAPACITY_EXCEEDED/);
  assert.match(conflictUtilsSource, /conflict\.type !== ROOM_OVERLAP/);
  assert.match(conflictUtilsSource, /export function visibleMatrix2ConflictMap/);
  assert.match(pageSource, /visibleMatrix2Conflicts\(conflictsForDate\.conflicts, \{ roomSetAndSeatingAvailable \}\)/);
  assert.match(pageSource, /visibleMatrix2ConflictMap\(conflictsForDate\.bySession, \{ roomSetAndSeatingAvailable \}\)/);
  assert.match(workspaceSource, /visibleMatrix2Conflicts\(conflicts, \{ roomSetAndSeatingAvailable \}\)/);
});
