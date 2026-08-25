import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
const ganttSource = readFileSync("app/(shell)/timeline/_components/TimelineGanttView.tsx", "utf8");

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.ok(startIndex >= 0, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(endIndex >= 0, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const createModalSource = sourceBetween(pageSource, "{isCreateOpen ? (", "{isImportOpen ? (");
const itemCreateBranchSource = sourceBetween(
  createModalSource,
  '{createMode === "item" && selectedEventName ?',
  '<div className="mt-5 flex justify-end gap-2">',
);
const itemQuickCreateSource = sourceBetween(
  createModalSource,
  '<label className="mb-1 block text-sm font-medium text-slate-700">Item name</label>',
  '<div className="rounded-xl border border-slate-200 bg-slate-50/70">',
);
const createEntitySource = sourceBetween(
  pageSource,
  "async function handleCreateRoadmapEntity()",
  "const renderCurrentView = () =>",
);

test("Add item modal renders a simplified quick-create field order by default", () => {
  const itemNameIndex = itemQuickCreateSource.indexOf(">Item name<");
  const workstreamIndex = itemQuickCreateSource.indexOf(">Workstream<");
  const ownerIndex = itemQuickCreateSource.indexOf(">Owner<");
  const startDateIndex = itemQuickCreateSource.indexOf(">Start date<");
  const dueDateIndex = itemQuickCreateSource.indexOf(">Due/end date<");
  const moreDetailsIndex = itemCreateBranchSource.indexOf(">More details<");

  assert.ok(itemNameIndex > -1, "item name should be visible");
  assert.ok(workstreamIndex > itemNameIndex, "workstream should follow item name");
  assert.ok(ownerIndex > workstreamIndex, "owner should follow workstream");
  assert.ok(startDateIndex > ownerIndex, "start date should follow owner");
  assert.ok(dueDateIndex > startDateIndex, "due date should follow start date");
  assert.ok(moreDetailsIndex > dueDateIndex, "secondary fields should be after the quick-create fields");
  assert.ok(itemCreateBranchSource.includes('ariaLabel="Item start date"'));
  assert.ok(itemCreateBranchSource.includes('ariaLabel="Item end date"'));
});

test("Event is shown as compact item context instead of a large editable field", () => {
  assert.ok(createModalSource.includes('createMode === "item" && selectedEventName ?'));
  assert.ok(createModalSource.includes('<p className="mt-1 text-xs font-medium text-slate-500">{selectedEventName}</p>'));
  assert.ok(createModalSource.includes('createMode === "workstream" ?'));
  assert.ok(
    createModalSource.indexOf(">Event<") > createModalSource.indexOf('createMode === "workstream" ?'),
    "large Event field should live in the workstream branch",
  );
});

test("More details is collapsed by default and reveals secondary fields", () => {
  assert.ok(pageSource.includes("const [isCreateMoreDetailsOpen, setIsCreateMoreDetailsOpen] = useState(false);"));
  assert.ok(pageSource.includes("setIsCreateMoreDetailsOpen(false);"));
  assert.ok(createModalSource.includes("aria-expanded={isCreateMoreDetailsOpen}"));
  assert.ok(createModalSource.includes("{isCreateMoreDetailsOpen ? ("));

  const moreDetailsSource = sourceBetween(createModalSource, "{isCreateMoreDetailsOpen ? (", ") : null}");
  assert.ok(moreDetailsSource.includes(">Planning Stage<"));
  assert.ok(moreDetailsSource.includes(">Status<"));
  assert.ok(moreDetailsSource.includes(">Priority<"));
  assert.ok(moreDetailsSource.includes("Critical path"));
});

test("Row-level add preselects workstream and focuses the item name", () => {
  assert.ok(ganttSource.includes("onOpenItemCreate(row.group.key as TimelineWorkstream | \"UNASSIGNED\")"));
  assert.ok(pageSource.includes("resetCreateForm(\"item\", workstream);"));
  assert.ok(pageSource.includes("const createTitleInputRef = useRef<HTMLInputElement | null>(null);"));
  assert.ok(pageSource.includes("createTitleInputRef.current?.focus()"));
  assert.ok(createModalSource.includes("ref={createTitleInputRef}"));
});

test("Header Add item requires choosing a workstream", () => {
  assert.ok(pageSource.includes("onClick={() => openCreateItemModal()}"));
  assert.ok(pageSource.includes("setCreateWorkstream("));
  assert.ok(pageSource.includes('? getWorkstreamLabel(presetWorkstream)'));
  assert.ok(pageSource.includes(': ""'));
  assert.ok(createModalSource.includes("Select or type workstream"));
  assert.ok(createModalSource.includes("Create workstream:"));
  assert.ok(createEntitySource.includes("Choose a workstream."));
});

test("Hidden default detail values are still submitted to the create API", () => {
  assert.ok(pageSource.includes('setCreatePlanningStage("PLANNING")'));
  assert.ok(pageSource.includes('setCreateStatus("NOT_STARTED")'));
  assert.ok(pageSource.includes('setCreatePriority("MEDIUM")'));
  assert.ok(pageSource.includes("setCreateIsCriticalPath(false)"));
  assert.ok(createEntitySource.includes("planningStage: createPlanningStage"));
  assert.ok(createEntitySource.includes("status: createStatus"));
  assert.ok(createEntitySource.includes("priority: createPriority"));
  assert.ok(createEntitySource.includes('isCriticalPath: createMode === "item" ? createIsCriticalPath : false'));
});

test("Enum labels render human-readable text", () => {
  assert.ok(pageSource.includes("function formatTimelineEnumLabel"));
  assert.ok(createModalSource.includes("formatTimelineStatusLabel(status)"));
  assert.ok(createModalSource.includes("formatTimelinePriorityLabel(priority)"));
  assert.ok(pageSource.includes('formatTimelineEnumLabel(status || "NOT_STARTED")'));
  assert.ok(pageSource.includes('formatTimelineEnumLabel(priority || "MEDIUM")'));
});

test("Existing item creation persists all supported fields and allows undated items", () => {
  assert.ok(createEntitySource.includes("ownerUserId: createOwnerUserId || null"));
  assert.ok(createEntitySource.includes("startDate: createStartDate || null"));
  assert.ok(createEntitySource.includes('endDate: createMode === "workstream" ? effectiveEndDate : createEndDate || null'));
  assert.ok(createEntitySource.includes("parentId: createParentId"));
  assert.equal(createEntitySource.includes("Add both start and end dates, or leave both blank."), false);
  assert.ok(createEntitySource.includes("End date must be on or after start date."));
});
