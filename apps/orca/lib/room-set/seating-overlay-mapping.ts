import type { PlannerSceneObject } from "@/lib/room-set/planner-scene";

export type RoomSetSeatingTableLinkTarget = Readonly<{
  id: string;
  seatingPlanId: string | null;
  sortOrder?: number;
  name?: string;
}>;

export type RoomSetSeatingOverlayTable = RoomSetSeatingTableLinkTarget & Readonly<{
  name: string;
  capacity: number;
}>;

export type RoomSetSeatingOverlayAssignment = Readonly<{
  tableId: string;
  attendeeId: string;
  seatIndex: number | null;
}>;

export type RoomSetSeatingOverlayAttendee = Readonly<{
  id: string;
  firstName: string;
  lastName: string;
}>;

export type RoomSetSeatingOverlayRecord = Readonly<{
  tableId: string;
  tableName: string;
  tableSortOrder?: number;
  assignedCount: number;
  capacity: number;
  attendeeNames: readonly string[];
  occupiedSeatIndexes: readonly number[];
  isFull: boolean;
}>;

export type RoomSetSeatingObjectLink<TTable extends RoomSetSeatingTableLinkTarget> = Readonly<{
  object: PlannerSceneObject;
  seatingTable: TTable;
}>;

export type RoomSetSeatingLinkRepairResult = Readonly<{
  objects: readonly PlannerSceneObject[];
  changed: boolean;
  linkedCount: number;
  clearedCount: number;
  skippedReason: "none" | "assignments_present" | "no_tables" | "no_visual_tables";
}>;

export function isPlannerSceneSeatingCapableObject(object: PlannerSceneObject): boolean {
  if (object.capacity.seated <= 0) return false;
  return (
    object.objectType === "banquet_table" ||
    object.objectType === "classroom_table" ||
    object.objectType === "chair_block" ||
    object.metadata.componentCategory === "seating"
  );
}

