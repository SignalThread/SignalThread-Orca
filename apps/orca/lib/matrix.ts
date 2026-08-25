import { createHash, randomUUID } from "node:crypto";
import { MealPeriod, Prisma, type EventActivityAction } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { assertEventAccessForUser, EventAccessError, type EventAccessUser } from "@/lib/event-access";
import { recordEventActivity } from "@/src/server/services/event-activity";
import { ensureEventSessionRequirementTemplateTx } from "@/lib/session-requirements";
import { matrixImportRowFingerprint, type MatrixImportOperationalRequirement } from "@/lib/matrix-import";

/** Authenticated actor context for Run of Show session audit entries. */
export type MatrixAuditActor = { id: string } | null | undefined;

async function recordSessionActivity(args: {
  eventId: string;
  actor: MatrixAuditActor;
  action: EventActivityAction;
  sessionId?: string;
  sessionName: string | null;
  message: string;
}): Promise<void> {
  await recordEventActivity(getPrisma(), {
    eventId: args.eventId,
    actor: args.actor?.id ? { kind: "USER", userId: args.actor.id } : { kind: "SYSTEM", label: "System" },
    module: "RUN_OF_SHOW",
    action: args.action,
    entityType: "Session",
    entityId: args.sessionId,
    entityLabel: args.sessionName ?? "Session",
    message: args.message,
  });
}

export class MatrixError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Translate event-access failures into MatrixError so routes handle one type. */
async function assertMatrixEventAccess(
  eventId: string,
  user: EventAccessUser,
  accessType: "read" | "write",
): Promise<void> {
  try {
    await assertEventAccessForUser(eventId, user, accessType);
  } catch (error) {
    if (error instanceof EventAccessError) {
      throw new MatrixError(error.message, error.status);
    }
    throw error;
  }
}

