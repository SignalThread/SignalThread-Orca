import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildTimelineChildRollups } from "./timeline/rollup";

const listView = readFileSync("app/(shell)/timeline/_components/TimelineListView.tsx", "utf8");
const timelinePage = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
const widgetRenderer = readFileSync(
  "app/(shell)/events/[eventId]/_components/event-dashboard-widget-renderer.tsx",
  "utf8",
);

test("the subtask-only filter and its banner are gone", () => {
  assert.doesNotMatch(listView, /Showing subtasks of/);
  assert.doesNotMatch(listView, /Show all roadmap items/);
  assert.doesNotMatch(listView, /subtaskFocusParent/);
  assert.doesNotMatch(listView, /onViewSubtasks/);
});

test("expansion is inline state that can hold several parents at once", () => {
  assert.match(listView, /const \[expandedParentIds, setExpandedParentIds\] = useState<ReadonlySet<string>>/);
  // Toggling adds to / removes from a set rather than replacing a single focused id.
  assert.match(listView, /if \(next\.has\(parentId\)\) next\.delete\(parentId\);\s*\n\s*else next\.add\(parentId\);/);
});

test("collapsing hides only that parent's children and never removes other roadmap items", () => {
  // Every root item that passes the filters is pushed; children are appended only when the
  // parent is expanded, so sibling parents are unaffected by another parent's state.
  assert.match(listView, /visible\.push\(item\);\s*\n\s*if \(!isParentExpanded\(item\.id\)\) continue;/);
  assert.match(listView, /for \(const child of childrenByParent\.get\(item\.id\) \?\? \[\]\)/);
});

