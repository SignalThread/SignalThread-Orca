import { Prisma, type EventActivityAction, type SeatingAssignment, type SeatingAttendee, type SeatingPlan, type SeatingTable } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { recordEventActivity } from "@/src/server/services/event-activity";

async function recordSeatingActivity(
  db: Prisma.TransactionClient,
  args: {
    eventId: string;
    actorUserId?: string | null;
    action: EventActivityAction;
    entityType: string;
    entityId?: string;
    entityLabel: string;
    message: string;
  },
): Promise<void> {
  await recordEventActivity(db, {
    eventId: args.eventId,
    actor: args.actorUserId ? { kind: "USER", userId: args.actorUserId } : { kind: "SYSTEM", label: "System" },
    module: "RUN_OF_SHOW",
    action: args.action,
    entityType: args.entityType,
    entityId: args.entityId,
    entityLabel: args.entityLabel,
    message: args.message,
  });
}

export class SeatingError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type SeatingSnapshot = {
  seatingPlanId: string | null;
  tables: Array<
    Pick<SeatingTable, "id" | "eventId" | "seatingPlanId" | "name" | "capacity" | "sortOrder"> & {
      assignedCount: number;
      utilizationPercent: number;
      isFull: boolean;
    }
  >;
  attendees: Array<Pick<SeatingAttendee, "id" | "eventId" | "eventAttendeeId" | "firstName" | "lastName" | "company" | "email">>;
  assignments: Array<
    Pick<SeatingAssignment, "id" | "eventId" | "tableId" | "attendeeId" | "seatingPlanId" | "seatIndex" | "createdAt">
  >;
};

export type SeatingSnapshotScope = Readonly<{
  matrixRowId?: string | null;
  seatingPlanId?: string | null;
}>;

export type SeatingWriteScope = SeatingSnapshotScope & Readonly<{
  requireScopedContext?: boolean;
  /** Authenticated actor for the canonical audit entry (null → system). */
  actorUserId?: string | null;
}>;

type MatrixRowSeatingSeed = Readonly<{
  id: string;
  sessionName: string | null;
  roomName: string | null;
  dayDate: Date;
  startTime: Date | null;
  sortOrder: number;
}>;

type SeatingTableSeedTemplate = Readonly<{
  name: string;
  capacity: number;
  sortOrder: number;
}>;

function assertPositiveInt(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new SeatingError(`${field} must be a positive integer`, 400);
  }
  return parsed;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value === "undefined") return null;
  const normalized = String(value).trim();
  return normalized.length === 0 ? null : normalized;
}

function normalizeRequiredString(value: unknown, field: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new SeatingError(`${field} is required`, 400);
  }
  return normalized;
}

function normalizeComparableString(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 ? null : normalized;
}

function normalizeComparableEmail(value: string | null | undefined): string | null {
  return normalizeComparableString(value);
}

type CanonicalSeatingAttendeeSeed = Readonly<{
  eventAttendeeId: string;
  firstName: string;
  lastName: string;
  company: string | null;
  email: string | null;
}>;

type ExistingSeatingAttendeeSeed = Readonly<
  Pick<SeatingAttendee, "id" | "eventId" | "firstName" | "lastName" | "company" | "email"> & {
    eventAttendeeId: string | null;
  }
>;

function deriveCanonicalSeatingAttendeeSeed(attendee: {
  id: string;
  person: {
    firstName: string | null;
    lastName: string | null;
    displayName: string;
    company: string | null;
    email: string | null;
  };
}): CanonicalSeatingAttendeeSeed {
  const displayNameParts = attendee.person.displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const fallbackFirstName = displayNameParts[0] ?? "Guest";
  const fallbackLastName = displayNameParts.slice(1).join(" ") || "Attendee";

  return {
    eventAttendeeId: attendee.id,
    firstName: attendee.person.firstName?.trim() || fallbackFirstName,
    lastName: attendee.person.lastName?.trim() || fallbackLastName,
    company: normalizeOptionalString(attendee.person.company),
    email: normalizeOptionalString(attendee.person.email),
  };
}

function seatingAttendeeNeedsSync(
  existing: ExistingSeatingAttendeeSeed,
  canonical: CanonicalSeatingAttendeeSeed,
): boolean {
  return (
    existing.eventAttendeeId !== canonical.eventAttendeeId ||
    existing.firstName !== canonical.firstName ||
    existing.lastName !== canonical.lastName ||
    (existing.company ?? null) !== canonical.company ||
    (existing.email ?? null) !== canonical.email
  );
}

