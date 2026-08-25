import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const builderSource = readFileSync("app/(shell)/events/_components/new-event-builder.tsx", "utf8");
const importBuilderSource = readFileSync("lib/event-import-builder.ts", "utf8");
const previewSource = readFileSync("app/(shell)/events/_components/event-import-preview.tsx", "utf8");
const eventsPageSource = readFileSync("app/(shell)/events/page.tsx", "utf8");
const dashboardPageSource = readFileSync("app/(shell)/dashboard/page.tsx", "utf8");
const timezonesSource = readFileSync("lib/timezones.ts", "utf8");

test("the New Event Builder route exists", () => {
  assert.ok(existsSync("app/(shell)/events/new/page.tsx"));
});

test("Events redirects to the searchable Command Center and its create action launches the builder", () => {
  assert.match(eventsPageSource, /redirect\("\/dashboard"\)/);
  assert.match(dashboardPageSource, /href="\/events\/new"/);
  assert.match(dashboardPageSource, /<EventLauncher \/>/);
});

test("builder walks basics -> source -> mapping -> preview", () => {
  assert.match(builderSource, /"basics" \| "source" \| "mapping" \| "preview"/);
  assert.match(builderSource, /Event details/);
  assert.match(builderSource, /Edit details/);
  assert.doesNotMatch(builderSource, /Event basics/);
  assert.doesNotMatch(builderSource, /Edit basics/);
  assert.match(builderSource, /Choose a starting point/);
  assert.match(builderSource, /Map spreadsheets/);
  assert.match(builderSource, /Review & create/);
  assert.doesNotMatch(builderSource, /type BuilderStep = "basics" \| "source" \| "mapping" \| "preview" \| "success"/);
});

test("event setup header uses plain create workspace copy", () => {
  assert.match(builderSource, /Create event workspace/);
  assert.match(builderSource, /Set up an event from planning files, a pasted agenda, or a starter template\./);
  assert.match(builderSource, /aria-label="Event setup steps"/);
  assert.doesNotMatch(builderSource, /New Event Builder/);
  assert.doesNotMatch(builderSource, /Builder steps/);
});

test("event creation hides timezone while still seeding a supported create default", () => {
  assert.match(builderSource, /timezone: getEventCreationDefaultTimezone\(\)/);
  assert.match(builderSource, /isSupportedTimezone\(basics\.timezone\)/);
  assert.match(timezonesSource, /export const FALLBACK_EVENT_CREATION_TIMEZONE = "America\/New_York";/);
  assert.match(timezonesSource, /export function getEventCreationDefaultTimezone\(\): string/);
  assert.match(timezonesSource, /return getDefaultTimezone\(\) \|\| FALLBACK_EVENT_CREATION_TIMEZONE;/);
  assert.doesNotMatch(builderSource, /<span className="mb-1 block text-\[13px\] font-medium text-slate-700">Timezone<\/span>/);
  assert.doesNotMatch(builderSource, /<select\s+value=\{basics\.timezone\}/);
  assert.doesNotMatch(builderSource, /<option value="">Select timezone<\/option>/);
  assert.doesNotMatch(builderSource, /timezoneOptions\.map/);
  assert.doesNotMatch(builderSource, /updateBasics\("timezone", event\.target\.value\)/);
  assert.doesNotMatch(builderSource, /Required for imported sessions, timeline items, and due dates\./);
});