test("subtasks render directly beneath their parent in the original roadmap order", () => {
  assert.match(listView, /Walk the original roadmap order once and emit each child directly beneath its parent/);
  // No re-sorting of the roadmap: the loop iterates taskItems in place.
  assert.doesNotMatch(listView, /visible\.sort\(/);
});

test("a chevron sits before the title with direction-correct icons and accessible names", () => {
  assert.match(listView, /data-timeline-subtask-toggle=\{item\.id\}/);
  assert.match(listView, /\{isExpanded \? <ChevronDown className="h-4 w-4" aria-hidden \/> : <ChevronRight className="h-4 w-4" aria-hidden \/>\}/);
  assert.match(
    listView,
    /aria-label=\{`\$\{isExpanded \? "Collapse" : "Expand"\} subtasks for \$\{item\.title\}`\}/,
  );
  assert.match(listView, /aria-expanded=\{isExpanded\}/);
  assert.match(listView, /aria-controls=\{subtaskGroupId\(item\.id\)\}/);
});

test("the subtask-progress link toggles the same group as the chevron", () => {
  assert.match(
    listView,
    /aria-label=\{`\$\{isExpanded \? "Collapse" : "Expand"\} subtasks for \$\{item\.title\}, \$\{childRollup\.completeCount\} of \$\{childRollup\.childCount\} complete`\}/,
  );
  const progressBlock = listView.slice(listView.indexOf("subtasks complete · "));
  assert.ok(progressBlock.length > 0);
  assert.match(listView, /onClick=\{\(event\) => \{ event\.preventDefault\(\); event\.stopPropagation\(\); onToggleSubtasks\(item\); \}\}/);
});

test("only the dedicated chevron controls parent expansion", () => {
  assert.doesNotMatch(listView, /<tr[\s\S]*?onClick=\{childRollup/);
  assert.match(listView, /onClick=\{\(\) => onBeginEdit\(item, "title"\)\}/);
});

test("reorder arrows stay reordering controls and never drive expansion", () => {
  assert.match(listView, /onReorder\(item, "up"\);/);
  assert.match(listView, /onReorder\(item, "down"\);/);
  const upControl = listView.slice(listView.indexOf('onReorder(item, "up")'), listView.indexOf('onReorder(item, "down")'));
  assert.doesNotMatch(upControl, /onToggleSubtasks/);
});

test("icon controls carry both accessible names and tooltips", () => {
  assert.match(listView, /aria-label=\{`Move \$\{item\.title\} up`\} title="Move up"/);
  assert.match(listView, /aria-label=\{`Move \$\{item\.title\} down`\} title="Move down"/);
  assert.match(listView, /title=\{item\.disposition === "NOT_NEEDED" \? "Restore" : "Mark as Not Needed"\}/);
  assert.match(listView, /title=\{`\$\{isExpanded \? "Collapse" : "Expand"\} subtasks`\}/);
  assert.match(listView, /aria-label=\{`Add subtask to \$\{item\.title\}`\}/);
});

test("searching subtask text reveals the parent and auto-expands it", () => {
  assert.match(listView, /const searchMatchedParentIds = useMemo/);
  assert.match(
    listView,
    /expandedParentIds\.has\(parentId\) \|\| searchMatchedParentIds\.has\(parentId\)/,
  );
  // A parent recovered only because a child matched is still rendered.
  assert.match(listView, /searchMatchedParentIds\.has\(item\.id\) && !matchedIds\.has\(item\.id\)/);
});

test("a subtask whose parent is filtered out still appears rather than disappearing", () => {
  assert.match(
    listView,
    /if \(candidateIds\.has\(item\.id\) && !candidateIds\.has\(item\.parentId\)\) visible\.push\(item\);/,
  );
});

test("subtask rows are visually distinguished and labelled", () => {
  assert.match(listView, /data-timeline-subtask-row=\{item\.parentId \? "true" : undefined\}/);
  // The row tint moved onto the cells, because every <td> set bg-white and hid a tint on the
  // <tr>. Indentation moved to the title group so it cannot drift with the row's controls.
  assert.match(listView, /const cellTone = item\.parentId \? "bg-slate-50" : "bg-white";/);
  assert.match(listView, /item\.parentId \? "pl-\[4\.5rem\]" : ""/);
  assert.match(listView, /Subtask\s*\n\s*<\/span>/);
});

test("parent progress recalculates from its subtasks", () => {
  const items = [
    { id: "p", parentId: null, status: "IN_PROGRESS", progress: 0, disposition: "ACTIVE" },
    { id: "c1", parentId: "p", status: "COMPLETE", progress: 100, disposition: "ACTIVE" },
    { id: "c2", parentId: "p", status: "NOT_STARTED", progress: 0, disposition: "ACTIVE" },
    { id: "c3", parentId: "p", status: "NOT_STARTED", progress: 0, disposition: "ACTIVE" },
  ] as const;

  const before = buildTimelineChildRollups(items as never).get("p");
  assert.equal(before?.childCount, 3);
  assert.equal(before?.completeCount, 1);
  assert.equal(before?.percentComplete, 33);

  // Completing one more subtask moves the parent immediately.
  const after = buildTimelineChildRollups(
    items.map((item) => (item.id === "c2" ? { ...item, status: "COMPLETE", progress: 100 } : item)) as never,
  ).get("p");
  assert.equal(after?.completeCount, 2);
  assert.equal(after?.percentComplete, 67);
});

test("subtasks marked Not Needed drop out of the parent's progress", () => {
  const rollup = buildTimelineChildRollups([
    { id: "p", parentId: null, status: "IN_PROGRESS", progress: 0, disposition: "ACTIVE" },
    { id: "c1", parentId: "p", status: "COMPLETE", progress: 100, disposition: "ACTIVE" },
    { id: "c2", parentId: "p", status: "NOT_STARTED", progress: 0, disposition: "NOT_NEEDED" },
  ] as never).get("p");

  assert.equal(rollup?.childCount, 1);
  assert.equal(rollup?.percentComplete, 100);
});

test("manual reordering remains a real persisted mutation with boundary handling", () => {
  assert.match(timelinePage, /\/timeline-items\/reorder/);
  assert.match(timelinePage, /expectedSortOrder: item\.sortOrder/);
  assert.match(timelinePage, /await loadItems\(selectedEventId\)/);
  assert.match(listView, /disabled=\{!canMoveUp\}/);
  assert.match(listView, /disabled=\{!canMoveDown\}/);
});

test("the roadmap headline states whether subtasks are included", () => {
  assert.match(widgetRenderer, /including subtasks/);
});

test("reordering writes only the rows whose position changes", () => {
  const service = readFileSync("src/server/services/timeline.ts", "utf8");
  // Rewriting every sibling cost one round trip per item and overran the 5s transaction.
  assert.doesNotMatch(
    service,
    /for \(let index = 0; index < reordered\.length; index \+= 1\) \{\s*\n\s*await tx\.timelineItem\.update/,
  );
  assert.match(service, /const storedSortOrder = new Map\(siblings\.map/);
  assert.match(service, /storedSortOrder\.get\(item\.id\) === index\s*\n\s*\? \[\]/);
  // The claim already moved the current row, so its effective position must be accounted for.
  assert.match(service, /storedSortOrder\.set\(current\.id, currentIndex\)/);
  // Contiguous normalization is still the contract.
  assert.match(service, /data: \{ sortOrder: index \}/);
});

test("a failed reorder surfaces an error instead of an unhandled rejection", () => {
  const page = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
  const handler = page.slice(
    page.indexOf("const handleReorderItem"),
    page.indexOf("const handleDeleteTask"),
  );
  assert.match(handler, /try \{/);
  assert.match(handler, /catch \(error\) \{/);
  assert.match(handler, /setErrorMessage\(/);
  // The row never shows a move that did not commit: failure restores the captured order
  // rather than refetching the whole list.
  assert.match(handler, /const previousItems = items;/);
  assert.equal(handler.match(/setItems\(previousItems\)/g)?.length, 2);
});

test("the reorder route logs the underlying cause", () => {
  const route = readFileSync("app/api/events/[eventId]/timeline-items/reorder/route.ts", "utf8");
  assert.match(route, /console\.error\("POST \/api\/events\/:eventId\/timeline-items\/reorder failed", error\)/);
});

/* ── Live-QA defect fixes: chevron interaction and non-navigating reorder ──────────── */

test("the chevron is a real button that cannot submit or navigate", () => {
  const chevron = listView.slice(
    listView.indexOf("data-timeline-subtask-toggle={item.id}") - 200,
    listView.indexOf("data-timeline-subtask-toggle={item.id}") + 900,
  );
  assert.match(chevron, /type="button"/);
  // preventDefault plus stopPropagation, so it never submits and never double-fires with the
  // row handler.
  assert.match(chevron, /event\.preventDefault\(\); event\.stopPropagation\(\); onToggleSubtasks\(item\)/);
});

test("the chevron uses the collapsed and expanded glyphs", () => {
  assert.match(listView, /ChevronDown, ChevronRight/);
  assert.match(listView, /\{isExpanded \? <ChevronDown className="h-4 w-4" aria-hidden \/> : <ChevronRight className="h-4 w-4" aria-hidden \/>\}/);
});

test("the chevron hit area is large enough to click reliably", () => {
  // 17x17 was the live-QA defect: the control rendered but was easy to miss.
  assert.match(listView, /flex h-8 w-8 shrink-0 items-center justify-center rounded/);
  // Childless parents keep the same spacer width so titles stay aligned.
  assert.match(listView, /<span className="-ml-1 h-8 w-8 shrink-0" aria-hidden \/>/);
});

test("the parent title remains an edit control", () => {
  assert.match(listView, /onClick=\{\(\) => onBeginEdit\(item, "title"\)\}/);
  assert.doesNotMatch(listView, /onDoubleClick=\{childRollup/);
});

test("reorder controls are buttons that preventDefault and never navigate", () => {
  for (const direction of ["up", "down"]) {
    assert.match(
      listView,
      new RegExp(`onClick=\\{\\(event\\) => \\{ event\\.preventDefault\\(\\); event\\.stopPropagation\\(\\); onReorder\\(item, "${direction}"\\); \\}\\}`),
    );
  }
  // No anchors or router pushes anywhere in the reorder path.
  const page = timelinePage.slice(
    timelinePage.indexOf("const handleReorderItem"),
    timelinePage.indexOf("const handleDeleteTask"),
  );
  assert.doesNotMatch(page, /router\.(push|replace|refresh)|location\.(href|assign|reload)|window\.open/);
});

test("reorder updates rows in place instead of refetching every item", () => {
  const page = timelinePage.slice(
    timelinePage.indexOf("const handleReorderItem"),
    timelinePage.indexOf("const handleDeleteTask"),
  );
  // The full refetch was what read as a page reload and discarded expanded parents.
  assert.doesNotMatch(page, /loadItems\(/);
  assert.match(page, /setItems\(optimistic\)/);
  // Only the two affected rows change position.
  assert.match(page, /\[optimistic\[fromIndex\], optimistic\[toIndex\]\] = \[optimistic\[toIndex\]!, optimistic\[fromIndex\]!\]/);
});

test("reorder swaps only siblings, so hierarchy cannot change", () => {
  const page = timelinePage.slice(
    timelinePage.indexOf("const handleReorderItem"),
    timelinePage.indexOf("const handleDeleteTask"),
  );
  assert.match(page, /entry\.parentId === item\.parentId/);
  // parentId is never written by the reorder path.
  assert.doesNotMatch(page, /parentId:\s/);
});

test("reorder confirms success and restores the previous order on failure", () => {
  const page = timelinePage.slice(
    timelinePage.indexOf("const handleReorderItem"),
    timelinePage.indexOf("const handleDeleteTask"),
  );
  assert.match(page, /const previousItems = items;/);
  assert.match(page, /setSuccessMessage\(`Moved “\$\{item\.title\}” \$\{direction\}\.`\)/);
  // Both the declined-move and thrown-error paths roll back.
  assert.equal(page.match(/setItems\(previousItems\)/g)?.length, 2);
  assert.match(page, /setErrorMessage\(error instanceof Error \? error\.message/);
});

test("boundary rows cannot be reordered past the ends", () => {
  const page = timelinePage.slice(
    timelinePage.indexOf("const handleReorderItem"),
    timelinePage.indexOf("const handleDeleteTask"),
  );
  assert.match(page, /if \(currentIndex < 0 \|\| targetIndex < 0 \|\| targetIndex >= siblings\.length\) return;/);
  assert.match(listView, /disabled=\{!canMoveUp\}/);
  assert.match(listView, /disabled=\{!canMoveDown\}/);
});

test("keyboard activation works because every control is a native button", () => {
  // Native buttons handle Enter and Space without extra key handlers; the regression to guard
  // against is a div or span standing in for one.
  const toggleBlock = listView.slice(
    listView.indexOf("data-timeline-subtask-toggle={item.id}") - 200,
    listView.indexOf("data-timeline-subtask-toggle={item.id}") + 200,
  );
  assert.match(toggleBlock, /<button/);
  assert.doesNotMatch(toggleBlock, /<div[^>]*onClick|<span[^>]*onClick/);
  assert.match(listView, /focus-visible:ring-2 focus-visible:ring-blue-500/);
});

/* ── Visible hierarchy for inline subtask rows ─────────────────────────────────────── */

test("child rows get their own cell surface instead of being painted over", () => {
  // Every <td> hardcoded bg-white, so a tint on the <tr> was invisible and child rows
  // rendered identically to parents.
  assert.match(listView, /const cellTone = item\.parentId \? "bg-slate-50" : "bg-white";/);
  assert.match(listView, /\$\{cellTone\} px-3 py-2 align-middle/);
  // No cell may reintroduce an unconditional white background on the row surface.
  assert.doesNotMatch(listView, /border-slate-200 bg-white px-3 py-2 align-middle shadow-sm/);
});

test("the title indent is stable and cannot drift with the number of row controls", () => {
  // justify-between distributed free space between the chevron, title, and every trailing
  // button, so the title's x position moved with the controls rendered and children ended up
  // rendering to the LEFT of their parent.
  assert.match(listView, /<span className="flex min-w-0 items-center gap-1">/);
  assert.match(listView, /item\.parentId \? "pl-\[4\.5rem\]" : ""/);
});

test("child rows carry a branch connector, a left accent, and an inline Subtask marker", () => {
  assert.match(listView, /absolute inset-y-0 left-\[3\.5rem\] w-6/);
  assert.match(listView, /absolute left-0 top-0 h-1\/2 w-px bg-slate-300/);
  assert.match(listView, /absolute left-0 top-1\/2 h-px w-4 bg-slate-300/);
  assert.match(listView, /shadow-\[inset_3px_0_0_0_rgb\(148,163,184\)\]/);
  assert.match(listView, /<CornerDownRight className="h-2\.5 w-2\.5" aria-hidden \/>\s*\n\s*Subtask/);
  // The marker sits beside the title, not stranded on a line beneath it.
  assert.doesNotMatch(listView, /<p className="mt-0\.5 pl-6 text-\[10px\] font-medium text-slate-400">Subtask<\/p>/);
});

test("expansion remains local state with no navigation of any kind", () => {
  const page = timelinePage.slice(0, timelinePage.length);
  // The toggle lives entirely in the list component; the page never routes on expansion.
  assert.doesNotMatch(listView, /router\.(push|replace|refresh)/);
  assert.doesNotMatch(listView, /<a[^>]*data-timeline-subtask-toggle/);
  assert.match(listView, /type="button"\s*\n\s*data-timeline-subtask-toggle=\{item\.id\}/);
  // Reorder is the only roadmap mutation that talks to the server from this view.
  assert.match(page, /\/timeline-items\/reorder/);
});

test("the Mark Not Needed dialog resets on dismissal, preserves failed saves, and restores focus", () => {
  const saveDisposition = listView.slice(
    listView.indexOf("async function saveDisposition"),
    listView.indexOf("function closeDispositionDialog"),
  );
  assert.match(saveDisposition, /await onSaveRow\(dispositionItem\.id/);
  assert.match(saveDisposition, /closeDispositionDialog\(\);/);
  assert.match(saveDisposition, /catch \(error\) \{\s*setDispositionError\(/);
  assert.match(saveDisposition, /await refreshDispositionItem\(dispositionItem\.id\);/);
  assert.match(listView, /async function refreshDispositionItem\(itemId: string\)/);
  assert.match(listView, /function closeDispositionDialog\(\) \{\s*setDispositionItem\(null\);\s*setDispositionReason\(""\);/);
  assert.match(listView, /window\.requestAnimationFrame\(\(\) => dispositionTriggerRef\.current\?\.focus\(\)\);/);
  assert.match(listView, /data-testid="timeline-disposition-backdrop"/);
  assert.match(listView, /data-testid="timeline-disposition-dialog"/);
  assert.match(listView, /role="alert"/);
});
