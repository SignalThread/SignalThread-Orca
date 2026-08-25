import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const matrix2PageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const matrix2BoardSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2Board.tsx", "utf8");
const matrix2DrawerSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2DetailsDrawer.tsx", "utf8");
const inlineModulePickerSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2InlineModulePicker.tsx", "utf8");
const sessionWorkspaceSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx",
  "utf8",
);
const matrix2SessionRouteSource = readFileSync("app/api/events/[eventId]/matrix-2/sessions/[sessionId]/route.ts", "utf8");
const matrixRowRouteSource = readFileSync("app/api/events/[eventId]/matrix-rows/[rowId]/route.ts", "utf8");
const productionGateSource = readFileSync("lib/production-coming-soon-gates.test.ts", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("Run of Show List uses checkbox multi-select instead of radio-style single select", () => {
  const overviewSource = sourceBetween(
    matrix2PageSource,
    "function MatrixOverviewTable",
    "export default function Matrix2Page",
  );

  assert.match(overviewSource, /selectedSessionIds: Set<string>/);
  assert.match(overviewSource, /type="checkbox"[\s\S]*aria-label="Select visible sessions"/);
  assert.match(overviewSource, /type="checkbox"[\s\S]*aria-label=\{`Select \$\{session\.title\}`\}/);
  assert.match(overviewSource, /onToggleSessionSelection\(session\.id\)/);
  assert.match(overviewSource, /onToggleAllVisibleSessions\(visibleSessionIds\)/);
  assert.doesNotMatch(overviewSource, /type="radio"/);
  assert.doesNotMatch(overviewSource, /name="matrix-overview-session"/);
});

test("Run of Show List renders an inline selected-state bulk action bar", () => {
  const overviewSource = sourceBetween(
    matrix2PageSource,
    "function MatrixOverviewTable",
    "export default function Matrix2Page",
  );

  assert.match(overviewSource, /data-testid="matrix-overview-bulk-action-bar"/);
  assert.match(overviewSource, /\{selectedCount\} selected/);
  assert.match(overviewSource, /Clear selection/);
  assert.match(overviewSource, /Set type\.\.\./);
  assert.match(overviewSource, /Set room\.\.\./);
  assert.match(overviewSource, /Set status\.\.\./);
  assert.match(overviewSource, /Set room set\.\.\./);
  assert.match(overviewSource, /placeholder="Set count\.\.\."/);
  assert.match(overviewSource, /Add AV\.\.\./);
  assert.match(overviewSource, /Archive selected/);
  assert.doesNotMatch(overviewSource, />\s*Apply\s*</);
});

test("Run of Show List bulk updates use minimal session PATCH payloads", () => {
  assert.match(matrix2PageSource, /type MatrixOverviewBulkPatch = \{[\s\S]*sessionType\?: string;[\s\S]*roomId\?: string \| null;[\s\S]*status\?: string;[\s\S]*roomSetupType\?: string;[\s\S]*expectedAttendance\?: number \| null;[\s\S]*addAvRequirementItemId\?: string;/);
  assert.match(matrix2PageSource, /onBulkUpdateSessions\(sessionIds, patch\)/);
  assert.match(matrix2PageSource, /function handleBulkSessionTypeChange[\s\S]*void applyBulkPatch\(\{ sessionType \}\);/);
  assert.match(matrix2PageSource, /function handleBulkRoomChange[\s\S]*void applyBulkPatch\(\{ roomId: roomId === "__unassigned__" \? null : roomId \}\);/);
  assert.match(matrix2PageSource, /function handleBulkStatusChange[\s\S]*void applyBulkPatch\(\{ status \}\);/);
  assert.match(matrix2PageSource, /function handleBulkRoomSetupChange[\s\S]*void applyBulkPatch\(\{ roomSetupType \}\);/);
  assert.match(matrix2PageSource, /function commitBulkAttendance[\s\S]*void applyBulkPatch\(\{ expectedAttendance \}\);/);
  assert.match(matrix2PageSource, /function handleBulkAvRequirementChange[\s\S]*void applyBulkPatch\(\{ addAvRequirementItemId \}\);/);
  assert.doesNotMatch(matrix2PageSource, /bulkSessionType|bulkRoomId|bulkStatus/);
  assert.match(matrix2PageSource, /fetch\(`\/api\/events\/\$\{selectedEventId\}\/matrix-2\/sessions\/\$\{session\.id\}`,[\s\S]*method: "PATCH"[\s\S]*body: JSON\.stringify\(requestBody\)/);

  const bulkUpdateSource = sourceBetween(
    matrix2PageSource,
    "const handleBulkUpdateOverviewSessions",
    "const handleBulkDeleteOverviewSessions",
  );
  assert.doesNotMatch(bulkUpdateSource, /foodAndBeverage/);
  assert.doesNotMatch(bulkUpdateSource, /speakers:/);
  assert.doesNotMatch(bulkUpdateSource, /staffAssignments/);
});

test("Run of Show List renders editable room set style, people count, and notes columns", () => {
  const overviewSource = sourceBetween(
    matrix2PageSource,
    "function MatrixOverviewTable",
    "export default function Matrix2Page",
  );

  assert.match(matrix2PageSource, /\{ id: "roomSetup", label: "Room set style" \}/);
  assert.match(matrix2PageSource, /\{ id: "attendance", label: "Count" \}/);
  assert.doesNotMatch(matrix2PageSource, /Room set people count/);
  assert.match(matrix2PageSource, /\{ id: "notes", label: "Notes" \}/);
  assert.match(overviewSource, /orderedColumns\.map\(\(column\) =>/);
  assert.match(overviewSource, /getHeaderReorderProps\(column\)/);
  assert.match(overviewSource, /<MatrixOverviewSortHeader[\s\S]*label=\{column\.label\}[\s\S]*sortKey=\{column\.id\}/);
  assert.match(overviewSource, /value=\{activeDraft\.roomSetupType\}/);
  assert.match(overviewSource, /aria-label=\{`Count for \$\{session\.title\}`\}/);
  assert.match(overviewSource, /value=\{activeDraft\.notes\}/);
  assert.match(matrix2PageSource, /roomSetupType: draft\.roomSetupType\.trim\(\)/);
  assert.match(matrix2PageSource, /expectedAttendance,/);
  assert.match(matrix2PageSource, /notes: draft\.notes/);
});

test("Run of Show List row edits expose Save and Cancel actions", () => {
  const overviewSource = sourceBetween(
    matrix2PageSource,
    "function MatrixOverviewTable",
    "export default function Matrix2Page",
  );

  assert.match(overviewSource, /data-testid=\{`matrix-overview-session-save-\$\{session\.id\}`\}/);
  assert.match(overviewSource, /data-testid=\{`matrix-overview-session-cancel-\$\{session\.id\}`\}/);
  assert.match(overviewSource, /\n\s*Save\s*\n\s*<\/button>/);
  assert.match(overviewSource, /\n\s*Cancel\s*\n\s*<\/button>/);
  assert.match(overviewSource, /disabled=\{isSaving\}/);
  assert.match(overviewSource, /isSaving \? <Loader2/);
  assert.doesNotMatch(overviewSource, />\s*Editing\s*</);
  assert.doesNotMatch(overviewSource, /onBlur=\{\(event\) => \{[\s\S]*void saveDraft\(session\);/);
});

test("Run of Show List Save exits edit mode after success and failed Save keeps the draft", () => {
  const saveDraftSource = sourceBetween(
    matrix2PageSource,
    "async function saveDraft",
    "async function applyBulkPatch",
  );

  assert.match(saveDraftSource, /await onSaveSession\(session, draft\)/);
  assert.match(saveDraftSource, /setEditingSessionId\(null\)/);
  assert.match(saveDraftSource, /setDraft\(null\)/);
  const catchStart = saveDraftSource.indexOf("} catch (error) {");
  assert.ok(catchStart >= 0, "saveDraft catch block exists");
  const catchSource = saveDraftSource.slice(catchStart);
  assert.match(catchSource, /setRowError\(error instanceof Error \? error\.message : "Failed to save session"\)/);
  assert.doesNotMatch(catchSource, /setEditingSessionId\(null\)/);
  assert.doesNotMatch(catchSource, /setDraft\(null\)/);
});

test("Run of Show List Cancel exits edit mode without saving changes", () => {
  const cancelSource = sourceBetween(
    matrix2PageSource,
    "function cancelEditing",
    "function updateDraft",
  );
  const overviewSource = sourceBetween(
    matrix2PageSource,
    "function MatrixOverviewTable",
    "export default function Matrix2Page",
  );

  assert.match(cancelSource, /setEditingSessionId\(null\)/);
  assert.match(cancelSource, /setDraft\(null\)/);
  assert.doesNotMatch(cancelSource, /onSaveSession|saveDraft/);
  assert.match(overviewSource, /onClick=\{\(event\) => \{[\s\S]*cancelEditing\(\);/);
});

test("Run of Show List AV editing uses the shared compact quick picker", () => {
  const overviewSource = sourceBetween(
    matrix2PageSource,
    "function MatrixOverviewTable",
    "export default function Matrix2Page",
  );

  assert.match(matrix2PageSource, /import \{[\s\S]*inferSessionRequirementCatalogType[\s\S]*\} from "@\/lib\/session-requirement-catalog"/);
  assert.match(matrix2PageSource, /function matrixOverviewRequirementItemsByType/);
  assert.match(matrix2PageSource, /const avRequirementItems = useMemo\([\s\S]*matrixOverviewRequirementItemsByType\(snapshot\?\.requirementTemplate, "AV"\)/);
  assert.match(matrix2PageSource, /avRequirementValues: Record<string, string>/);
  assert.match(matrix2PageSource, /buildOverviewAvRequirementPayload/);
  assert.match(overviewSource, /<Matrix2InlineModulePicker[\s\S]*ariaLabel=\{`AV for/);
  assert.match(overviewSource, /placeholder="Select AV"/);
  assert.match(overviewSource, /options=\{avPickerOptions\}/);
  assert.match(inlineModulePickerSource, /createPortal\(/);
  assert.match(inlineModulePickerSource, /window\.addEventListener\("mousedown", handlePointerDown\)/);
  assert.match(inlineModulePickerSource, /event\.key !== "Escape"/);
  assert.match(inlineModulePickerSource, /slice\(0, 6\)/);
  assert.doesNotMatch(matrix2PageSource, /activeDraft\.avText|placeholder="AV needs"/);
  assert.doesNotMatch(overviewSource, /max-h-24 min-w-\[210px\] space-y-1 overflow-y-auto/);
  assert.doesNotMatch(overviewSource, /avRequirementItems\.length > 0 \? avRequirementItems\.map/);
});

test("Run of Show List F&B editing uses the uploaded catalog quick picker", () => {
  const overviewSource = sourceBetween(
    matrix2PageSource,
    "function MatrixOverviewTable",
    "export default function Matrix2Page",
  );

  assert.match(overviewSource, /<Matrix2InlineModulePicker[\s\S]*ariaLabel=\{`F&B for/);
  assert.match(overviewSource, /options=\{fnbPickerOptions\}/);
  assert.match(overviewSource, /emptyLabel="No F&B catalog items available\."/);
  assert.match(overviewSource, /Manage F&B catalog/);
  assert.doesNotMatch(overviewSource, /activeDraft\.fnbText/);
});

test("Run of Show List edit row keeps controls compact", () => {
  const overviewSource = sourceBetween(
    matrix2PageSource,
    "function MatrixOverviewTable",
    "export default function Matrix2Page",
  );

  assert.match(overviewSource, /className=\{overviewInputClassName\("min-w-\[200px\]"\)\}/);
  assert.doesNotMatch(overviewSource, /<textarea/);
  assert.doesNotMatch(overviewSource, /rows=\{?2\}?/);
  assert.match(inlineModulePickerSource, /className="flex h-8 w-full min-w-0 items-center justify-between/);
});

test("Run of Show List room set style uses existing setup fields and canonical setup options", () => {
  assert.match(matrix2PageSource, /function matrixOverviewRoomSetupOptions/);
  assert.match(matrix2PageSource, /matrixOverviewRequirementItemsByType\(snapshot\?\.requirementTemplate, "SETUP"\)/);
  assert.match(matrix2PageSource, /roomSetupType: session\.roomSetup/);
  assert.match(matrix2PageSource, /setupRequirementItemIds/);
  assert.match(matrix2PageSource, /selectedSetupItem/);
  assert.match(matrix2PageSource, /roomSetupType: draft\.roomSetupType\.trim\(\)/);
  assert.doesNotMatch(matrix2PageSource, /prisma\/schema|migrations/);
});

test("AV requirement options are shared by drawer, workspace, list, and bulk edit", () => {
  assert.match(matrix2DrawerSource, /requirementItemsByType\.AV/);
  assert.match(matrix2DrawerSource, /selectedRequirementItemsByType\.AV/);
  assert.match(sessionWorkspaceSource, /const avSections = typedSections\.filter\(\(entry\) => entry\.sectionType === "AV"\)/);
  assert.match(sessionWorkspaceSource, /selectedRequirementReadinessItems\(avSections, selectedRequirementValues\)/);
  assert.match(matrix2PageSource, /matrixOverviewRequirementItemsByType\(snapshot\?\.requirementTemplate, "AV"\)/);
  assert.match(matrix2PageSource, /aria-label="Bulk add AV requirement"/);
  assert.match(matrix2PageSource, /buildOverviewAvRequirementPayload/);
});

test("Run of Show List removes Room Set and Seating row-end link-outs", () => {
  const overviewSource = sourceBetween(
    matrix2PageSource,
    "function MatrixOverviewTable",
    "export default function Matrix2Page",
  );

  assert.doesNotMatch(overviewSource, /Open layout/);
  assert.doesNotMatch(overviewSource, /Assign seating/);
  assert.doesNotMatch(overviewSource, /roomSetHref\(eventId, session\.id, "layout"\)/);
  assert.doesNotMatch(overviewSource, /roomSetHref\(eventId, session\.id, "seating"\)/);
});

test("Run of Show List bulk archive uses the compatibility row route with confirmation", () => {
  assert.match(matrix2PageSource, /window\.confirm\([\s\S]*Archive \$\{sessionIds\.length\} selected session/);
  assert.match(matrix2PageSource, /fetch\(`\/api\/events\/\$\{selectedEventId\}\/matrix-rows\/\$\{session\.rowId\}`,[\s\S]*method: "DELETE"/);
  assert.match(matrix2PageSource, /setSelectedOverviewSessionIds\(\(current\) => \{[\s\S]*next\.delete\(session\.id\)/);
});

test("bulk write routes remain server-side EVENT_VIEWER gated", () => {
  assert.match(matrix2SessionRouteSource, /await assertEventAccessForUser\(eventId, currentUserResult\.user, "write"\)/);
  assert.match(matrix2SessionRouteSource, /const updated = await updateMatrix2Session\(eventId, sessionId, body\)/);
  assert.match(matrixRowRouteSource, /assertEventAccessForUser\(eventId, currentUserResult\.user, "write"\)/);
  assert.match(matrixRowRouteSource, /await deleteMatrixRow\(eventId, rowId, \{ id: currentUserResult\.user\.id \}\)/);
});

test("Board view, quick drawer, and production gates remain separate from List bulk selection", () => {
  assert.doesNotMatch(matrix2BoardSource, /selectedOverviewSessionIds|matrix-overview-bulk-action-bar|onBulkUpdateSessions/);
  assert.doesNotMatch(matrix2DrawerSource, /selectedOverviewSessionIds|matrix-overview-bulk-action-bar|onBulkUpdateSessions/);
  assert.match(productionGateSource, /shouldGateSessionRegistration/);
  assert.match(productionGateSource, /isRoomSetAndSeatingAvailable/);
});