test("event basics continues to validate hidden timezone before continuing", () => {
  assert.match(builderSource, /if \(!basics\.timezone \|\| !isSupportedTimezone\(basics\.timezone\)\) return "Select a valid timezone\."/);
  assert.match(builderSource, /function goToSource\(\) \{\s*const error = validateBasics\(basics\);/);
  assert.match(builderSource, /onClick=\{goToSource\}/);
  assert.doesNotMatch(builderSource, /isSupportedTimezone\(timezoneQuery/);
});

test("event basics omits nonpersisted timezone and estimated-attendee inputs", () => {
  assert.match(builderSource, /<span className="mb-1 block text-\[13px\] font-medium text-slate-700">Venue \/ city<\/span>/);
  assert.match(builderSource, /<label className="sm:col-span-2">\s*<span className="mb-1 block text-\[13px\] font-medium text-slate-700">Venue \/ city<\/span>/);
  assert.doesNotMatch(builderSource, /Estimated attendees/);
  assert.doesNotMatch(builderSource, /updateBasics\("estimatedAttendees"/);
});

test("event date fields use planner-facing start and end labels", () => {
  assert.match(builderSource, />Event start<\/span>/);
  assert.match(builderSource, /ariaLabel="Event start"/);
  assert.match(builderSource, />Event end<\/span>/);
  assert.match(builderSource, /ariaLabel="Event end"/);
  assert.doesNotMatch(builderSource, />Start date<\/span>/);
  assert.doesNotMatch(builderSource, />End date<\/span>/);
});

test("builder offers all four starting methods with workbook recommended", () => {
  assert.match(builderSource, /method="workbook"/);
  assert.match(builderSource, /method="pasteAgenda"/);
  assert.match(builderSource, /method="template"/);
  assert.match(builderSource, /method="blank"/);
  assert.match(builderSource, /Upload Spreadsheet/);
  assert.match(builderSource, /Paste Agenda/);
  assert.match(builderSource, /Use Template/);
  assert.match(builderSource, /Start Blank/);
  assert.match(builderSource, /badge="Recommended"/);
});

test("starting point cards remain visible while selected flows expand inline", () => {
  assert.match(builderSource, /const \[hasSelectedStartingPoint, setHasSelectedStartingPoint\] = useState\(hasRequestedMethod\)/);
  assert.match(builderSource, /onSelect=\{selectStartingPoint\}/);
  assert.doesNotMatch(builderSource, /\{!hasSelectedStartingPoint \? \(/);
  assert.doesNotMatch(builderSource, /Starting point:/);
  assert.doesNotMatch(builderSource, /setHasSelectedStartingPoint\(false\)/);
  assert.doesNotMatch(builderSource, />\s*Change\s*<\/button>/);

  const chooserIndex = builderSource.indexOf('role="radiogroup" aria-label="Starting method"');
  const inlinePanelIndex = builderSource.indexOf('data-testid="selected-starting-point-panel"');
  const uploadPanelIndex = builderSource.indexOf("Upload your planning files");
  assert.ok(chooserIndex >= 0, "starting point cards should render in the source step");
  assert.ok(inlinePanelIndex > chooserIndex, "selected setup panel should render below the card grid");
  assert.ok(uploadPanelIndex > inlinePanelIndex, "upload setup should be inside the inline panel");
  assert.match(builderSource, /variant="inline"/);
  assert.match(builderSource, /method === "workbook"/);
  assert.match(builderSource, /method === "pasteAgenda"/);
  assert.match(builderSource, /method === "template"/);
  assert.match(builderSource, /method === "blank"/);
});

test("workbook source explains sheet inspection and mapping; paste shows a textarea; template lists event types", () => {
  assert.match(builderSource, /Upload your planning files/);
  assert.match(builderSource, /Import Run of Show, Budget, and Timeline from one or more spreadsheets\./);
  assert.match(builderSource, /We inspect sheet names plus columns inside each file, suggest import targets, and let you confirm before anything is created\./);
  assert.doesNotMatch(builderSource, /one workbook/);
  assert.doesNotMatch(builderSource, /planning workbook/);
  assert.match(builderSource, /Run of Show/);
  assert.match(builderSource, /Budget/);
  assert.match(builderSource, /Timeline/);
  assert.match(builderSource, /aria-label="Paste agenda"/);
  assert.match(builderSource, /Conference/);
  assert.match(builderSource, /Trade Show/);
});

test("valid workbook selection advances to a dedicated multi-file mapping step", () => {
  assert.match(builderSource, /multiple/);
  assert.match(builderSource, /handleWorkbookSelected\(e\.target\.files\)/);
  assert.match(builderSource, /handleWorkbookSelected\(event\.dataTransfer\.files\)/);
  assert.match(builderSource, /workbookFiles\.map/);
  assert.match(builderSource, /removeWorkbookFile/);
  assert.match(builderSource, /Ready to map spreadsheets/);
  assert.match(builderSource, /goToWorkbookMapping/);
  assert.match(builderSource, /Map spreadsheets/);
  assert.match(builderSource, /role="tablist"/);
  assert.match(builderSource, /activeWorkbookFileName/);
  assert.match(builderSource, /setActiveWorkbookFileName\(group\.fileName\)/);
});

test("mapping step renders sheet targets, confidence, the mapping workbench, previews, and skipped-row reasons", () => {
  assert.match(builderSource, /workbookDetectionGroups\.map/);
  assert.match(builderSource, /workbookSourceSheetName\(activeWorkbookGroup\.fileName, suggestion\.sheetName\)/);
  assert.match(builderSource, /Suggested target: \{WORKBOOK_MODULE_LABEL\[suggestion\.suggestedModule\]\}/);
  assert.match(builderSource, /WorkbookMappingWorkbench/);
  assert.match(builderSource, /Map \{targetLabel\} fields/);
  assert.match(builderSource, /Choose which spreadsheet column should fill each Planner field\./);
  assert.match(builderSource, /Reset mapping/);
  assert.match(builderSource, /role="table"/);
  assert.match(builderSource, /Planner field/);
  assert.match(builderSource, /Requirement/);
  assert.match(builderSource, /Source column/);
  assert.match(builderSource, /Sample from spreadsheet/);
  assert.match(builderSource, /Ready/);
  assert.match(builderSource, /Not mapped/);
  assert.match(builderSource, /WORKBOOK_MAPPING_SPECS\[target\]/);
  assert.match(builderSource, /updateWorkbookFieldMapping/);
  assert.match(builderSource, /Sample imported record/);
  assert.match(builderSource, /Preview of row \{currentPreviewRow\} of \{review\.importableRows\}/);
  assert.match(builderSource, /Source row/);
  assert.match(builderSource, /No skipped rows detected\./);
  assert.match(builderSource, /rows will be skipped/);
  assert.match(builderSource, /const issueCount = group\.workbook\.sheets\.reduce/);
  assert.match(builderSource, /issueCount > 0 \? pluralizeCount\(issueCount, "issue"\)/);
  assert.match(builderSource, /const sheetIssueCount = errors\.length \+ \(review\?\.skippedRows \?\? 0\)/);
  assert.match(builderSource, /<option value="runOfShow">Run of Show<\/option>/);
  assert.match(builderSource, /<option value="budget">Budget<\/option>/);
  assert.match(builderSource, /<option value="timeline">Timeline<\/option>/);
  assert.match(builderSource, /<option value="notIncluded">Don&apos;t include<\/option>/);
  assert.match(builderSource, /onClick=\{\(\) => void buildPreview\(\)\}/);
  assert.match(builderSource, /setStep\("preview"\)/);
  assert.doesNotMatch(builderSource, /<p className="mt-1 text-\[11px\] text-slate-500">Planner field<\/p>/);
  assert.doesNotMatch(builderSource, /Mapped record preview/);
});

test("budget mapping preserves supported fields and defers session/group linking", () => {
  assert.match(builderSource, /const BUDGET_WORKBENCH_FIELDS/);
  assert.match(builderSource, /\{ key: "category", label: "Category", field: "category"/);
  assert.match(builderSource, /\{ key: "subcategory", label: "Subcategory", field: "subcategory"/);
  assert.match(builderSource, /\{ key: "lineItem", label: "Line item", field: "lineItem"/);
  assert.match(builderSource, /\{ key: "forecast", label: "Planned \/ Forecast", field: "forecast"/);
  assert.match(builderSource, /\{ key: "actual", label: "Actual", field: "actual"/);
  assert.match(builderSource, /\{ key: "vendor", label: "Vendor", field: "vendor"/);
  assert.match(builderSource, /\{ key: "status", label: "Status", field: "status"/);
  assert.doesNotMatch(builderSource, /key: "session", label: "Session"/);
  assert.doesNotMatch(builderSource, /key: "groupSubcategory"/);
  assert.match(builderSource, /field === "session" \|\| field === "group" \? "" : field/);
});

test("mapping workbench uses responsive two-column layout without page overflow", () => {
  assert.match(builderSource, /step === "mapping" && method === "workbook"/);
  assert.match(builderSource, /max-w-\[1560px\] px-4 py-6 sm:px-6 lg:px-8/);
  assert.match(builderSource, /max-w-5xl px-4 py-6/);
  assert.match(builderSource, /grid gap-5 xl:grid-cols-\[minmax\(0,1\.7fr\)_minmax\(380px,1fr\)\]/);
  assert.match(builderSource, /grid-cols-\[minmax\(150px,1\.1fr\)_120px_minmax\(180px,1\.1fr\)_minmax\(240px,1\.5fr\)_130px\] gap-4/);
  assert.match(builderSource, /overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm/);
  assert.match(builderSource, /min-w-0 md:min-w-\[920px\]/);
  assert.match(builderSource, /xl:sticky xl:top-4 xl:self-start/);
  assert.match(builderSource, /className="min-w-0 space-y-3"/);
  assert.match(builderSource, /className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm/);
  assert.match(builderSource, /className="overflow-x-auto"/);
});

test("workbook confidence labels explain mapping certainty", () => {
  assert.match(builderSource, /High confidence/);
  assert.match(builderSource, /Medium confidence/);
  assert.match(builderSource, /Needs review/);
  assert.doesNotMatch(builderSource, />\s*Low\s*</);
});

test("workbook mapping rows explain suggestions and make needs-review targets prominent", () => {
  assert.match(importBuilderSource, /Matched \$\{MODULE_LABEL\[module\]\} from columns:/);
  assert.match(importBuilderSource, /Weak match: sheet name suggests \$\{MODULE_LABEL\[module\]\}, but expected \$\{MODULE_LABEL\[module\]\} columns were not found/);
  assert.match(builderSource, /needs attention/);
  assert.match(builderSource, /border-amber-400 shadow-sm focus:border-amber-500/);
  assert.match(builderSource, /updateWorkbookSheetTarget/);
});

test("upload footer renders Map spreadsheets, while mapping renders Review & create", () => {
  assert.match(builderSource, /Map spreadsheets/);
  assert.match(builderSource, /Review & create/);
  assert.match(builderSource, /!hasSelectedStartingPoint \|\|/);
});

test("not included remains the stored value but the UI says don't include", () => {
  assert.match(builderSource, /value=\{selectedTarget\}/);
  assert.match(builderSource, /<option value="notIncluded">Don&apos;t include<\/option>/);
  assert.match(builderSource, /This sheet will be skipped\./);
  assert.match(importBuilderSource, /notIncluded: "Don't include"/);
  assert.doesNotMatch(builderSource, /Not included/);
  assert.doesNotMatch(importBuilderSource, /Not included/);
});

test("upload readiness separates detection from confirmed import mappings", () => {
  assert.match(builderSource, /Detected \$\{formatHumanList\(workbookDetectedModules\)\}/);
  assert.match(builderSource, /Next, review mappings before creating the workspace\./);
  assert.match(builderSource, /mapping review before import/);
  assert.match(builderSource, /No candidate found in uploaded files\./);
  assert.doesNotMatch(builderSource, /Budget is not mapped and can be added later/);
  assert.doesNotMatch(builderSource, /Preview will import \$\{formatHumanList\(workbookMappedModules\)\}\. \$\{formatHumanList\(workbookMissingModules\)\}/);
});

test("upload step exposes module status instead of hiding detection in file names", () => {
  assert.match(builderSource, /type WorkbookModuleStatus = "detected" \| "needsReview" \| "ready" \| "skipped" \| "missing"/);
  assert.match(builderSource, /WORKBOOK_MODULE_STATUS_LABEL/);
  assert.match(builderSource, /WORKBOOK_MODULE_STATUS_CLASSES/);
  assert.match(builderSource, /workbookModuleStatuses\[moduleKey\]/);
  assert.match(builderSource, /Candidate found\. Review mappings next\./);
  assert.match(builderSource, /Candidate found, but mapping needs confirmation\./);
});

test("invalid or unreadable workbook shows a useful error instead of trapping the flow", () => {
  assert.match(builderSource, /We couldn't read this file\. Upload an \.xlsx or \.csv file and try again\./);
  assert.match(builderSource, /No readable sheets were found in these files\. Upload a different \.xlsx or \.csv file\./);
  assert.match(builderSource, /Map at least one sheet to Run of Show, Budget, or Timeline to continue\./);
});

test("preview CTA has loading and disabled states while parsing or continuing", () => {
  assert.match(builderSource, /const \[isContinuing, setIsContinuing\] = useState\(false\)/);
  assert.match(builderSource, /Preparing review…/);
  assert.match(builderSource, /!hasSelectedStartingPoint \|\|/);
  assert.match(builderSource, /isParsing \|\|/);
  assert.match(builderSource, /isContinuing \|\|/);
  assert.match(builderSource, /isCreating \|\|/);
  assert.match(builderSource, /\(method === "workbook" && !workbookCanMap\)/);
  assert.match(builderSource, /disabled=\{isContinuing \|\| !workbookCanContinue\}/);
});

test("workbook review step is a read-only summary of confirmed mappings and skipped sheets", () => {
  assert.match(builderSource, /Confirmed sheet mappings/);
  assert.match(builderSource, /Read-only summary of the spreadsheet mappings you confirmed\./);
  assert.match(builderSource, /Selected mappings:/);
  assert.match(builderSource, /Skipped sheets:/);
  assert.match(builderSource, /Back to mapping/);
});

test("included sheets with missing required mappings block Review & create", () => {
  assert.match(builderSource, /workbookMappingErrors/);
  assert.match(builderSource, /validateMappingForTarget/);
  assert.match(builderSource, /Resolve missing required column mappings before continuing to Review & create\./);
  assert.match(builderSource, /Missing mappings/);
  assert.match(builderSource, /disabled=\{isContinuing \|\| !workbookCanContinue\}/);
});

test("readiness summary is derived from all mapped sheets across uploaded files", () => {
  assert.match(builderSource, /for \(const group of workbookDetectionGroups\)/);
  assert.match(builderSource, /for \(const sheet of group\.workbook\.sheets\)/);
  assert.match(builderSource, /const key = workbookSourceSheetName\(group\.fileName, sheet\.name\)/);
  assert.match(builderSource, /WORKBOOK_MODULE_ORDER\.filter/);
  assert.match(builderSource, /Preview will import \$\{formatHumanList\(workbookMappedModules\)\}\./);
  assert.match(builderSource, /workbookCandidateModuleEntries/);
  assert.match(builderSource, /workbookDetectedModules/);
  assert.doesNotMatch(builderSource, /Missing Budget can be added later/);
  assert.doesNotMatch(builderSource, /Ready to preview \$\{workbookMappedModules\.join/);
});

test("sheet review accounts for importable, skipped, and empty source rows", () => {
  assert.match(builderSource, /function buildSheetImportReview/);
  assert.match(builderSource, /const totalSourceRows = sheet\.rows\.length/);
  assert.match(builderSource, /importableRows: preview\.validRowCount/);
  assert.match(builderSource, /skippedRows: Math\.max\(0, totalSourceRows - preview\.validRowCount\)/);
  assert.match(builderSource, /function blankRowWarnings/);
  assert.match(builderSource, /message: "Empty row\."/);
  assert.match(builderSource, /\{review\.importableRows\} importable · \{review\.skippedRows\} skipped · \{review\.totalSourceRows\} source rows/);
  assert.match(builderSource, /\$\{pluralizeCount\(workbookSkippedRowCount, "row"\)\} across mapped sheets/);
});

test("mapped row preview renders labeled fields instead of concatenated spreadsheet strings", () => {
  assert.match(builderSource, /\{ label: "Item", value: row\.task \|\| "Missing" \}/);
  assert.match(builderSource, /\{ label: "Workstream", value: row\.workstream \? humanizeImportStatus\(row\.workstream\) : "Not mapped" \}/);
  assert.match(builderSource, /\{ label: "Planning Stage", value: row\.planningStage \? humanizeImportStatus\(row\.planningStage\) : "Not mapped" \}/);
  assert.match(builderSource, /\{ label: "Start", value: row\.startDate \|\| "Not mapped" \}/);
  assert.match(builderSource, /\{ label: "End", value: row\.endDate \|\| "Not mapped" \}/);
  assert.match(builderSource, /\{ label: "Owner", value: row\.owner \|\| "Unassigned" \}/);
  assert.match(builderSource, /\{ label: "Category", value: row\.category \|\| "Missing" \}/);
  assert.match(builderSource, /\{ label: "Planned \/ Forecast", value: formatCents\(row\.estimatedCents\) \}/);
  assert.match(builderSource, /previewRow\.fields\.map/);
  assert.doesNotMatch(builderSource, /row\.values\.slice\(0, 5\)\.filter\(Boolean\)\.join\(" · "\)/);
});

test("mapping state persists when navigating upload -> mapping -> review -> mapping", () => {
  assert.match(builderSource, /const \[workbookColumnMappings, setWorkbookColumnMappings\] = useState<WorkbookSheetColumnMappings>\(\{\}\)/);
  assert.match(builderSource, /const \[activeWorkbookFileName, setActiveWorkbookFileName\] = useState\(""\)/);
  assert.match(builderSource, /setStep\("mapping"\)/);
  assert.match(builderSource, /setStep\(method === "workbook" \? "mapping" : "source"\)/);
  assert.doesNotMatch(builderSource, /setWorkbookColumnMappings\(\{\}\)/);
});

test("review page renders final-review module cards instead of the old dense summary grid", () => {
  assert.match(previewSource, /Review workspace import/);
  assert.match(previewSource, /Nothing will be created until you click Create event workspace\./);
  assert.match(previewSource, /buildModuleSummaries/);
  assert.match(previewSource, /rows\.map\(\(row\) =>/);
  assert.match(previewSource, /Review preview/);
  assert.match(previewSource, /Edit mapping/);
  assert.doesNotMatch(previewSource, /Workspace import summary/);
  assert.doesNotMatch(previewSource, /Detected/);
  assert.doesNotMatch(previewSource, /After you create/);
});

test("review summary cards show one clear card per import target with counts and status", () => {
  assert.match(previewSource, /Run of Show/);
  assert.match(previewSource, /Budget/);
  assert.match(previewSource, /Timeline/);
  assert.match(previewSource, /status: statusFor\(runOfShow\.detected, runOfShowIssues\.length\)/);
  assert.match(previewSource, /status: statusFor\(budget\.detected, budgetIssues\.length\)/);
  assert.match(previewSource, /status: statusFor\(timeline\.detected, timelineIssues\.length\)/);
  assert.match(previewSource, /pluralize\(runOfShow\.validRowCount, "session"\)/);
  assert.match(previewSource, /pluralize\(budget\.validRowCount, "line item"\)/);
  assert.match(previewSource, /pluralize\(timeline\.validRowCount, "task"\)/);
  assert.match(previewSource, /Will create/);
  assert.match(previewSource, /Source/);
  assert.match(previewSource, /Skipped rows:/);
  assert.match(previewSource, /row\.muted \? "border-slate-200 bg-slate-50\/80 text-slate-500"/);
  assert.doesNotMatch(previewSource, /Sample mapped items/);
  assert.doesNotMatch(previewSource, /Review details/);
  assert.doesNotMatch(previewSource, /Included/);
});

test("review issue state is attributed, actionable, and does not contradict module status", () => {
  assert.match(previewSource, /type ReviewIssue =/);
  assert.match(previewSource, /moduleName: string/);
  assert.match(previewSource, /sourceFileName: string/);
  assert.match(previewSource, /sheetName: string/);
  assert.match(previewSource, /rowNumber\?: number/);
  assert.match(previewSource, /field\?: string/);
  assert.match(previewSource, /function buildModuleIssues/);
  assert.match(previewSource, /const issueCount = issues\.length/);
  assert.match(previewSource, /issueCount > 0 \?/);
  assert.match(previewSource, /\{pluralize\(issueCount, "issue"\)\} needs review/);
  assert.match(previewSource, /Issues to review/);
  assert.match(previewSource, /Fix in mapping/);
  assert.match(previewSource, /\{issue\.moduleName\} · \{issue\.sourceFileName\} → \{issue\.sheetName\}/);
  assert.match(previewSource, /Ready to create/);
  assert.doesNotMatch(previewSource, /3 items need review/);
  assert.doesNotMatch(previewSource, /Mapped to Budget from/);
  assert.doesNotMatch(previewSource, /No Budget sheet is mapped yet/);
  assert.match(importBuilderSource, /if \(selected\[moduleKey\]\.length > 0\) continue/);
});

test("top summary strip and footer readiness derive from included create counts", () => {
  assert.match(previewSource, /summarizeEventImportPreview\(preview\)/);
  assert.match(previewSource, /summary\.runOfShowRowsToCreate/);
  assert.match(previewSource, /summary\.budgetLineItemsToCreate/);
  assert.match(previewSource, /summary\.timelineItemsToCreate/);
  assert.match(previewSource, /footerReadiness\(rows, issues, hasBlockingIssues\)/);
  assert.match(previewSource, /Ready to create workspace with \$\{formatHumanList\(included\)\}\./);
  assert.match(previewSource, /\$\{issues\.length\} \$\{modulePrefix\}\$\{issues\.length === 1 \? "row" : "rows"\} will be skipped unless fixed\./);
  assert.match(previewSource, /Resolve \$\{pluralize\(issues\.filter\(\(issue\) => issue\.severity === "blocking"\)\.length, "issue"\)\} before creating workspace\./);
  assert.match(builderSource, /buildWorkbookSourcesCreatePlan\(parsedWorkbookSources, basics, workbookSelections, workbookColumnMappings\)/);
  assert.match(builderSource, /previewHasBlockingIssues/);
  assert.match(builderSource, /disabled=\{\s*isCreating\s*\|\| previewHasBlockingIssues/);
});

test("review preview drawer separates records, issues, and mapping details", () => {
  assert.match(previewSource, /function ModulePreviewDialog/);
  assert.match(previewSource, /Preview records/);
  assert.match(previewSource, /Issues/);
  assert.match(previewSource, /Mapping/);
  assert.match(previewSource, /\["Source row", "Date", "Time", "Session", "Room", "Setup", "AV", "Notes"\]/);
  assert.match(previewSource, /\["Source row", "Category", "Line item", "Planned", "Actual", "Status"\]/);
  assert.match(previewSource, /\["Source row", "Item", "Workstream", "Planning Stage", "Status", "Priority", "Start", "End", "CP", "Owner"\]/);
  assert.match(previewSource, /No issues found\./);
  assert.match(previewSource, /Planner field/);
  assert.match(previewSource, /Sample:/);
  assert.doesNotMatch(previewSource, /sampleItems/);
});

test("preview drawer issue tab exposes skipped row count and grouped reasons", () => {
  assert.match(previewSource, /Skipped rows:<\/span> \{module\.skippedCount\}/);
  assert.match(previewSource, /module\.issues\.map/);
  assert.match(previewSource, /issue\.rowNumber \? ` · Row \$\{issue\.rowNumber\}` : ""/);
  assert.match(previewSource, /issue\.field \?\? "Source row"/);
  assert.match(previewSource, /onEditMapping\(issue\.module\)/);
});

test("edit mapping action returns to the preserved workbook mapping state", () => {
  assert.match(previewSource, /function editMapping\(module\?: ModuleKey\)/);
  assert.match(previewSource, /setSelectedModule\(null\)/);
  assert.match(previewSource, /onBackToMapping\?\.\(module\)/);
  assert.match(builderSource, /function goToWorkbookMappingTarget\(module\?: SupportedWorkbookModule\)/);
  assert.match(builderSource, /workbookSelections\[workbookSourceSheetName\(group\.fileName, sheet\.name\)\] === module/);
  assert.match(builderSource, /onBackToMapping=\{\(module\) => goToWorkbookMappingTarget\(module\)\}/);
  assert.doesNotMatch(builderSource, /setWorkbookColumnMappings\(\{\}\)/);
});

test("post-create success page UI is not rendered", () => {
  assert.doesNotMatch(builderSource, /Your event workspace is ready\./);
  assert.doesNotMatch(builderSource, /Open event workspace/);
  assert.doesNotMatch(builderSource, /Recommended next steps/);
  assert.doesNotMatch(builderSource, /createResult/);
  assert.doesNotMatch(previewSource, /Recommended next steps/);
});

test("Start Blank continues to Review & create instead of creating from the source step", () => {
  assert.match(builderSource, /emptyEventImportPreview\(basics, "blank"\)/);
  assert.match(builderSource, /method === "blank"\s+\? void buildPreview\(\)/);
  assert.match(builderSource, /Review & create/);
  assert.doesNotMatch(builderSource, /method === "blank"\s+\? void handleCreate\(\)/);
  assert.match(builderSource, /router\.replace\(`\/events\/\$\{payload\.eventId\}\?created=1`\)/);
});

test("builder uses planner language, not internal model terms", () => {
  for (const term of ["MatrixRow", "BudgetLineItem", "TimelineItem", "Prisma", "mutation"]) {
    assert.ok(!builderSource.includes(term), `builder should not surface internal term ${term}`);
  }
});
