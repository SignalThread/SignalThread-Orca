import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schemaSource = readFileSync("prisma/schema.prisma", "utf8");
const migrationSource = readFileSync(
  "test-fixtures/legacy-orca-migrations/20260609100000_add_matrixrow_seating_plans/migration.sql",
  "utf8",
);
const scopedAssignmentMigrationSource = readFileSync(
  "test-fixtures/legacy-orca-migrations/20260609143000_scope_seating_assignments/migration.sql",
  "utf8",
);
const attendeeBridgeMigrationSource = readFileSync(
  "test-fixtures/legacy-orca-migrations/20260624143000_add_seating_attendee_event_bridge/migration.sql",
  "utf8",
);
const seatingServiceSource = readFileSync("lib/seating.ts", "utf8");
const seatingGetRouteSource = readFileSync("app/api/events/[eventId]/seating/route.ts", "utf8");
const seatingAssignRouteSource = readFileSync("app/api/events/[eventId]/seating/assign/route.ts", "utf8");
const seatingUnassignRouteSource = readFileSync("app/api/events/[eventId]/seating/unassign/route.ts", "utf8");
const roomSetWorkspaceSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/room-set-workspace.tsx",
  "utf8",
);
const plannerCanvasSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/planner-scene-prototype-canvas.tsx",
  "utf8",
);