export type MatrixRowRecord = {
  id: string;
  eventId: string;
  date: string;
  startTime: string;
  endTime: string;
  roomId: string | null;
  room: string;
  sessionName: string;
  setup: string;
  attendance: number | null;
  meal: string;
  avNeeds: string;
  notes: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MatrixRowsResponse = {
  event: {
    id: string;
    name: string;
    startDate: string;
    slug: string;
  };
  availableDates: string[];
  rows: MatrixRowRecord[];
};

type MatrixFilter = {
  date?: string | null;
};

type MatrixCreateInput = {
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  roomId?: unknown;
  room?: unknown;
  sessionName?: unknown;
  setup?: unknown;
  attendance?: unknown;
  meal?: unknown;
  avNeeds?: unknown;
  notes?: unknown;
  sortOrder?: unknown;
};

type MatrixUpdateInput = Partial<MatrixCreateInput>;

const mealToLabel: Record<MealPeriod, string> = {
  NONE: "N/A",
  BREAKFAST: "Breakfast",
  BREAK: "Break",
  LUNCH: "Lunch",
  RECEPTION: "Reception",
  DINNER: "Dinner",
  OTHER: "Other",
};

function isMissingSortOrderColumn(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2022" &&
    error.message.includes("sortOrder")
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "event";
}

function toOptionalText(value: unknown): string | null {
  if (typeof value === "undefined" || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function toText(value: unknown): string {
  return toOptionalText(value) ?? "";
}

function parseRoomIdInput(value: unknown, fieldName: string): string | null {
  if (typeof value === "undefined" || value === null) return null;
  if (typeof value !== "string") {
    throw new MatrixError(`${fieldName} must be a string`, 400);
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseDateInput(value: unknown, fieldName: string): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new MatrixError(`${fieldName} must be YYYY-MM-DD`, 400);
  }

  const parsed = new Date(`${value.trim()}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new MatrixError(`${fieldName} must be a valid date`, 400);
  }
  return parsed;
}

function parseTimeInput(value: unknown, fieldName: string): Date {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value.trim())) {
    throw new MatrixError(`${fieldName} must be HH:mm`, 400);
  }
  const [hoursString, minutesString] = value.trim().split(":");
  const hours = Number(hoursString);
  const minutes = Number(minutesString);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new MatrixError(`${fieldName} must be HH:mm`, 400);
  }
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));
}

function parseOptionalAttendance(value: unknown): number | null {
  if (typeof value === "undefined" || value === null || String(value).trim() === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    throw new MatrixError("attendance must be an integer >= 0", 400);
  }
  return parsed;
}

function parseSortOrder(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new MatrixError("sortOrder must be an integer >= 0", 400);
  }
  return parsed;
}

function parseMeal(value: unknown): MealPeriod | null {
  const normalized = toOptionalText(value);
  if (!normalized) return null;

  const upper = normalized.toUpperCase();
  if (upper === "N/A" || upper === "NA" || upper === "NONE") return MealPeriod.NONE;
  if (upper === "BREAKFAST") return MealPeriod.BREAKFAST;
  if (upper === "BREAK") return MealPeriod.BREAK;
  if (upper === "LUNCH") return MealPeriod.LUNCH;
  if (upper === "RECEPTION") return MealPeriod.RECEPTION;
  if (upper === "DINNER") return MealPeriod.DINNER;
  if (upper === "OTHER") return MealPeriod.OTHER;
  return MealPeriod.OTHER;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatTime(value: Date | null): string {
  if (!value) return "";
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function rowToRecord(row: {
  id: string;
  eventId: string;
  dayDate: Date;
  startTime: Date | null;
  endTime: Date | null;
  roomId: string | null;
  roomName: string | null;
  sessionName: string | null;
  setupType: string | null;
  attendance: number | null;
  mealPeriod: MealPeriod | null;
  avNeeds: string | null;
  notes: string | null;
  sortOrder?: number;
  createdAt: Date;
  updatedAt: Date;
}, fallbackSortOrder = 0): MatrixRowRecord {
  return {
    id: row.id,
    eventId: row.eventId,
    date: formatDate(row.dayDate),
    startTime: formatTime(row.startTime),
    endTime: formatTime(row.endTime),
    roomId: row.roomId,
    room: row.roomName ?? "",
    sessionName: row.sessionName ?? "",
    setup: row.setupType ?? "",
    attendance: row.attendance,
    meal: row.mealPeriod ? mealToLabel[row.mealPeriod] : "",
    avNeeds: row.avNeeds ?? "",
    notes: row.notes ?? "",
    sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : fallbackSortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getEventOrThrow(eventId: string): Promise<{ id: string; name: string; startDate: Date }> {
  const event = await getPrisma().event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, startDate: true },
  });
  if (!event) {
    throw new MatrixError("Event not found", 404);
  }
  return event;
}

async function resolveRoomForEvent(eventId: string, roomId: string | null): Promise<{ id: string; name: string } | null> {
  if (!roomId) return null;

  const room = await getPrisma().room.findFirst({
    where: { id: roomId, eventId },
    select: { id: true, name: true },
  });
  if (!room) {
    throw new MatrixError("Room not found for event", 400);
  }
  return room;
}

function rowOrderBy(): Prisma.MatrixRowOrderByWithRelationInput[] {
  return [{ dayDate: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }];
}

async function findMatrixRowsCompat(where: Prisma.MatrixRowWhereInput): Promise<MatrixRowRecord[]> {
  try {
    const rows = await getPrisma().matrixRow.findMany({
      where,
      orderBy: rowOrderBy(),
      select: {
        id: true,
        eventId: true,
        dayDate: true,
        startTime: true,
        endTime: true,
        roomId: true,
        roomName: true,
        sessionName: true,
        setupType: true,
        attendance: true,
        mealPeriod: true,
        avNeeds: true,
        notes: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return rows.map((row) => rowToRecord(row));
  } catch (error) {
    if (!isMissingSortOrderColumn(error)) {
      throw error;
    }

    const rows = await getPrisma().matrixRow.findMany({
      where,
      orderBy: [{ dayDate: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        eventId: true,
        dayDate: true,
        startTime: true,
        endTime: true,
        roomId: true,
        roomName: true,
        sessionName: true,
        setupType: true,
        attendance: true,
        mealPeriod: true,
        avNeeds: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return rows.map((row, index) => rowToRecord(row, index));
  }
}

function whereForFilter(eventId: string, filter?: MatrixFilter): Prisma.MatrixRowWhereInput {
  const where: Prisma.MatrixRowWhereInput = { eventId, archivedAt: null };
  const dateValue = filter?.date?.trim();
  if (dateValue && dateValue.toLowerCase() !== "all") {
    where.dayDate = parseDateInput(dateValue, "date");
  }
  return where;
}

async function getAvailableDates(eventId: string): Promise<string[]> {
  const rows = await getPrisma().matrixRow.findMany({
    where: { eventId, archivedAt: null },
    select: { dayDate: true },
    orderBy: { dayDate: "asc" },
  });

  const unique = new Set<string>();
  for (const row of rows) {
    unique.add(formatDate(row.dayDate));
  }
  return Array.from(unique);
}

export async function listMatrixRows(eventId: string, filter?: MatrixFilter): Promise<MatrixRowsResponse> {
  const event = await getEventOrThrow(eventId);
  const where = whereForFilter(eventId, filter);

  const [rows, availableDates] = await Promise.all([findMatrixRowsCompat(where), getAvailableDates(eventId)]);

  return {
    event: {
      id: event.id,
      name: event.name,
      startDate: formatDate(event.startDate),
      slug: slugify(event.name),
    },
    availableDates,
    rows,
  };
}

function normalizeCreateInput(eventStartDate: Date, input: MatrixCreateInput): {
  dayDate: Date;
  startTime: Date;
  endTime: Date;
  roomId: string | null;
  roomName: string | null;
  sessionName: string;
  setupType: string;
  attendance: number | null;
  mealPeriod: MealPeriod | null;
  avNeeds: string;
  notes: string;
} {
  const dayDate = typeof input.date === "string" && input.date.trim()
    ? parseDateInput(input.date, "date")
    : eventStartDate;

  const startTime = parseTimeInput(input.startTime ?? "08:00", "startTime");
  const endTime = parseTimeInput(input.endTime ?? "09:00", "endTime");
  if (endTime.getTime() <= startTime.getTime()) {
    throw new MatrixError("endTime must be after startTime", 400);
  }

  return {
    dayDate,
    startTime,
    endTime,
    roomId: parseRoomIdInput(input.roomId, "roomId"),
    roomName: toOptionalText(input.room),
    sessionName: toText(input.sessionName),
    setupType: toText(input.setup),
    attendance: parseOptionalAttendance(input.attendance),
    mealPeriod: parseMeal(input.meal),
    avNeeds: toText(input.avNeeds),
    notes: toText(input.notes),
  };
}

export async function createMatrixRow(eventId: string, input: MatrixCreateInput, actor?: MatrixAuditActor): Promise<MatrixRowRecord> {
  const event = await getEventOrThrow(eventId);
  const normalized = normalizeCreateInput(event.startDate, input);
  const resolvedRoom = await resolveRoomForEvent(eventId, normalized.roomId);
  const resolvedRoomName = resolvedRoom ? resolvedRoom.name : normalized.roomName;

  try {
    const maxOrder = await getPrisma().matrixRow.aggregate({
      where: { eventId },
      _max: { sortOrder: true },
    });

    const created = await getPrisma().matrixRow.create({
      data: {
        eventId,
        roomId: resolvedRoom?.id ?? null,
        dayDate: normalized.dayDate,
        startTime: normalized.startTime,
        endTime: normalized.endTime,
        roomName: resolvedRoomName,
        sessionName: normalized.sessionName,
        setupType: normalized.setupType,
        attendance: normalized.attendance,
        mealPeriod: normalized.mealPeriod,
        avNeeds: normalized.avNeeds,
        notes: normalized.notes,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
      select: {
        id: true,
        eventId: true,
        dayDate: true,
        startTime: true,
        endTime: true,
        roomId: true,
        roomName: true,
        sessionName: true,
        setupType: true,
        attendance: true,
        mealPeriod: true,
        avNeeds: true,
        notes: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await recordSessionActivity({
      eventId,
      actor,
      action: "CREATED",
      sessionId: created.id,
      sessionName: created.sessionName,
      message: `Created session "${created.sessionName}"`,
    });
    return rowToRecord(created);
  } catch (error) {
    if (!isMissingSortOrderColumn(error)) {
      throw error;
    }

    const created = await getPrisma().matrixRow.create({
      data: {
        eventId,
        roomId: resolvedRoom?.id ?? null,
        dayDate: normalized.dayDate,
        startTime: normalized.startTime,
        endTime: normalized.endTime,
        roomName: resolvedRoomName,
        sessionName: normalized.sessionName,
        setupType: normalized.setupType,
        attendance: normalized.attendance,
        mealPeriod: normalized.mealPeriod,
        avNeeds: normalized.avNeeds,
        notes: normalized.notes,
      },
      select: {
        id: true,
        eventId: true,
        dayDate: true,
        startTime: true,
        endTime: true,
        roomId: true,
        roomName: true,
        sessionName: true,
        setupType: true,
        attendance: true,
        mealPeriod: true,
        avNeeds: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await recordSessionActivity({
      eventId,
      actor,
      action: "CREATED",
      sessionId: created.id,
      sessionName: created.sessionName,
      message: `Created session "${created.sessionName}"`,
    });
    return rowToRecord(created, 0);
  }
}

export async function updateMatrixRow(eventId: string, rowId: string, input: MatrixUpdateInput, actor?: MatrixAuditActor): Promise<MatrixRowRecord> {
  const existing = await getPrisma().matrixRow.findFirst({
    where: { id: rowId, eventId, archivedAt: null },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      dayDate: true,
      roomName: true,
      sessionName: true,
      setupType: true,
    },
  });
  if (!existing) {
    throw new MatrixError("Matrix row not found", 404);
  }

  const data: Prisma.MatrixRowUncheckedUpdateInput = {};

  if (typeof input.date !== "undefined") data.dayDate = parseDateInput(input.date, "date");
  const startTime = typeof input.startTime !== "undefined"
    ? parseTimeInput(input.startTime, "startTime")
    : existing.startTime;
  const endTime = typeof input.endTime !== "undefined"
    ? parseTimeInput(input.endTime, "endTime")
    : existing.endTime;
  if (startTime && endTime && endTime.getTime() <= startTime.getTime()) {
    throw new MatrixError("endTime must be after startTime", 400);
  }
  if (typeof input.startTime !== "undefined") data.startTime = startTime;
  if (typeof input.endTime !== "undefined") data.endTime = endTime;
  const hasRoomId = Object.prototype.hasOwnProperty.call(input, "roomId");
  const hasRoomName = typeof input.room !== "undefined";
  if (hasRoomId || hasRoomName) {
    const parsedRoomId = hasRoomId ? parseRoomIdInput(input.roomId, "roomId") : null;
    const resolvedRoom = hasRoomId ? await resolveRoomForEvent(eventId, parsedRoomId) : null;
    const nextRoomName = resolvedRoom ? resolvedRoom.name : hasRoomName ? toOptionalText(input.room) : hasRoomId ? null : undefined;

    if (hasRoomId) data.roomId = resolvedRoom?.id ?? null;
    if (typeof nextRoomName !== "undefined") data.roomName = nextRoomName;
  }
  if (typeof input.sessionName !== "undefined") data.sessionName = toText(input.sessionName);
  if (typeof input.setup !== "undefined") data.setupType = toText(input.setup);
  if (typeof input.attendance !== "undefined") data.attendance = parseOptionalAttendance(input.attendance);
  if (typeof input.meal !== "undefined") data.mealPeriod = parseMeal(input.meal);
  if (typeof input.avNeeds !== "undefined") data.avNeeds = toText(input.avNeeds);
  if (typeof input.notes !== "undefined") data.notes = toText(input.notes);
  if (typeof input.sortOrder !== "undefined") data.sortOrder = parseSortOrder(input.sortOrder);

  if (Object.keys(data).length === 0) {
    throw new MatrixError("At least one editable field is required", 400);
  }

  const fmtTime = (d: Date | null) => (d ? d.toISOString().slice(11, 16) : null);
  const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const auditUpdate = async (updated: {
    id: string;
    sessionName: string | null;
    roomName: string | null;
    setupType: string | null;
    dayDate: Date | null;
    startTime: Date | null;
    endTime: Date | null;
  }) => {
    const changes = [
      existing.sessionName !== updated.sessionName
        ? { field: "sessionName", label: "Session", from: existing.sessionName, to: updated.sessionName }
        : null,
      existing.roomName !== updated.roomName
        ? { field: "room", label: "Room", from: existing.roomName, to: updated.roomName }
        : null,
      existing.setupType !== updated.setupType
        ? { field: "setup", label: "Setup", from: existing.setupType, to: updated.setupType }
        : null,
      fmtDate(existing.dayDate) !== fmtDate(updated.dayDate)
        ? { field: "date", label: "Date", from: fmtDate(existing.dayDate), to: fmtDate(updated.dayDate) }
        : null,
      fmtTime(existing.startTime) !== fmtTime(updated.startTime)
        ? { field: "startTime", label: "Start", from: fmtTime(existing.startTime), to: fmtTime(updated.startTime) }
        : null,
      fmtTime(existing.endTime) !== fmtTime(updated.endTime)
        ? { field: "endTime", label: "End", from: fmtTime(existing.endTime), to: fmtTime(updated.endTime) }
        : null,
    ].filter((c): c is NonNullable<typeof c> => c !== null);
    if (changes.length === 0) return;
    await recordEventActivity(getPrisma(), {
      eventId,
      actor: actor?.id ? { kind: "USER", userId: actor.id } : { kind: "SYSTEM", label: "System" },
      module: "RUN_OF_SHOW",
      action: "UPDATED",
      entityType: "Session",
      entityId: updated.id,
      entityLabel: updated.sessionName ?? "Session",
      message: `Updated session "${updated.sessionName ?? "Session"}"`,
      changes,
    });
  };

  try {
    const updated = await getPrisma().matrixRow.update({
      where: { id: rowId },
      data,
      select: {
        id: true,
        eventId: true,
        dayDate: true,
        startTime: true,
        endTime: true,
        roomId: true,
        roomName: true,
        sessionName: true,
        setupType: true,
        attendance: true,
        mealPeriod: true,
        avNeeds: true,
        notes: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await auditUpdate(updated);
    return rowToRecord(updated);
  } catch (error) {
    if (!isMissingSortOrderColumn(error)) {
      throw error;
    }

    const updated = await getPrisma().matrixRow.update({
      where: { id: rowId },
      data,
      select: {
        id: true,
        eventId: true,
        dayDate: true,
        startTime: true,
        endTime: true,
        roomId: true,
        roomName: true,
        sessionName: true,
        setupType: true,
        attendance: true,
        mealPeriod: true,
        avNeeds: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await auditUpdate(updated);
    return rowToRecord(updated, 0);
  }
}

export async function duplicateMatrixRow(eventId: string, rowId: string, actor?: MatrixAuditActor): Promise<MatrixRowRecord> {
  try {
    return await getPrisma().$transaction(async (tx) => {
      const existing = await tx.matrixRow.findFirst({
        where: { id: rowId, eventId, archivedAt: null },
      });
      if (!existing) {
        throw new MatrixError("Matrix row not found", 404);
      }

      await tx.matrixRow.updateMany({
        where: {
          eventId,
          archivedAt: null,
          sortOrder: {
            gte: existing.sortOrder + 1,
          },
        },
        data: {
          sortOrder: {
            increment: 1,
          },
        },
      });

      const duplicated = await tx.matrixRow.create({
        data: {
          eventId,
          roomId: existing.roomId,
          dayDate: existing.dayDate,
          startTime: existing.startTime,
          endTime: existing.endTime,
          roomName: existing.roomName,
          sessionName: existing.sessionName,
          setupType: existing.setupType,
          attendance: existing.attendance,
          fnbNotes: existing.fnbNotes,
          mealPeriod: existing.mealPeriod,
          avNotes: existing.avNotes,
          avNeeds: existing.avNeeds,
          notes: existing.notes,
          sortOrder: existing.sortOrder + 1,
        },
        select: {
          id: true,
          eventId: true,
          dayDate: true,
          startTime: true,
          endTime: true,
          roomId: true,
          roomName: true,
          sessionName: true,
          setupType: true,
          attendance: true,
          mealPeriod: true,
          avNeeds: true,
          notes: true,
          sortOrder: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await recordEventActivity(tx, {
        eventId,
        actor: actor?.id ? { kind: "USER", userId: actor.id } : { kind: "SYSTEM", label: "System" },
        module: "RUN_OF_SHOW",
        action: "CREATED",
        entityType: "Session",
        entityId: duplicated.id,
        entityLabel: duplicated.sessionName ?? "Session",
        message: `Duplicated session "${duplicated.sessionName ?? "Session"}"`,
      });

      return rowToRecord(duplicated);
    });
  } catch (error) {
    if (!isMissingSortOrderColumn(error)) {
      throw error;
    }

    const existing = await getPrisma().matrixRow.findFirst({
      where: { id: rowId, eventId, archivedAt: null },
    });
    if (!existing) {
      throw new MatrixError("Matrix row not found", 404);
    }

    const duplicated = await getPrisma().matrixRow.create({
      data: {
        eventId,
        roomId: existing.roomId,
        dayDate: existing.dayDate,
        startTime: existing.startTime,
        endTime: existing.endTime,
        roomName: existing.roomName,
        sessionName: existing.sessionName,
        setupType: existing.setupType,
        attendance: existing.attendance,
        fnbNotes: existing.fnbNotes,
        mealPeriod: existing.mealPeriod,
        avNotes: existing.avNotes,
        avNeeds: existing.avNeeds,
        notes: existing.notes,
      },
      select: {
        id: true,
        eventId: true,
        dayDate: true,
        startTime: true,
        endTime: true,
        roomId: true,
        roomName: true,
        sessionName: true,
        setupType: true,
        attendance: true,
        mealPeriod: true,
        avNeeds: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return rowToRecord(duplicated, 0);
  }
}

export async function deleteMatrixRow(eventId: string, rowId: string, actor?: MatrixAuditActor): Promise<void> {
  const existing = await getPrisma().matrixRow.findFirst({
    where: { id: rowId, eventId, archivedAt: null },
    select: { id: true, sessionName: true },
  });
  if (!existing) {
    throw new MatrixError("Matrix row not found", 404);
  }

  await getPrisma().$transaction(async (tx) => {
    await tx.matrixRow.update({ where: { id: rowId }, data: { archivedAt: new Date() } });
    await recordEventActivity(tx, {
      eventId,
      actor: actor?.id ? { kind: "USER", userId: actor.id } : { kind: "SYSTEM", label: "System" },
      module: "RUN_OF_SHOW",
      action: "STATUS_CHANGED",
      entityType: "Session",
      entityId: existing.id,
      entityLabel: existing.sessionName ?? "Session",
      message: `Archived session "${existing.sessionName ?? "Session"}"`,
    });
  });
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function exportMatrixRowsCsv(eventId: string, filter?: MatrixFilter): Promise<{
  filename: string;
  csv: string;
}> {
  const payload = await listMatrixRows(eventId, filter);
  const selectedDate = filter?.date?.trim() && filter.date.trim().toLowerCase() !== "all" ? filter.date.trim() : "all";
  const todayStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `matrix_${payload.event.slug || payload.event.id}_${selectedDate}_${todayStamp}.csv`;

  const header = ["Date", "Start", "End", "Room", "Session Name", "Setup", "Attendance", "Meal", "AV Needs", "Notes"];
  const lines = [header.join(",")];

  for (const row of payload.rows) {
    lines.push(
      [
        row.date,
        row.startTime,
        row.endTime,
        row.room,
        row.sessionName,
        row.setup,
        row.attendance === null ? "" : String(row.attendance),
        row.meal,
        row.avNeeds,
        row.notes,
      ]
        .map((value) => csvEscape(value))
        .join(","),
    );
  }

  return {
    filename,
    csv: lines.join("\n"),
  };
}

// --- Section-level Run of Show import (bulk) -------------------------------

/** One already-validated import row, ready for the bulk create. */
export type MatrixImportInputRow = {
  sessionName: string;
  /** ISO `YYYY-MM-DD`. */
  dayDateIso: string;
  /** 24h `HH:MM`. */
  startTime: string;
  /** 24h `HH:MM`. */
  endTime: string;
  roomName: string | null;
  setupType: string | null;
  avNeeds: string | null;
  attendance: number | null;
  supplies?: MatrixImportOperationalRequirement[];
  signage?: MatrixImportOperationalRequirement[];
  /** Composed notes (structured Speakers:/Staff:/F&B:/Status: lines + plain). */
  notes: string;
};

export type ImportMatrixRowsResult = {
  importedCount: number;
  duplicateCount: number;
  replayed: boolean;
};

const MATRIX_IMPORT_CHUNK_SIZE = 500;

function importIsoDateToDate(iso: string): Date {
  const trimmed = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new MatrixError("date must be YYYY-MM-DD", 400);
  }
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new MatrixError("date must be a valid date", 400);
  }
  return parsed;
}

function importTimeToDate(value: string, fieldName: string): Date {
  const trimmed = value.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) {
    throw new MatrixError(`${fieldName} must be HH:mm`, 400);
  }
  const [hoursString, minutesString] = trimmed.split(":");
  const hours = Number(hoursString);
  const minutes = Number(minutesString);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new MatrixError(`${fieldName} must be HH:mm`, 400);
  }
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));
}

/**
 * Normalize already-validated import rows into Prisma createMany inputs. Pure and
 * synchronous: all normalization happens before any DB round-trip. `eventId` is
 * stamped here (server-side, never trusting the client) and `sortOrder` is
 * contiguous from `baseSortOrder`. No related records are created or linked.
 */
export function buildMatrixImportCreateData(
  eventId: string,
  rows: MatrixImportInputRow[],
  baseSortOrder: number,
): Prisma.MatrixRowCreateManyInput[] {
  return rows.map((row, index) => {
    const sessionName = row.sessionName.trim();
    if (!sessionName) {
      throw new MatrixError("sessionName is required", 400);
    }
    const attendance =
      row.attendance === null || row.attendance === undefined
        ? null
        : (() => {
            if (!Number.isInteger(row.attendance) || row.attendance < 0) {
              throw new MatrixError("attendance must be an integer >= 0", 400);
            }
            return row.attendance;
          })();

    return {
      eventId,
      dayDate: importIsoDateToDate(row.dayDateIso),
      startTime: importTimeToDate(row.startTime, "startTime"),
      endTime: importTimeToDate(row.endTime, "endTime"),
      roomName: row.roomName?.trim() ? row.roomName.trim() : null,
      sessionName,
      setupType: row.setupType?.trim() ? row.setupType.trim() : null,
      attendance,
      attendanceSource: attendance === null ? null : "IMPORTED",
      avNeeds: row.avNeeds?.trim() ? row.avNeeds.trim() : null,
      notes: row.notes.trim() ? row.notes.trim() : null,
      sortOrder: baseSortOrder + index + 1,
    };
  });
}

/**
 * Bulk-import Run of Show rows in one scoped operation.
 *
 * - Asserts event write access once up front (EVENT_VIEWER -> 403).
 * - Stamps eventId server-side and assigns sortOrder after the current max.
 * - Uses chunked `createMany` (one SQL statement per chunk) instead of one
 *   create() per row, mirroring the Budget/Timeline importers.
 * - Never creates or links related records (speakers, AV, F&B, staff, rooms).
 */
export async function importMatrixRows(
  eventId: string,
  user: EventAccessUser,
  inputRows: MatrixImportInputRow[],
  idempotencyKey: string,
): Promise<ImportMatrixRowsResult> {
  await assertMatrixEventAccess(eventId, user, "write");

  if (inputRows.length === 0) {
    throw new MatrixError("At least one row is required for import", 400);
  }

  const normalizedIdempotencyKey = idempotencyKey.trim();
  if (!normalizedIdempotencyKey || normalizedIdempotencyKey.length > 200) {
    throw new MatrixError("A valid idempotencyKey is required", 400);
  }

  await getEventOrThrow(eventId);
  const payloadHash = createHash("sha256").update(JSON.stringify(inputRows)).digest("hex");

  try {
    return await getPrisma().$transaction(async (tx) => {
      const existingBatch = await tx.matrixImportBatch.findUnique({
        where: {
          eventId_requestedByUserId_idempotencyKey: {
            eventId,
            requestedByUserId: user.id,
            idempotencyKey: normalizedIdempotencyKey,
          },
        },
      });
      if (existingBatch) {
        if (existingBatch.payloadHash !== payloadHash) {
          throw new MatrixError("This idempotencyKey was already used for a different import payload", 409);
        }
        return {
          importedCount: existingBatch.importedCount,
          duplicateCount: existingBatch.duplicateCount,
          replayed: true,
        };
      }

      // Claim the retry key inside the same transaction as every inserted row.
      // A failed transaction leaves no claim, so a corrected retry can proceed.
      await tx.matrixImportBatch.create({
        data: {
          eventId,
          requestedByUserId: user.id,
          idempotencyKey: normalizedIdempotencyKey,
          payloadHash,
          importedCount: 0,
          duplicateCount: 0,
        },
      });

      const existingRows = await tx.matrixRow.findMany({
        where: { eventId, archivedAt: null },
        select: { sessionName: true, dayDate: true, startTime: true, endTime: true, roomName: true },
      });
      const fingerprints = new Set(existingRows.map((row) => matrixImportRowFingerprint({
        sessionName: row.sessionName ?? "",
        dayDateIso: formatDate(row.dayDate),
        startTime: formatTime(row.startTime),
        endTime: formatTime(row.endTime),
        roomName: row.roomName,
      })));
      const uniqueRows: MatrixImportInputRow[] = [];
      for (const row of inputRows) {
        const fingerprint = matrixImportRowFingerprint(row);
        if (fingerprints.has(fingerprint)) continue;
        fingerprints.add(fingerprint);
        uniqueRows.push(row);
      }
      const duplicateCount = inputRows.length - uniqueRows.length;

      const maxOrder = await tx.matrixRow.aggregate({
        where: { eventId },
        _max: { sortOrder: true },
      });
      const data = buildMatrixImportCreateData(eventId, uniqueRows, maxOrder._max.sortOrder ?? 0)
        .map((row) => ({ ...row, id: randomUUID() }));
      let importedCount = 0;
      for (let offset = 0; offset < data.length; offset += MATRIX_IMPORT_CHUNK_SIZE) {
        const result = await tx.matrixRow.createMany({
          data: data.slice(offset, offset + MATRIX_IMPORT_CHUNK_SIZE),
        });
        importedCount += result.count;
      }

      if (data.length > 0 && uniqueRows.some((row) => (row.supplies?.length ?? 0) > 0 || (row.signage?.length ?? 0) > 0)) {
        const template = await ensureEventSessionRequirementTemplateTx(tx, eventId);
        const sectionByType = new Map(template.sections.map((section) => [section.type, section]));
        const itemCache = new Map<string, { id: string; hasQuantity: boolean }>();
        for (const section of template.sections) {
          for (const item of section.items) {
            itemCache.set(`${section.type}:${item.label.trim().toLowerCase()}`, item);
            itemCache.set(`${section.type}:${item.key.trim().toLowerCase()}`, item);
          }
        }
        const selections: Prisma.SessionRequirementSelectionCreateManyInput[] = [];
        for (const [index, row] of uniqueRows.entries()) {
          for (const [type, requirements] of [["SUPPLIES", row.supplies ?? []], ["SIGNAGE", row.signage ?? []]] as const) {
            const section = sectionByType.get(type);
            if (!section) throw new MatrixError(`${type === "SUPPLIES" ? "Supplies" : "Signage"} catalog is unavailable`, 409);
            for (const requirement of requirements) {
              const cacheKey = `${type}:${requirement.label.trim().toLowerCase()}`;
              let item = itemCache.get(cacheKey);
              if (!item) {
                const created = await tx.sessionRequirementItem.create({
                  data: {
                    sectionId: section.id,
                    key: `${slugify(requirement.label)}-${createHash("sha1").update(requirement.label.toLowerCase()).digest("hex").slice(0, 8)}`,
                    label: requirement.label.trim(),
                    active: true,
                    hasQuantity: requirement.quantity !== null,
                    sortOrder: section.items.length + itemCache.size,
                  },
                  select: { id: true, hasQuantity: true },
                });
                item = created;
                itemCache.set(cacheKey, created);
              }
              selections.push({
                sessionId: data[index]!.id!,
                itemId: item.id,
                quantity: item.hasQuantity ? requirement.quantity ?? 1 : null,
              });
            }
          }
        }
        if (selections.length > 0) {
          await tx.sessionRequirementSelection.createMany({ data: selections, skipDuplicates: true });
        }
      }

      await recordEventActivity(tx, {
        eventId,
        actor: { kind: "USER", userId: user.id },
        module: "RUN_OF_SHOW",
        action: "IMPORTED",
        entityType: "Session",
        entityLabel: "Run of Show import",
        message: `Imported ${importedCount} session${importedCount === 1 ? "" : "s"}${duplicateCount > 0 ? `; skipped ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}` : ""}`,
      });
      await tx.matrixImportBatch.update({
        where: {
          eventId_requestedByUserId_idempotencyKey: {
            eventId,
            requestedByUserId: user.id,
            idempotencyKey: normalizedIdempotencyKey,
          },
        },
        data: { importedCount, duplicateCount, completedAt: new Date() },
      });
      return { importedCount, duplicateCount, replayed: false };
    }, { timeout: 30_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
      const batch = await getPrisma().matrixImportBatch.findUnique({
        where: {
          eventId_requestedByUserId_idempotencyKey: {
            eventId,
            requestedByUserId: user.id,
            idempotencyKey: normalizedIdempotencyKey,
          },
        },
      });
      if (batch?.payloadHash === payloadHash) {
        return { importedCount: batch.importedCount, duplicateCount: batch.duplicateCount, replayed: true };
      }
      throw new MatrixError("Import retry is already being processed; retry with the same file", 409);
    }
    throw error;
  }
}