export function plannerSceneObjectSeatingTableId(object: PlannerSceneObject): string | null {
  const value = object.metadata.seatingTableId;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function resolvePlannerSceneSeatingObjectLinks<TTable extends RoomSetSeatingTableLinkTarget>(
  objects: readonly PlannerSceneObject[],
  seatingTableById: ReadonlyMap<string, TTable>,
): ReadonlyArray<RoomSetSeatingObjectLink<TTable>> {
  const objectIdsByTableId = new Map<string, string[]>();
  for (const object of objects) {
    const seatingTableId = plannerSceneObjectSeatingTableId(object);
    if (!seatingTableId || !seatingTableById.has(seatingTableId)) continue;
    objectIdsByTableId.set(seatingTableId, [...(objectIdsByTableId.get(seatingTableId) ?? []), object.id]);
  }

  return objects.flatMap((object) => {
    const seatingTableId = plannerSceneObjectSeatingTableId(object);
    if (!seatingTableId) return [];
    if ((objectIdsByTableId.get(seatingTableId)?.length ?? 0) !== 1) return [];
    const seatingTable = seatingTableById.get(seatingTableId);
    return seatingTable ? [{ object, seatingTable }] : [];
  });
}

export function plannerSceneObjectWithSeatingTableLink(
  object: PlannerSceneObject,
  seatingTable: RoomSetSeatingTableLinkTarget,
): PlannerSceneObject {
  return {
    ...object,
    metadata: {
      ...object.metadata,
      seatingTableId: seatingTable.id,
      ...(seatingTable.seatingPlanId ? { seatingPlanId: seatingTable.seatingPlanId } : {}),
    },
  };
}

function plannerSceneObjectWithoutSeatingTableLink(object: PlannerSceneObject): PlannerSceneObject {
  const { seatingTableId: _seatingTableId, seatingPlanId: _seatingPlanId, ...metadata } = object.metadata;
  return {
    ...object,
    metadata,
  };
}

function seatingTableSortValue(table: RoomSetSeatingTableLinkTarget): number {
  return Number.isFinite(table.sortOrder) ? Number(table.sortOrder) : Number.MAX_SAFE_INTEGER;
}

function sortSeatingTablesForRepair<TTable extends RoomSetSeatingTableLinkTarget>(
  tables: readonly TTable[],
): TTable[] {
  return [...tables].sort(
    (left, right) =>
      seatingTableSortValue(left) - seatingTableSortValue(right) ||
      (left.name ?? "").localeCompare(right.name ?? "") ||
      left.id.localeCompare(right.id),
  );
}

export function repairPlannerSceneSeatingTableLinks<TTable extends RoomSetSeatingTableLinkTarget>(
  input: Readonly<{
    objects: readonly PlannerSceneObject[];
    seatingTables: readonly TTable[];
    assignments: readonly RoomSetSeatingOverlayAssignment[];
    activeSeatingPlanId?: string | null;
  }>,
): RoomSetSeatingLinkRepairResult {
  const scopedTables = input.activeSeatingPlanId
    ? input.seatingTables.filter((table) => table.seatingPlanId === input.activeSeatingPlanId)
    : input.seatingTables;
  const seatingTableById = new Map(scopedTables.map((table) => [table.id, table]));
  const seatingObjects = input.objects.filter(isPlannerSceneSeatingCapableObject);
  if (seatingObjects.length === 0) {
    return {
      objects: input.objects,
      changed: false,
      linkedCount: 0,
      clearedCount: 0,
      skippedReason: "no_visual_tables",
    };
  }
  if (scopedTables.length === 0) {
    return {
      objects: input.objects,
      changed: false,
      linkedCount: 0,
      clearedCount: 0,
      skippedReason: "no_tables",
    };
  }

  const objectIdsByTableId = new Map<string, string[]>();
  for (const object of seatingObjects) {
    const seatingTableId = plannerSceneObjectSeatingTableId(object);
    if (!seatingTableId) continue;
    objectIdsByTableId.set(seatingTableId, [...(objectIdsByTableId.get(seatingTableId) ?? []), object.id]);
  }

  const validLinkedObjectIds = new Set<string>();
  const usedTableIds = new Set<string>();
  const sanitizedObjects = input.objects.map((object) => {
    if (!isPlannerSceneSeatingCapableObject(object)) return object;
    const seatingTableId = plannerSceneObjectSeatingTableId(object);
    if (!seatingTableId) return object;
    const seatingTable = seatingTableById.get(seatingTableId);
    const uniqueLink = (objectIdsByTableId.get(seatingTableId)?.length ?? 0) === 1;
    if (!seatingTable || !uniqueLink) return plannerSceneObjectWithoutSeatingTableLink(object);
    validLinkedObjectIds.add(object.id);
    usedTableIds.add(seatingTable.id);
    return object;
  });

  const clearedCount = sanitizedObjects.reduce((count, object, index) => {
    return count + (object !== input.objects[index] ? 1 : 0);
  }, 0);
  const assignmentsOnCandidateTables = input.assignments.some((assignment) =>
    seatingTableById.has(assignment.tableId),
  );
  const unlinkedIndexes = sanitizedObjects
    .map((object, index) => ({ object, index }))
    .filter(({ object }) => isPlannerSceneSeatingCapableObject(object))
    .filter(({ object }) => !validLinkedObjectIds.has(object.id));

  if (unlinkedIndexes.length === 0) {
    return {
      objects: sanitizedObjects,
      changed: clearedCount > 0,
      linkedCount: 0,
      clearedCount,
      skippedReason: "none",
    };
  }

  if (assignmentsOnCandidateTables) {
    return {
      objects: sanitizedObjects,
      changed: clearedCount > 0,
      linkedCount: 0,
      clearedCount,
      skippedReason: "assignments_present",
    };
  }

  const availableTables = sortSeatingTablesForRepair(scopedTables).filter((table) => !usedTableIds.has(table.id));
  if (availableTables.length === 0) {
    return {
      objects: sanitizedObjects,
      changed: clearedCount > 0,
      linkedCount: 0,
      clearedCount,
      skippedReason: "no_tables",
    };
  }

  const repairedObjects = [...sanitizedObjects];
  let linkedCount = 0;
  for (const { index } of unlinkedIndexes) {
    const seatingTable = availableTables[linkedCount];
    if (!seatingTable) break;
    repairedObjects[index] = plannerSceneObjectWithSeatingTableLink(repairedObjects[index], seatingTable);
    linkedCount += 1;
  }

  return {
    objects: repairedObjects,
    changed: clearedCount > 0 || linkedCount > 0,
    linkedCount,
    clearedCount,
    skippedReason: "none",
  };
}

function attendeeName(attendee: RoomSetSeatingOverlayAttendee): string {
  return `${attendee.firstName} ${attendee.lastName}`.trim();
}

export function buildPlannerSceneSeatingOverlayRecords(
  objects: readonly PlannerSceneObject[],
  tables: readonly RoomSetSeatingOverlayTable[],
  assignments: readonly RoomSetSeatingOverlayAssignment[],
  attendees: readonly RoomSetSeatingOverlayAttendee[],
): Readonly<Record<string, RoomSetSeatingOverlayRecord>> {
  const tableById = new Map(tables.map((table) => [table.id, table]));
  const attendeeById = new Map(attendees.map((attendee) => [attendee.id, attendee]));
  const assignmentsByTableId = new Map<string, RoomSetSeatingOverlayAssignment[]>();
  for (const assignment of assignments) {
    assignmentsByTableId.set(assignment.tableId, [
      ...(assignmentsByTableId.get(assignment.tableId) ?? []),
      assignment,
    ]);
  }

  const records: Record<string, RoomSetSeatingOverlayRecord> = {};
  for (const { object, seatingTable } of resolvePlannerSceneSeatingObjectLinks(objects, tableById)) {
    const assigned = assignmentsByTableId.get(seatingTable.id) ?? [];
    const occupiedSeatIndexes = new Set<number>();
    for (const assignment of assigned) {
      if (assignment.seatIndex != null) occupiedSeatIndexes.add(assignment.seatIndex);
    }

    records[object.id] = {
      tableId: seatingTable.id,
      tableName: seatingTable.name,
      ...(Number.isFinite(seatingTable.sortOrder) ? { tableSortOrder: Number(seatingTable.sortOrder) } : {}),
      assignedCount: assigned.length,
      capacity: Math.max(1, seatingTable.capacity),
      attendeeNames: assigned
        .map((assignment) => attendeeById.get(assignment.attendeeId))
        .filter((attendee): attendee is RoomSetSeatingOverlayAttendee => Boolean(attendee))
        .map(attendeeName),
      occupiedSeatIndexes: [...occupiedSeatIndexes],
      isFull: assigned.length >= Math.max(1, seatingTable.capacity),
    };
  }

  return records;
}
