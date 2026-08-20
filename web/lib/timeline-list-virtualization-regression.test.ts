import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Row-virtualization coverage for the Timeline List (Roadmap/Timeline performance
// Prompt 2). The list is a client component that is not rendered in the node
// --test runner (no jsdom/RTL harness in this repo), so we lock the structural
// contract that makes windowing correct and behavior-preserving. Manual QA:
// load a >100-item timeline, scroll, and confirm only the visible window mounts
// while the scrollbar height and selection/bulk actions stay correct.

const listSource = readFileSync("app/(shell)/timeline/_components/TimelineListView.tsx", "utf8");
const hookSource = readFileSync("app/(shell)/timeline/_components/useVirtualRows.ts", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

test("virtualization uses a local dependency-free helper, not a new package", () => {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  for (const name of Object.keys(deps)) {
    assert.ok(
      !/virtual|react-window|tanstack\/react-virtual/i.test(name),
      `unexpected virtualization dependency added: ${name}`,
    );
  }
  assert.match(hookSource, /export function useVirtualRows\(/);
});

test("List view windows its rows above a threshold and stays static below it", () => {
  assert.match(listSource, /const LIST_VIRTUALIZATION_THRESHOLD = 100;/);
  assert.match(listSource, /const shouldVirtualize = filteredTaskItems\.length > LIST_VIRTUALIZATION_THRESHOLD;/);
  // Below threshold the full filtered list is rendered unchanged.
  assert.match(listSource, /shouldVirtualize\s*\?\s*filteredTaskItems\.slice\(virtual\.startIndex, virtual\.endIndex\)\s*:\s*filteredTaskItems/);
});

test("only the visible window mounts, with spacer rows preserving scroll height", () => {
  assert.match(listSource, /visibleTaskItems\.map\(\(item\) => \(/);
  assert.match(listSource, /virtual\.topPadding > 0 \?/);
  assert.match(listSource, /virtual\.bottomPadding > 0 \?/);
  assert.match(listSource, /style=\{\{ height: virtual\.topPadding, padding: 0, border: 0 \}\}/);
  assert.match(listSource, /style=\{\{ height: virtual\.bottomPadding, padding: 0, border: 0 \}\}/);
  // Spacer rows span the pinned columns plus the current dynamic column set.
  assert.match(listSource, /colSpan=\{2 \+ orderedColumns\.length\}/);
});

test("selection and bulk actions are NOT scoped to only the visible window", () => {
  // Select-all and bulk target the full filtered set, not the mounted rows.
  assert.match(listSource, /visibleFilteredIds = useMemo\(\s*\(\) => filteredTaskItems\.map\(\(item\) => item\.id\)/);
  assert.match(listSource, /new Set\(\[\.\.\.Array\.from\(current\), \.\.\.visibleFilteredIds\]\)/);
  assert.match(listSource, /onBulkUpdate\(selectedVisibleIds, patch\)/);
  assert.match(listSource, /onBulkDelete\(selectedVisibleIds\)/);
  // The windowed slice must never be the source for selection/bulk ids.
  assert.doesNotMatch(listSource, /visibleTaskItems\.map\(\(item\) => item\.id\)/);
});

test("the windowing helper listens for scroll in the capture phase (nested scroll containers)", () => {
  // Capture-phase scroll on window also observes an ancestor scroll container,
  // since scroll events do not bubble.
  assert.match(hookSource, /window\.addEventListener\("scroll", schedule, true\)/);
  assert.match(hookSource, /window\.addEventListener\("resize", schedule\)/);
  assert.match(hookSource, /requestAnimationFrame\(compute\)/);
  // Overscan renders a buffer beyond the strict viewport for smooth scrolling.
  assert.match(hookSource, /overscan = 8/);
});

test("row memoization from Prompt 1 is preserved under virtualization", () => {
  assert.match(listSource, /const TimelineListRow = memo\(function TimelineListRow\(/);
  assert.match(listSource, /onCommitCell=\{commitCell\}/);
});
