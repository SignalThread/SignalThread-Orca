import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Payload/read-only audit coverage for the Timeline (Roadmap/Timeline
// performance Prompt 5). Prompt 5 is the optional polish pass; the only change
// safe to make without a UI redesign or schema work was trimming unused fields
// from the shared list/create/update select. Prompt 13 intentionally restored
// updatedAt as the optimistic-concurrency token while createdAt remains unused.

const serviceSource = readFileSync("src/server/services/timeline.ts", "utf8");
const typesSource = readFileSync("app/(shell)/timeline/_components/types.ts", "utf8");
const listSource = readFileSync("app/(shell)/timeline/_components/TimelineListView.tsx", "utf8");

test("the shared timeline select ships only the updatedAt concurrency token", () => {
  const selectStart = serviceSource.indexOf("const timelineItemSelect = {");
  const selectEnd = serviceSource.indexOf("satisfies Prisma.TimelineItemSelect;");
  assert.ok(selectStart > -1 && selectEnd > selectStart, "timelineItemSelect block not found");
  const selectBlock = serviceSource.slice(selectStart, selectEnd);
  assert.doesNotMatch(selectBlock, /createdAt: true/);
  assert.match(selectBlock, /updatedAt: true/);
  // The fields the client actually consumes remain selected.
  for (const field of ["title", "workstream", "planningStage", "status", "priority", "isCriticalPath", "startDate", "endDate", "progress", "sortOrder", "parentId"]) {
    assert.match(selectBlock, new RegExp(`${field}: true`), `expected ${field} to stay selected`);
  }
  assert.match(selectBlock, /ownerUser: \{/);
});

test("the client record carries updatedAt for optimistic writes but not createdAt", () => {
  const recordStart = typesSource.indexOf("export type TimelineItemRecord = {");
  const recordEnd = typesSource.indexOf("\n};", recordStart);
  const recordBlock = typesSource.slice(recordStart, recordEnd);
  assert.doesNotMatch(recordBlock, /createdAt/);
  assert.match(recordBlock, /updatedAt: string/);
});

test("read-only viewers already avoid the edit-heavy surfaces (no separate heavy path needed)", () => {
  // Inline editors only mount behind canEdit (beginCellEdit returns early), the
  // bulk bar is canEdit-gated, and the row delete control is not rendered for
  // read-only viewers — so read-only already skips the edit-only work.
  assert.match(listSource, /if \(!canEdit\) return;/);
  assert.match(listSource, /canEdit && selectedCount > 0 \?/);
  assert.match(listSource, /\{canEdit \? \(\s*<button\s+type="button"\s+onClick=\{\(e\) => \{ e\.stopPropagation\(\); onDeleteTask\(item\.id\); \}\}/);
});
