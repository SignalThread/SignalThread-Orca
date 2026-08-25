import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { deriveSessionReadiness } from "./session-readiness";

const statusBar = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-readiness-status-bar.tsx",
  "utf8",
);
const workspace = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx",
  "utf8",
);
const features = readFileSync("src/config/features.ts", "utf8");

/* ── Readiness counts are interactive and enumerable ───────────────────────────────── */

test("the static readiness summary text is gone from the session workspace", () => {
  // The old markup was three inert spans in a div.
  assert.doesNotMatch(workspace, /\{readinessSummary\.ready\} ready/);
  assert.doesNotMatch(workspace, /\{readinessSummary\.needsWork\} need work/);
  assert.doesNotMatch(workspace, /\{readinessSummary\.blocked\} blocked/);
  assert.match(workspace, /<SessionReadinessStatusBar/);
});

test("each status is a real button with an accessible name and pointer affordance", () => {
  assert.match(statusBar, /<button\s*\n\s*key=\{bucket\}\s*\n\s*type="button"/);
  assert.match(statusBar, /data-readiness-status=\{bucket\}/);
  assert.match(statusBar, /aria-label=\{\s*\n?\s*disabled/);
  assert.match(statusBar, /cursor-pointer/);
  assert.match(statusBar, /focus-visible:ring-2/);
  assert.match(statusBar, /hover:bg-emerald-100/);
});

test("a status with zero items is disabled rather than a dead control", () => {
  assert.match(statusBar, /const disabled = count === 0;/);
  assert.match(statusBar, /disabled=\{disabled\}/);
  assert.match(statusBar, /cursor-not-allowed/);
  assert.match(statusBar, /`\$\{BUCKET_LABEL\[bucket\]\}: no items`/);
  // A disabled chip exposes no expand semantics at all.
  assert.match(statusBar, /aria-expanded=\{disabled \? undefined : isOpen\}/);
  assert.match(statusBar, /aria-controls=\{disabled \? undefined : "session-readiness-detail-panel"\}/);
});

test("clicking a status opens an anchored dialog titled with the status and count", () => {
  assert.match(statusBar, /role="dialog"/);
  assert.match(statusBar, /id="session-readiness-detail-panel"/);
  assert.match(
    statusBar,
    /\{BUCKET_LABEL\[activeBucket\]\} — \{openItems\.length\} item\{openItems\.length === 1 \? "" : "s"\}/,
  );
});

test("the panel closes on re-click, outside click, and Escape", () => {
  assert.match(statusBar, /setOpenBucket\(\(current\) => \(current === bucket \? null : bucket\)\)/);
  assert.match(statusBar, /if \(rootRef\.current\?\.contains\(event\.target as Node\)\) return;\s*\n\s*setOpenBucket\(null\)/);
  assert.match(statusBar, /if \(event\.key === "Escape"\) setOpenBucket\(null\)/);
});

test("every listed item carries area, subject, status, cause, blocker, owner, and an action", () => {
  for (const field of ["area", "subject", "statusLabel", "reason", "blocker", "owner", "actionLabel", "onAction"]) {
    assert.match(statusBar, new RegExp(`item\\.${field}`), field);
  }
  assert.match(statusBar, /Blocking:/);
  assert.match(statusBar, /Owner: \{item\.owner \?\? "Unassigned"\}/);
});

test("panel items are derived from canonical module readiness, not a display-only list", () => {
  assert.match(workspace, /const readinessDetailItems = useMemo<ReadinessDetailItem\[\]>/);
  // Same source array the counts themselves are computed from.
  assert.match(
    workspace,
    /const statusItems = \[moduleReadiness\.details, \.\.\.focusItems\.filter\(\(item\) => item\.id !== "overview"\), \.\.\.linkItems\]/,
  );
  assert.match(workspace, /const detail = moduleReadiness\[moduleId as keyof typeof moduleReadiness\]/);
  assert.match(workspace, /const reasons = detail\?\.reasons \?\? \[\]/);
  // Items excluded from the count are excluded from the list by the same two rules.
  assert.match(workspace, /if \(entry\.status === "not_needed"\) return \[\];/);
  assert.match(workspace, /entry\.countInReadiness === false\) return \[\];/);
});

test("loading, error, retry, and empty states exist", () => {
  assert.match(statusBar, /Checking session readiness…/);
  assert.match(statusBar, /Readiness could not be calculated\./);
  assert.match(statusBar, /onClick=\{onRetry\}/);
  assert.match(statusBar, /No readiness checks apply to this session yet\./);
  assert.match(workspace, /isLoading=\{isLoading\}/);
  assert.match(workspace, /error=\{snapshotLoadError\}/);
});

test("item actions route inside the current event and session context", () => {
  // Navigation is by workspace tab on the session already in scope, so event/session context
  // cannot be lost by a drilldown.
  assert.match(workspace, /if \(target === "details"\) return focusWorkspaceTab\("overview"\);/);
  assert.match(workspace, /focusWorkspaceTab\(target as WorkspaceTabId\)/);
});