function findLegacySeatingAttendeeMatch(
  canonical: CanonicalSeatingAttendeeSeed,
  availableLegacyAttendees: ExistingSeatingAttendeeSeed[],
): ExistingSeatingAttendeeSeed | null {
  const canonicalEmail = normalizeComparableEmail(canonical.email);
  if (canonicalEmail) {
    const emailMatch = availableLegacyAttendees.find(
      (attendee) => normalizeComparableEmail(attendee.email) === canonicalEmail,
    );
    if (emailMatch) return emailMatch;
  }

  const canonicalFirstName = normalizeComparableString(canonical.firstName);
  const canonicalLastName = normalizeComparableString(canonical.lastName);
  const canonicalCompany = normalizeComparableString(canonical.company);
  if (!canonicalFirstName || !canonicalLastName) return null;

  return (
    availableLegacyAttendees.find((attendee) => {
      return (
        normalizeComparableString(attendee.firstName) === canonicalFirstName &&
        normalizeComparableString(attendee.lastName) === canonicalLastName &&
        normalizeComparableString(attendee.company) === canonicalCompany
      );
    }) ?? null
  );
}

async function syncEventAttendeesIntoSeating(eventId: string): Promise<void> {
  const db = getPrisma();
  const [eventAttendees, seatingAttendees] = await Promise.all([
    db.eventAttendee.findMany({
      where: { eventId },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        person: {
          select: {
            firstName: true,
            lastName: true,
            displayName: true,
            company: true,
            email: true,
          },
        },
      },
    }),
    db.seatingAttendee.findMany({
      where: { eventId },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        eventId: true,
        eventAttendeeId: true,
        firstName: true,
        lastName: true,
        company: true,
        email: true,
      },
    }),
  ]);

  const seatingByEventAttendeeId = new Map<string, ExistingSeatingAttendeeSeed>();
  const availableLegacyAttendees: ExistingSeatingAttendeeSeed[] = [];

  for (const attendee of seatingAttendees) {
    if (attendee.eventAttendeeId) {
      seatingByEventAttendeeId.set(attendee.eventAttendeeId, attendee);
    } else {
      availableLegacyAttendees.push(attendee);
    }
  }

  const updates: Array<{ id: string; data: Prisma.SeatingAttendeeUpdateInput }> = [];
  const creates: Prisma.SeatingAttendeeCreateManyInput[] = [];

  for (const attendee of eventAttendees) {
    const canonical = deriveCanonicalSeatingAttendeeSeed(attendee);
    const linkedAttendee = seatingByEventAttendeeId.get(attendee.id);
    if (linkedAttendee) {
      if (seatingAttendeeNeedsSync(linkedAttendee, canonical)) {
        updates.push({
          id: linkedAttendee.id,
          data: {
            eventAttendee: { connect: { id: canonical.eventAttendeeId } },
            firstName: canonical.firstName,
            lastName: canonical.lastName,
            company: canonical.company,
            email: canonical.email,
          },
        });
      }
      continue;
    }

    const legacyMatch = findLegacySeatingAttendeeMatch(canonical, availableLegacyAttendees);
    if (legacyMatch) {
      const legacyIndex = availableLegacyAttendees.findIndex((candidate) => candidate.id === legacyMatch.id);
      if (legacyIndex >= 0) {
        availableLegacyAttendees.splice(legacyIndex, 1);
      }
      updates.push({
        id: legacyMatch.id,
        data: {
          eventAttendee: { connect: { id: canonical.eventAttendeeId } },
          firstName: canonical.firstName,
          lastName: canonical.lastName,
          company: canonical.company,
          email: canonical.email,
        },
      });
      continue;
    }

    creates.push({
      eventId,
      eventAttendeeId: canonical.eventAttendeeId,
      firstName: canonical.firstName,
      lastName: canonical.lastName,
      company: canonical.company,
      email: canonical.email,
    });
  }

  if (updates.length === 0 && creates.length === 0) {
    return;
  }

  await db.$transaction(
    async (tx) => {
      for (const update of updates) {
        await tx.seatingAttendee.update({
          where: { id: update.id },
          data: update.data,
        });
      }

      if (creates.length > 0) {
        await tx.seatingAttendee.createMany({
          data: creates,
          skipDuplicates: true,
        });
      }
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

async function ensureEvent(eventId: string): Promise<void> {
  const event = await getPrisma().event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) {
    throw new SeatingError("Event not found", 404);
  }
}

function formatMatrixRowTimeLabel(value: Date | null): string | null {
  if (!value) return null;
  const hours24 = value.getUTCHours();
  const minutes = value.getUTCMinutes();
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function seatingPlanTableNamePrefix(matrixRow: MatrixRowSeatingSeed): string {
  const roomName = matrixRow.roomName?.trim();
  const sessionName = matrixRow.sessionName?.trim();
  const timeLabel = formatMatrixRowTimeLabel(matrixRow.startTime);
  return [roomName, sessionName, timeLabel].filter(Boolean).join(" — ") || `Session ${matrixRow.sortOrder + 1}`;
}

function scopedSeatingTableName(matrixRow: MatrixRowSeatingSeed, tableName: string, index: number): string {
  const prefix = seatingPlanTableNamePrefix(matrixRow);
  const normalized = tableName.trim() || `Table ${index + 1}`;
  return normalized.startsWith(prefix) ? normalized : `${prefix} ${normalized}`;
}

function defaultScopedSeatingTableTemplates(matrixRow: MatrixRowSeatingSeed): SeatingTableSeedTemplate[] {
  const prefix = seatingPlanTableNamePrefix(matrixRow);
  return Array.from({ length: 6 }, (_, index) => ({
    name: `${prefix} Table ${index + 1}`,
    capacity: 10,
    sortOrder: index + 1,
  }));
}

function buildScopedSeatingTableTemplates(
  matrixRow: MatrixRowSeatingSeed,
  eventWideTables: readonly SeatingTableSeedTemplate[],
): SeatingTableSeedTemplate[] {
  if (eventWideTables.length === 0) return defaultScopedSeatingTableTemplates(matrixRow);
  return eventWideTables.map((table, index) => ({
    name: scopedSeatingTableName(matrixRow, table.name, index),
    capacity: table.capacity,
    sortOrder: table.sortOrder,
  }));
}

function tablesMatchLegacyEventWideSeed(
  scopedTables: readonly SeatingTableSeedTemplate[],
  eventWideTables: readonly SeatingTableSeedTemplate[],
): boolean {
  if (scopedTables.length === 0 || scopedTables.length !== eventWideTables.length) return false;
  return scopedTables.every((table, index) => {
    const template = eventWideTables[index];
    return (
      template != null &&
      table.name === template.name &&
      table.capacity === template.capacity &&
      table.sortOrder === template.sortOrder
    );
  });
}

async function ensureSeatingPlanForMatrixRow(eventId: string, matrixRowId: string): Promise<SeatingPlan> {
  const db = getPrisma();
  const matrixRow = await db.matrixRow.findFirst({
    where: { id: matrixRowId, eventId },
    select: { id: true, sessionName: true, roomName: true, dayDate: true, startTime: true, sortOrder: true },
  });
  if (!matrixRow) {
    throw new SeatingError("Matrix row not found", 404);
  }

  return db.$transaction(async (tx) => {
    const existingPlan = await tx.seatingPlan.findUnique({
      where: { matrixRowId },
    });

    const plan =
      existingPlan ??
      (await tx.seatingPlan.create({
        data: {
          eventId,
          matrixRowId,
          name: `${matrixRow.roomName ?? "Room"} — ${matrixRow.sessionName ?? "Seating plan"}`,
        },
      }));

    const eventWideTables = await tx.seatingTable.findMany({
      where: { eventId, seatingPlanId: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { name: true, capacity: true, sortOrder: true },
    });
    const scopedTables = await tx.seatingTable.findMany({
      where: { eventId, seatingPlanId: plan.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, capacity: true, sortOrder: true },
    });

    if (scopedTables.length === 0) {
      const tableTemplates = buildScopedSeatingTableTemplates(matrixRow, eventWideTables);
      await tx.seatingTable.createMany({
        data: tableTemplates.map((table) => ({
          eventId,
          seatingPlanId: plan.id,
          name: table.name,
          capacity: table.capacity,
          sortOrder: table.sortOrder,
        })),
      });
    } else if (tablesMatchLegacyEventWideSeed(scopedTables, eventWideTables)) {
      const tableTemplates = buildScopedSeatingTableTemplates(matrixRow, eventWideTables);
      await Promise.all(
        scopedTables.map((table, index) =>
          tx.seatingTable.update({
            where: { id: table.id },
            data: { name: tableTemplates[index]?.name ?? table.name },
          }),
        ),
      );
    }

    return plan;
  });
}

async function resolveSeatingSnapshotPlanId(eventId: string, scope?: SeatingSnapshotScope): Promise<string | null> {
  const matrixRowId = scope?.matrixRowId?.trim();
  const seatingPlanId = scope?.seatingPlanId?.trim();

  if (seatingPlanId) {
    const plan = await getPrisma().seatingPlan.findFirst({
      where: { id: seatingPlanId, eventId },
      select: { id: true },
    });
    if (!plan) {
      throw new SeatingError("Seating plan not found", 404);
    }
    return plan.id;
  }

  if (matrixRowId) {
    const plan = await ensureSeatingPlanForMatrixRow(eventId, matrixRowId);
    return plan.id;
  }

  return null;
}

async function resolveSeatingWritePlanId(eventId: string, scope?: SeatingWriteScope): Promise<string | null> {
  const matrixRowId = scope?.matrixRowId?.trim();
  const seatingPlanId = scope?.seatingPlanId?.trim();

  if (scope?.requireScopedContext && !matrixRowId && !seatingPlanId) {
    throw new SeatingError("Seating context is required for scoped seating writes", 400);
  }

  if (seatingPlanId) {
    const plan = await getPrisma().seatingPlan.findFirst({
      where: { id: seatingPlanId, eventId },
      select: { id: true, matrixRowId: true },
    });
    if (!plan) {
      throw new SeatingError("Seating plan not found", 404);
    }
    if (matrixRowId && plan.matrixRowId !== matrixRowId) {
      throw new SeatingError("Seating context does not match the seating plan", 400);
    }
    return plan.id;
  }

  if (matrixRowId) {
    const plan = await ensureSeatingPlanForMatrixRow(eventId, matrixRowId);
    return plan.id;
  }

  return null;
}

export async function getSeatingSnapshot(eventId: string, scope?: SeatingSnapshotScope): Promise<SeatingSnapshot> {
  await ensureEvent(eventId);
  await syncEventAttendeesIntoSeating(eventId);
  const seatingPlanId = await resolveSeatingSnapshotPlanId(eventId, scope);

  const tables = await getPrisma().seatingTable.findMany({
    where: { eventId, seatingPlanId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, eventId: true, seatingPlanId: true, name: true, capacity: true, sortOrder: true },
  });
  const tableIds = tables.map((table) => table.id);

  const attendeesPromise = getPrisma().seatingAttendee.findMany({
    where: { eventId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { createdAt: "asc" }],
    select: { id: true, eventId: true, eventAttendeeId: true, firstName: true, lastName: true, company: true, email: true },
  });
  const assignmentsPromise = tableIds.length
    ? getPrisma().seatingAssignment.findMany({
        where: { eventId, tableId: { in: tableIds } },
        select: {
          id: true,
          eventId: true,
          tableId: true,
          attendeeId: true,
          seatingPlanId: true,
          seatIndex: true,
          createdAt: true,
        },
      })
    : Promise.resolve([]);

  const [attendees, assignments] = await Promise.all([
    attendeesPromise,
    assignmentsPromise,
  ]);

  const assignedCountByTableId = new Map<string, number>();
  for (const assignment of assignments) {
    assignedCountByTableId.set(assignment.tableId, (assignedCountByTableId.get(assignment.tableId) ?? 0) + 1);
  }

  return {
    seatingPlanId,
    tables: tables.map((table) => {
      const assignedCount = assignedCountByTableId.get(table.id) ?? 0;
      const utilizationPercent = table.capacity <= 0 ? 0 : Math.round((assignedCount / table.capacity) * 100);
      return {
        ...table,
        assignedCount,
        utilizationPercent,
        isFull: assignedCount >= table.capacity,
      };
    }),
    attendees,
    assignments,
  };
}

export async function createSeatingTable(eventId: string, name: unknown, capacity: unknown, actorUserId?: string | null): Promise<SeatingTable> {
  const normalizedName = normalizeRequiredString(name, "name");

  const normalizedCapacity = assertPositiveInt(capacity, "capacity");
  await ensureEvent(eventId);

  const maxSortOrder = await getPrisma().seatingTable.aggregate({
    where: { eventId },
    _max: { sortOrder: true },
  });

  return getPrisma().$transaction(async (tx) => {
    const table = await tx.seatingTable.create({
      data: {
        eventId,
        name: normalizedName,
        capacity: normalizedCapacity,
        sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
      },
    });
    await recordSeatingActivity(tx, {
      eventId,
      actorUserId,
      action: "CREATED",
      entityType: "SeatingTable",
      entityId: table.id,
      entityLabel: table.name,
      message: `Created seating table "${table.name}" (capacity ${table.capacity})`,
    });
    return table;
  });
}

export async function createSeatingAttendee(
  eventId: string,
  input: {
    firstName: unknown;
    lastName: unknown;
    company?: unknown;
    email?: unknown;
  },
): Promise<SeatingAttendee> {
  const firstName = normalizeRequiredString(input.firstName, "firstName");
  const lastName = normalizeRequiredString(input.lastName, "lastName");
  const company = normalizeOptionalString(input.company);
  const email = normalizeOptionalString(input.email);

  if (email && !email.includes("@")) {
    throw new SeatingError("email must be a valid email address", 400);
  }

  await ensureEvent(eventId);

  return getPrisma().seatingAttendee.create({
    data: {
      eventId,
      firstName,
      lastName,
      company,
      email,
    },
  });
}

export type UpdateSeatingTableInput = {
  name?: unknown;
  capacity?: unknown;
  sortOrder?: unknown;
};

export async function updateSeatingTable(
  eventId: string,
  tableId: string,
  input: UpdateSeatingTableInput,
): Promise<SeatingTable> {
  const existing = await getPrisma().seatingTable.findFirst({
    where: { id: tableId, eventId },
    include: { _count: { select: { assignments: true } } },
  });

  if (!existing) {
    throw new SeatingError("Table not found", 404);
  }

  const data: Prisma.SeatingTableUpdateInput = {};

  if (typeof input.name !== "undefined") {
    const normalizedName = normalizeOptionalString(input.name);
    if (!normalizedName) {
      throw new SeatingError("name must be a non-empty string", 400);
    }
    data.name = normalizedName;
  }

  if (typeof input.capacity !== "undefined") {
    const normalizedCapacity = assertPositiveInt(input.capacity, "capacity");
    if (normalizedCapacity < existing._count.assignments) {
      throw new SeatingError("capacity cannot be less than assigned attendees", 400);
    }
    data.capacity = normalizedCapacity;
  }

  if (typeof input.sortOrder !== "undefined") {
    const normalizedSortOrder = Number(input.sortOrder);
    if (!Number.isInteger(normalizedSortOrder) || normalizedSortOrder < 0) {
      throw new SeatingError("sortOrder must be an integer >= 0", 400);
    }
    data.sortOrder = normalizedSortOrder;
  }

  if (Object.keys(data).length === 0) {
    throw new SeatingError("At least one field is required", 400);
  }

  return getPrisma().seatingTable.update({
    where: { id: tableId },
    data,
  });
}

export async function deleteSeatingTable(eventId: string, tableId: string, actorUserId?: string | null): Promise<void> {
  const existing = await getPrisma().seatingTable.findFirst({ where: { id: tableId, eventId }, select: { id: true, name: true } });
  if (!existing) {
    throw new SeatingError("Table not found", 404);
  }

  await getPrisma().$transaction(async (tx) => {
    await tx.seatingAssignment.deleteMany({ where: { eventId, tableId } });
    await tx.seatingTable.delete({ where: { id: tableId } });
    await recordSeatingActivity(tx, {
      eventId,
      actorUserId,
      action: "DELETED",
      entityType: "SeatingTable",
      entityId: existing.id,
      entityLabel: existing.name,
      message: `Deleted seating table "${existing.name}"`,
    });
  });
}

function normalizeSeatIndex(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new SeatingError("seatIndex must be a non-negative integer", 400);
  }
  return parsed;
}

async function resolveSeatingAttendeeIdForWrite(
  tx: Prisma.TransactionClient,
  eventId: string,
  attendeeId: string,
): Promise<string> {
  const seatingAttendee = await tx.seatingAttendee.findFirst({
    where: { id: attendeeId, eventId },
    select: { id: true },
  });
  if (seatingAttendee) return seatingAttendee.id;

  const bridgedAttendee = await tx.seatingAttendee.findFirst({
    where: { eventId, eventAttendeeId: attendeeId },
    select: { id: true },
  });
  if (bridgedAttendee) return bridgedAttendee.id;

  throw new SeatingError("Attendee not found", 404);
}

export async function assignAttendeeToTable(
  eventId: string,
  attendeeId: string,
  tableId: string,
  seatIndexInput?: unknown,
  scope?: SeatingWriteScope,
): Promise<SeatingAssignment> {
  if (!attendeeId || !tableId) {
    throw new SeatingError("attendeeId and tableId are required", 400);
  }
  await syncEventAttendeesIntoSeating(eventId);
  const seatIndex = normalizeSeatIndex(seatIndexInput);
  const seatingPlanId = await resolveSeatingWritePlanId(eventId, scope);

  return getPrisma().$transaction(
    async (tx) => {
      const [resolvedAttendeeId, table] = await Promise.all([
        resolveSeatingAttendeeIdForWrite(tx, eventId, attendeeId),
        tx.seatingTable.findFirst({
          where: { id: tableId, eventId },
          select: { id: true, capacity: true, seatingPlanId: true, name: true },
        }),
      ]);

      if (!table) {
        throw new SeatingError("Table not found", 404);
      }

      if (table.seatingPlanId !== seatingPlanId) {
        throw new SeatingError("Table does not belong to the active seating context", 400);
      }

      const existingAssignment = await tx.seatingAssignment.findFirst({
        where: {
          eventId,
          attendeeId: resolvedAttendeeId,
          seatingPlanId,
        },
      });

      if (existingAssignment?.tableId === tableId) {
        if (existingAssignment.seatIndex === seatIndex) {
          return existingAssignment;
        }
      }

      if (seatIndex != null && seatIndex >= table.capacity) {
        throw new SeatingError("seatIndex exceeds table capacity", 400);
      }

      const occupiedTargetSeat = seatIndex == null
        ? null
        : await tx.seatingAssignment.findFirst({
            where: {
              eventId,
              seatingPlanId,
              tableId,
              seatIndex,
              NOT: { attendeeId: resolvedAttendeeId },
            },
            select: { id: true },
          });
      if (occupiedTargetSeat) {
        throw new SeatingError("Chair is already occupied", 409);
      }

      const assignedCountExcludingAttendee = await tx.seatingAssignment.count({
        where: {
          eventId,
          seatingPlanId,
          tableId,
          NOT: { attendeeId: resolvedAttendeeId },
        },
      });
      if (assignedCountExcludingAttendee >= table.capacity) {
        throw new SeatingError("Table is at capacity", 409);
      }

      const assignment = existingAssignment
        ? await tx.seatingAssignment.update({
            where: { id: existingAssignment.id },
            data: { tableId, seatIndex },
          })
        : await tx.seatingAssignment.create({
            data: {
              eventId,
              tableId,
              attendeeId: resolvedAttendeeId,
              seatingPlanId,
              seatIndex,
            },
          });

      await recordSeatingActivity(tx, {
        eventId,
        actorUserId: scope?.actorUserId ?? null,
        action: "ASSIGNED",
        entityType: "SeatingAssignment",
        entityId: assignment.id,
        entityLabel: table.name ?? "Table",
        message: `Assigned attendee to table "${table.name ?? "Table"}"${seatIndex != null ? ` (seat ${seatIndex + 1})` : ""}`,
      });

      return assignment;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

export async function unassignAttendee(eventId: string, attendeeId: string, scope?: SeatingWriteScope): Promise<void> {
  if (!attendeeId) {
    throw new SeatingError("attendeeId is required", 400);
  }
  await syncEventAttendeesIntoSeating(eventId);
  const seatingPlanId = await resolveSeatingWritePlanId(eventId, scope);

  await getPrisma().$transaction(async (tx) => {
    const resolvedAttendeeId = await resolveSeatingAttendeeIdForWrite(tx, eventId, attendeeId);
    const removed = await tx.seatingAssignment.deleteMany({
      where: {
        eventId,
        attendeeId: resolvedAttendeeId,
        seatingPlanId,
      },
    });
    if (removed.count > 0) {
      await recordSeatingActivity(tx, {
        eventId,
        actorUserId: scope?.actorUserId ?? null,
        action: "UNASSIGNED",
        entityType: "SeatingAssignment",
        entityId: resolvedAttendeeId,
        entityLabel: "Seating assignment",
        message: "Unassigned attendee from their table",
      });
    }
  });
}