function sourceBetween(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  if (!endMarker) return source.slice(start);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("seating schema supports MatrixRow-scoped plans and nullable chair indexes", () => {
  assert.equal(schemaSource.includes("model SeatingPlan"), true);
  assert.equal(schemaSource.includes("matrixRowId String?"), true);
  assert.equal(schemaSource.includes("seatingPlanId String?"), true);
  assert.equal(schemaSource.includes("eventAttendeeId String?"), true);
  assert.match(schemaSource, /seatIndex\s+Int\?/);
  assert.equal(schemaSource.includes("@@unique([matrixRowId])"), true);
  assert.equal(schemaSource.includes("@@unique([tableId, seatIndex])"), true);
  assert.equal(schemaSource.includes("@@unique([eventId, attendeeId])"), false);
  assert.equal(schemaSource.includes("seatingPlan   SeatingPlan?"), true);
  assert.equal(schemaSource.includes("eventAttendee   EventAttendee?"), true);
});

test("seating migration preserves legacy null plan and null seat assignment rows", () => {
  assert.equal(migrationSource.includes('CREATE TABLE IF NOT EXISTS "SeatingPlan"'), true);
  assert.equal(migrationSource.includes('ADD COLUMN IF NOT EXISTS "seatingPlanId" UUID'), true);
  assert.equal(migrationSource.includes('ADD COLUMN IF NOT EXISTS "seatIndex" INTEGER'), true);
  assert.equal(migrationSource.includes('"SeatingAssignment_tableId_seatIndex_key"'), true);
});

test("seating assignment migration replaces global attendee uniqueness with scoped partial indexes", () => {
  assert.equal(scopedAssignmentMigrationSource.includes('ADD COLUMN IF NOT EXISTS "seatingPlanId" UUID'), true);
  assert.equal(scopedAssignmentMigrationSource.includes('DROP INDEX IF EXISTS "SeatingAssignment_eventId_attendeeId_key"'), true);
  assert.equal(scopedAssignmentMigrationSource.includes('"SeatingAssignment_event_attendee_event_level_key"'), true);
  assert.equal(scopedAssignmentMigrationSource.includes('WHERE "seatingPlanId" IS NULL'), true);
  assert.equal(scopedAssignmentMigrationSource.includes('"SeatingAssignment_event_attendee_plan_key"'), true);
  assert.equal(scopedAssignmentMigrationSource.includes('WHERE "seatingPlanId" IS NOT NULL'), true);
  assert.equal(scopedAssignmentMigrationSource.includes('"SeatingAssignment_tableId_seatIndex_key"'), false);
});

test("seating assignment migration preflights bad existing data before constraint changes", () => {
  assert.equal(scopedAssignmentMigrationSource.includes("references a missing seating table"), true);
  assert.equal(scopedAssignmentMigrationSource.includes("different event than its table"), true);
  assert.equal(scopedAssignmentMigrationSource.includes("missing or mismatched seating plan"), true);
  assert.equal(scopedAssignmentMigrationSource.includes("duplicate event-level assignments"), true);
  assert.equal(scopedAssignmentMigrationSource.includes("duplicate scoped assignments"), true);
  assert.equal(scopedAssignmentMigrationSource.indexOf("duplicate scoped assignments") < scopedAssignmentMigrationSource.indexOf("DROP INDEX IF EXISTS"), true);
});

test("seating attendee bridge migration links legacy seating identities to canonical attendees", () => {
  assert.equal(attendeeBridgeMigrationSource.includes('ADD COLUMN IF NOT EXISTS "eventAttendeeId" UUID'), true);
  assert.equal(attendeeBridgeMigrationSource.includes('CREATE UNIQUE INDEX IF NOT EXISTS "SeatingAttendee_eventAttendeeId_key"'), true);
  assert.equal(attendeeBridgeMigrationSource.includes('CREATE INDEX IF NOT EXISTS "SeatingAttendee_eventId_eventAttendeeId_idx"'), true);
  assert.equal(attendeeBridgeMigrationSource.includes('FOREIGN KEY ("eventAttendeeId") REFERENCES "EventAttendee"("id")'), true);
  assert.equal(attendeeBridgeMigrationSource.includes("ON DELETE SET NULL"), true);
});

test("seating service scopes snapshots and enforces occupied chair collisions", () => {
  assert.equal(seatingServiceSource.includes("ensureSeatingPlanForMatrixRow"), true);
  assert.equal(seatingServiceSource.includes("syncEventAttendeesIntoSeating"), true);
  assert.equal(seatingServiceSource.includes("eventAttendee.findMany"), true);
  assert.equal(seatingServiceSource.includes("matrixRowId"), true);
  assert.equal(seatingServiceSource.includes("seatingPlanId"), true);
  assert.equal(seatingServiceSource.includes("seatIndex exceeds table capacity"), true);
  assert.equal(seatingServiceSource.includes("Chair is already occupied"), true);
  assert.equal(seatingServiceSource.includes("data: { tableId, seatIndex }"), true);
});

test("seating service persists exact table and chair assignment", () => {
  assert.equal(seatingServiceSource.includes("function normalizeSeatIndex"), true);
  assert.equal(seatingServiceSource.includes("assignAttendeeToTable("), true);
  assert.equal(seatingServiceSource.includes("seatIndexInput?: unknown"), true);
  assert.equal(seatingServiceSource.includes("const seatIndex = normalizeSeatIndex(seatIndexInput);"), true);
  assert.equal(seatingServiceSource.includes("data: { tableId, seatIndex }"), true);
  assert.equal(
    /tableId,\s*attendeeId: resolvedAttendeeId,\s*seatingPlanId,\s*seatIndex,/.test(seatingServiceSource),
    true,
  );
});

test("seating service moves attendees between chairs and tables", () => {
  assert.equal(seatingServiceSource.includes("existingAssignment"), true);
  assert.equal(seatingServiceSource.includes("existingAssignment?.tableId === tableId"), true);
  assert.equal(seatingServiceSource.includes("existingAssignment.seatIndex === seatIndex"), true);
  assert.equal(seatingServiceSource.includes("eventId_attendeeId"), false);
  assert.equal(seatingServiceSource.includes("data: { tableId, seatIndex }"), true);
});

test("seating service unassigns attendees only in the active seating context", () => {
  const unassignSource = sourceBetween(seatingServiceSource, "export async function unassignAttendee");

  assert.equal(seatingServiceSource.includes("export async function unassignAttendee"), true);
  assert.equal(unassignSource.includes("seatingAssignment.deleteMany"), true);
  assert.equal(unassignSource.includes("eventId,\n        attendeeId: resolvedAttendeeId,"), true);
  assert.equal(unassignSource.includes("seatingPlanId,"), true);
  assert.equal(unassignSource.includes("seatingTable.delete"), false);
  assert.equal(unassignSource.includes("seatingAttendee.delete"), false);
});

test("seating service rejects occupied chair collisions", () => {
  assert.equal(seatingServiceSource.includes("const occupiedTargetSeat = seatIndex == null"), true);
  assert.equal(seatingServiceSource.includes("tableId,\n              seatIndex,\n              NOT: { attendeeId: resolvedAttendeeId }"), true);
  assert.equal(seatingServiceSource.includes("Chair is already occupied"), true);
  assert.equal(seatingServiceSource.includes("409"), true);
});

test("MatrixRow-scoped seating snapshots do not leak event-level or sibling-row assignments", () => {
  assert.equal(seatingServiceSource.includes("resolveSeatingSnapshotPlanId"), true);
  assert.equal(seatingServiceSource.includes("return null;"), true);
  assert.equal(seatingServiceSource.includes("await syncEventAttendeesIntoSeating(eventId);"), true);
  assert.equal(seatingServiceSource.includes("where: { eventId, seatingPlanId }"), true);
  assert.equal(seatingServiceSource.includes("const tableIds = tables.map((table) => table.id);"), true);
  assert.equal(seatingServiceSource.includes("where: { eventId, tableId: { in: tableIds } }"), true);
  assert.equal(seatingServiceSource.includes("where: { eventId, seatingPlanId: null }"), true);
  assert.equal(seatingServiceSource.includes("seatingPlanId: plan.id"), true);
});

test("seating snapshot bridges event attendees into reusable seating identities without duplicates", () => {
  assert.equal(seatingServiceSource.includes("findLegacySeatingAttendeeMatch"), true);
  assert.equal(seatingServiceSource.includes("seatingByEventAttendeeId"), true);
  assert.equal(seatingServiceSource.includes("availableLegacyAttendees.splice"), true);
  assert.equal(seatingServiceSource.includes("eventAttendee: { connect: { id: canonical.eventAttendeeId } }"), true);
  assert.equal(seatingServiceSource.includes("skipDuplicates: true"), true);
  assert.equal(seatingServiceSource.includes("select: { id: true, eventId: true, eventAttendeeId: true, firstName: true, lastName: true, company: true, email: true }"), true);
  assert.equal(roomSetWorkspaceSource.includes("eventAttendeeId: string | null;"), true);
});

test("seating writes bridge canonical EventAttendee ids through SeatingAttendee compatibility rows", () => {
  assert.equal(seatingServiceSource.includes("async function resolveSeatingAttendeeIdForWrite"), true);
  assert.equal(seatingServiceSource.includes("where: { eventId, eventAttendeeId: attendeeId }"), true);

  const assignSource = sourceBetween(seatingServiceSource, "export async function assignAttendeeToTable", "export async function unassignAttendee");
  assert.equal(assignSource.includes("await syncEventAttendeesIntoSeating(eventId);"), true);
  assert.equal(assignSource.includes("resolveSeatingAttendeeIdForWrite(tx, eventId, attendeeId)"), true);
  assert.equal(assignSource.includes("attendeeId: resolvedAttendeeId"), true);
  assert.equal(assignSource.includes("NOT: { attendeeId: resolvedAttendeeId }"), true);

  const unassignSource = sourceBetween(seatingServiceSource, "export async function unassignAttendee");
  assert.equal(unassignSource.includes("await syncEventAttendeesIntoSeating(eventId);"), true);
  assert.equal(unassignSource.includes("const resolvedAttendeeId = await resolveSeatingAttendeeIdForWrite(tx, eventId, attendeeId);"), true);
  assert.equal(unassignSource.includes("attendeeId: resolvedAttendeeId"), true);
});

test("Room Set unassigned candidates render bridged attendee identity fields", () => {
  assert.equal(roomSetWorkspaceSource.includes("eventAttendeeId: string | null;"), true);
  assert.equal(roomSetWorkspaceSource.includes("email: string | null;"), true);
  assert.equal(roomSetWorkspaceSource.includes("company: string | null;"), true);
  assert.equal(roomSetWorkspaceSource.includes("reviseSeatingAttendeesLedger(seatingPayloadLedger.attendees ?? []);"), true);
  assert.equal(roomSetWorkspaceSource.includes("unassignedSeatingAttendeesLedger.map"), true);
  assert.equal(roomSetWorkspaceSource.includes('attendee.company ?? attendee.email ?? "Unassigned"'), true);
});

test("standalone event-level seating keeps null-plan fallback", () => {
  assert.equal(seatingServiceSource.includes("export async function getSeatingSnapshot"), true);
  assert.equal(seatingServiceSource.includes("return null;"), true);
  assert.equal(seatingServiceSource.includes("where: { eventId, seatingPlanId }"), true);
  assert.equal(seatingGetRouteSource.includes('request.nextUrl.searchParams.get("matrixRowId")'), true);
  assert.equal(seatingGetRouteSource.includes('request.nextUrl.searchParams.get("seatingPlanId")'), true);
  assert.equal(seatingGetRouteSource.includes("getSeatingSnapshot(eventId, { matrixRowId, seatingPlanId })"), true);
});

test("seating API accepts scoped GET and optional seatIndex assignment", () => {
  assert.equal(seatingGetRouteSource.includes('searchParams.get("matrixRowId")'), true);
  assert.equal(seatingGetRouteSource.includes('searchParams.get("seatingPlanId")'), true);
  assert.equal(seatingAssignRouteSource.includes('"seatIndex"'), true);
  assert.equal(seatingAssignRouteSource.includes("assignAttendeeToTable(eventId, attendeeId, tableId, seatIndex, {"), true);
  assert.equal(seatingAssignRouteSource.includes("requireScopedContext"), true);
  assert.equal(seatingUnassignRouteSource.includes("unassignAttendee(eventId, attendeeId, {"), true);
  assert.equal(seatingUnassignRouteSource.includes("requireScopedContext"), true);
});

test("Room Set seating mode loads MatrixRow plan and sends scoped chair-level writes", () => {
  assert.equal(roomSetWorkspaceSource.includes("matrixRowId=${encodeURIComponent(sessionId)}"), true);
  assert.equal(roomSetWorkspaceSource.includes("matrixRowId: sessionId"), true);
  assert.equal(roomSetWorkspaceSource.includes("requireScopedContext: true"), true);
  assert.equal(roomSetWorkspaceSource.includes("seatingPlanId: seatingPlanIdLedger"), true);
  assert.equal(roomSetWorkspaceSource.includes("seatIndex: seatIndexLedger"), true);
  assert.equal(roomSetWorkspaceSource.includes("Chair assignments"), true);
  assert.equal(roomSetWorkspaceSource.includes("selectedFirstOpenSeatIndexLedger"), true);
});

test("seating service scopes assign writes by seatingPlanId", () => {
  const assignSource = sourceBetween(seatingServiceSource, "export async function assignAttendeeToTable", "export async function unassignAttendee");

  assert.equal(assignSource.includes("const seatingPlanId = await resolveSeatingWritePlanId(eventId, scope);"), true);
  assert.equal(/attendeeId: resolvedAttendeeId,\s*seatingPlanId,/.test(assignSource), true);
  assert.equal(/data: {\s*eventId,\s*tableId,\s*attendeeId: resolvedAttendeeId,\s*seatingPlanId,/.test(assignSource), true);
});

test("seating service rejects missing or mismatched scoped write context", () => {
  assert.equal(seatingServiceSource.includes("Seating context is required for scoped seating writes"), true);
  assert.equal(seatingServiceSource.includes("Seating context does not match the seating plan"), true);
  assert.equal(seatingServiceSource.includes("Table does not belong to the active seating context"), true);
});

test("seating service rejects tables outside the event and preserves exact chair assignment", () => {
  const assignSource = sourceBetween(seatingServiceSource, "export async function assignAttendeeToTable", "export async function unassignAttendee");

  assert.equal(assignSource.includes("where: { id: tableId, eventId }"), true);
  assert.equal(assignSource.includes("seatIndex exceeds table capacity"), true);
  assert.equal(assignSource.includes("Chair is already occupied"), true);
  assert.equal(schemaSource.includes("@@unique([tableId, seatIndex])"), true);
});

test("Room Set canvas reports clicked visual chair index to seating mode", () => {
  assert.equal(plannerCanvasSource.includes("occupiedSeatIndexes"), true);
  assert.equal(plannerCanvasSource.includes("[data-table-seat='true'], [data-chair-seat='true']"), true);
  assert.equal(plannerCanvasSource.includes("dataset.seatIndex"), true);
  assert.equal(plannerCanvasSource.includes("onSeatingObjectSelect?."), true);
});

test("Room Set seating supports drag-and-drop attendee assignment", () => {
  assert.equal(roomSetWorkspaceSource.includes("DndContext"), true);
  assert.equal(roomSetWorkspaceSource.includes("useDraggable"), true);
  assert.equal(roomSetWorkspaceSource.includes("useDroppable"), true);
  assert.equal(roomSetWorkspaceSource.includes("room-set-unassigned-drop"), true);
  assert.equal(roomSetWorkspaceSource.includes("handleSeatingDragEndLedger"), true);
  assert.equal(roomSetWorkspaceSource.includes("dropDataLedger.type === \"unassigned\""), true);
  assert.equal(roomSetWorkspaceSource.includes("dropDataLedger.tableId"), true);
  assert.equal(roomSetWorkspaceSource.includes("dropDataLedger.occupied"), true);
  assert.equal(roomSetWorkspaceSource.includes("dropDataLedger.seatIndex"), true);
});

test("Room Set seating inspector keeps chair rows as the primary assignment surface", () => {
  assert.equal(roomSetWorkspaceSource.includes("EmbeddedSeatingInspectorSeatDropRow"), true);
  assert.equal(roomSetWorkspaceSource.includes("room-set-inspector-chair-attendee"), true);
  assert.equal(roomSetWorkspaceSource.includes("onRemove={"), true);
  assert.equal(roomSetWorkspaceSource.includes("All assigned attendees"), false);
  assert.equal(roomSetWorkspaceSource.includes("attendee.company ?? attendee.email ?? \"Unassigned\""), true);
});

test("Room Set seating assignment keeps table inspector context after chair drops", () => {
  assert.equal(roomSetWorkspaceSource.includes("reviseSelectedSeatingTableIdLedger(tableLedger.id);"), true);
  assert.equal(roomSetWorkspaceSource.includes("reviseSelectedSeatingAttendeeIdLedger(null);"), true);
  assert.equal(roomSetWorkspaceSource.includes("revisePendingSeatingAttendeeIdLedger(attendeeLedger.id);"), true);
});

test("Room Set canvas exposes visual chair anchors as drop targets", () => {
  assert.equal(plannerCanvasSource.includes("useDroppable"), true);
  assert.equal(plannerCanvasSource.includes("room-set-canvas-chair"), true);
  assert.equal(plannerCanvasSource.includes("data-room-set-chair-drop-target"), true);
  assert.equal(plannerCanvasSource.includes("type: \"chair\""), true);
  assert.equal(plannerCanvasSource.includes("seatIndex"), true);
  assert.equal(plannerCanvasSource.includes("occupied"), true);
});

test("Room Set layout drag uses transient preview and commits once on pointer up", () => {
  assert.equal(plannerCanvasSource.includes("type PrototypeDragPreview"), true);
  assert.equal(plannerCanvasSource.includes("scheduleDragPreview({"), true);
  assert.equal(plannerCanvasSource.includes("commitObjectPositionNow(interaction.objectId, finalMove.xLu, finalMove.yLu);"), true);
  assert.equal(plannerCanvasSource.includes("scheduleObjectPosition("), false);
});

test("Room Set layout drag keeps child chair markers from stealing parent movement", () => {
  assert.equal(plannerCanvasSource.includes("interactionRef.current?.mode === \"move\""), true);
  assert.equal(plannerCanvasSource.includes("[className, \"pointer-events-none\"].join(\" \")"), true);
  assert.equal(plannerCanvasSource.includes("setPointerCapture(event.pointerId);"), true);
});
