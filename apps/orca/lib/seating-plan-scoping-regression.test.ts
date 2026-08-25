import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const seatingServiceSource = readFileSync(new URL("./seating.ts", import.meta.url), "utf8");
const roomSetWorkspaceSource = readFileSync(
  new URL(
    "../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/room-set-workspace.tsx",
    import.meta.url,
  ),
  "utf8",
);
const overlayMappingSource = readFileSync(
  new URL("./room-set/seating-overlay-mapping.ts", import.meta.url),
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

test("two different matrix rows resolve through matrixRow-scoped seating plans", () => {
  assert.equal(seatingServiceSource.includes("where: { matrixRowId }"), true);
  assert.equal(seatingServiceSource.includes("matrixRowId,"), true);
  assert.equal(seatingServiceSource.includes("return plan.id;"), true);
  assert.equal(seatingServiceSource.includes("where: { eventId, seatingPlanId }"), true);
});

test("matrix-row seating tables are seeded as scoped tables, not event-level fallback rows", () => {
  assert.equal(seatingServiceSource.includes("buildScopedSeatingTableTemplates(matrixRow, eventWideTables)"), true);
  assert.equal(seatingServiceSource.includes("seatingPlanId: plan.id"), true);
  assert.equal(seatingServiceSource.includes("name: table.name,"), true);
  assert.equal(seatingServiceSource.includes("capacity: table.capacity,"), true);
  assert.equal(seatingServiceSource.includes("scopedSeatingTableName(matrixRow, table.name, index)"), true);
});

test("legacy cloned scoped table names are relabeled without changing table ids or assignments", () => {
  assert.equal(seatingServiceSource.includes("tablesMatchLegacyEventWideSeed(scopedTables, eventWideTables)"), true);
  assert.equal(seatingServiceSource.includes("tx.seatingTable.update({"), true);
  assert.equal(seatingServiceSource.includes("where: { id: table.id }"), true);
  assert.equal(seatingServiceSource.includes("data: { name: tableTemplates[index]?.name ?? table.name }"), true);
});

test("embedded seating GET with matrixRowId does not fall back to event-level seating", () => {
  assert.equal(seatingServiceSource.includes("if (matrixRowId) {\n    const plan = await ensureSeatingPlanForMatrixRow(eventId, matrixRowId);"), true);
  assert.equal(seatingServiceSource.includes("return null;\n}"), true);
  assert.equal(roomSetWorkspaceSource.includes("seating?matrixRowId=${encodeURIComponent(sessionId)}"), true);
});

test("switching Room Set sessions clears and refetches seating snapshot state", () => {
  assert.equal(roomSetWorkspaceSource.includes("seatingLoadRequestIdRef.current += 1;"), true);
  assert.equal(roomSetWorkspaceSource.includes("reviseSeatingPlanIdLedger(null);"), true);
  assert.equal(roomSetWorkspaceSource.includes("reviseSeatingTablesLedger([]);"), true);
  assert.equal(roomSetWorkspaceSource.includes("reviseSeatingAssignmentsLedger([]);"), true);
  assert.equal(roomSetWorkspaceSource.includes("if (seatingLoadRequestIdRef.current !== requestIdLedger) return;"), true);
});

test("selected table state clears if the selected table is not in the active session snapshot", () => {
  assert.equal(roomSetWorkspaceSource.includes("if (!selectedSeatingTableIdLedger) return;"), true);
  assert.equal(roomSetWorkspaceSource.includes("if (seatingTableByIdLedger.has(selectedSeatingTableIdLedger)) return;"), true);
  assert.equal(roomSetWorkspaceSource.includes("reviseSelectedSeatingTableIdLedger(null);"), true);
  assert.equal(roomSetWorkspaceSource.includes("reviseSelectedSeatingObjectIdLedger(null);"), true);
});

test("session-scoped assignment writes remain scoped by seatingPlanId", () => {
  assert.equal(seatingServiceSource.includes("const seatingPlanId = await resolveSeatingWritePlanId(eventId, scope);"), true);
  assert.equal(seatingServiceSource.includes("where: {\n          eventId,\n          attendeeId: resolvedAttendeeId,\n          seatingPlanId,"), true);
  assert.equal(seatingServiceSource.includes("if (table.seatingPlanId !== seatingPlanId)"), true);
});

test("stable overlay repair only considers seating tables from the active session plan", () => {
  assert.equal(overlayMappingSource.includes("activeSeatingPlanId?: string | null;"), true);
  assert.equal(overlayMappingSource.includes("input.seatingTables.filter((table) => table.seatingPlanId === input.activeSeatingPlanId)"), true);
  assert.equal(roomSetWorkspaceSource.includes("activeSeatingPlanId: seatingPlanIdLedger"), true);
});

test("scoped seating rejects invalid matrix rows and cross-event seating plans", () => {
  assert.equal(seatingServiceSource.includes("where: { id: matrixRowId, eventId }"), true);
  assert.equal(seatingServiceSource.includes('throw new SeatingError("Matrix row not found", 404);'), true);
  assert.equal(seatingServiceSource.includes("where: { id: seatingPlanId, eventId }"), true);
  assert.equal(seatingServiceSource.includes('throw new SeatingError("Seating plan not found", 404);'), true);
});

test("session scoped seating writes reject missing and mismatched embedded context", () => {
  assert.equal(seatingServiceSource.includes("scope?.requireScopedContext && !matrixRowId && !seatingPlanId"), true);
  assert.equal(seatingServiceSource.includes("Seating context is required for scoped seating writes"), true);
  assert.equal(seatingServiceSource.includes("plan.matrixRowId !== matrixRowId"), true);
  assert.equal(seatingServiceSource.includes("Seating context does not match the seating plan"), true);
  assert.equal(roomSetWorkspaceSource.includes("requireScopedContext: true"), true);
});

test("table and attendee validation is event and seating-plan scoped before assignment writes", () => {
  const assignStart = seatingServiceSource.indexOf("export async function assignAttendeeToTable");
  const unassignStart = seatingServiceSource.indexOf("export async function unassignAttendee");
  assert.notEqual(assignStart, -1);
  assert.notEqual(unassignStart, -1);
  const assignSource = seatingServiceSource.slice(assignStart, unassignStart);

  assert.equal(assignSource.includes("resolveSeatingAttendeeIdForWrite(tx, eventId, attendeeId)"), true);
  assert.equal(seatingServiceSource.includes("where: { id: attendeeId, eventId }"), true);
  assert.equal(seatingServiceSource.includes("where: { eventId, eventAttendeeId: attendeeId }"), true);
  assert.equal(assignSource.includes("tx.seatingTable.findFirst({\n          where: { id: tableId, eventId }"), true);
  assert.equal(assignSource.includes("if (table.seatingPlanId !== seatingPlanId)"), true);
  assert.equal(assignSource.includes("Table does not belong to the active seating context"), true);
  assert.equal(/data: {\s*eventId,\s*tableId,\s*attendeeId: resolvedAttendeeId,\s*seatingPlanId,/.test(assignSource), true);
});

test("unassignment deletes only in the active seating plan and leaves event-level seating isolated", () => {
  const unassignStart = seatingServiceSource.indexOf("export async function unassignAttendee");
  assert.notEqual(unassignStart, -1);
  const unassignSource = seatingServiceSource.slice(unassignStart);

  assert.equal(unassignSource.includes("const seatingPlanId = await resolveSeatingWritePlanId(eventId, scope);"), true);
  assert.equal(unassignSource.includes("deleteMany({\n      where: {\n        eventId,\n        attendeeId: resolvedAttendeeId,\n        seatingPlanId,"), true);
  assert.equal(seatingServiceSource.includes("where: { eventId, seatingPlanId: null }"), true);
  assert.equal(seatingServiceSource.includes("return null;"), true);
});

test("duplicate assignments update only inside one seatingPlanId while sibling plans can keep the same attendee", () => {
  assert.equal(seatingServiceSource.includes("where: {\n          eventId,\n          attendeeId: resolvedAttendeeId,\n          seatingPlanId,"), true);
  assert.equal(seatingServiceSource.includes("await tx.seatingAssignment.update({"), true);
  assert.equal(seatingServiceSource.includes("where: { id: existingAssignment.id }"), true);
  assert.equal(seatingServiceSource.includes("await tx.seatingAssignment.create({"), true);
  assert.equal(seatingServiceSource.includes("seatingPlanId,"), true);
});

test("same attendee can be assigned independently in two session plans", () => {
  const assignSource = sourceBetween(
    seatingServiceSource,
    "export async function assignAttendeeToTable",
    "export async function unassignAttendee",
  );

  assert.equal(assignSource.includes("const seatingPlanId = await resolveSeatingWritePlanId(eventId, scope);"), true);
  assert.equal(assignSource.includes("where: {\n          eventId,\n          attendeeId: resolvedAttendeeId,\n          seatingPlanId,"), true);
  assert.equal(assignSource.includes('"SeatingAssignment_event_attendee_plan_key"'), false);
  assert.equal(assignSource.includes("await tx.seatingAssignment.create({"), true);
});

test("unassign in one session plan cannot remove sibling session or event-level assignments", () => {
  const unassignSource = sourceBetween(seatingServiceSource, "export async function unassignAttendee");

  assert.equal(unassignSource.includes("const seatingPlanId = await resolveSeatingWritePlanId(eventId, scope);"), true);
  assert.equal(unassignSource.includes("seatingAssignment.deleteMany"), true);
  assert.equal(unassignSource.includes("eventId,\n        attendeeId: resolvedAttendeeId,\n        seatingPlanId,"), true);
  assert.equal(unassignSource.includes("tableId"), false);
});

test("seatIndex uniqueness is enforced before scoped assignment writes", () => {
  const assignSource = sourceBetween(
    seatingServiceSource,
    "export async function assignAttendeeToTable",
    "export async function unassignAttendee",
  );

  assert.equal(assignSource.includes("seatIndex != null && seatIndex >= table.capacity"), true);
  assert.equal(assignSource.includes("const occupiedTargetSeat = seatIndex == null"), true);
  assert.equal(assignSource.includes("tableId,\n              seatIndex,\n              NOT: { attendeeId: resolvedAttendeeId }"), true);
  assert.equal(assignSource.includes('throw new SeatingError("Chair is already occupied", 409);'), true);
});
