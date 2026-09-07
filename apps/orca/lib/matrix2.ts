import { ExpectedAttendanceSource, MealPeriod, Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  getEventSessionRequirementTemplate,
  type LinkedBudgetLineItemRecord,
  type SessionRequirementTemplateRecord,
} from "@/lib/session-requirements";

export class Matrix2Error extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type Matrix2PersonRole = "speaker" | "moderator" | "vip" | "staff" | "vendor";

export type Matrix2RoomRecord = {
  id: string;
  name: string;
  capacity: number | null;
};

export type Matrix2PersonRecord = {
  id: string;
  name: string;
  role: Matrix2PersonRole;
  company: string | null;
  email: string | null;
};

export type Matrix2SessionSpeakerRecord = {
  speakerId: string;
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
  status: "NEEDS_INFO" | "INVITED" | "CONFIRMED" | "CANCELLED";
};

export type Matrix2SessionStaffRecord = {
  personId: string;
  name: string;
  role: Matrix2PersonRole;
  assignmentRole: string | null;
  company: string | null;
  email: string | null;
};

export type Matrix2SessionAVRequirementRecord = {
  id: string;
  avType: string;
  quantity: number | null;
};

export type Matrix2SessionFoodServiceRecord = {
  id: string;
  serviceType: string;
  serviceStyle: string | null;
  headcount: number | null;
};

export type Matrix2SessionRecord = {
  id: string;
  rowId: string;
  eventId: string;
  sortOrder: number;
  date: string;
  startTime: string;
  endTime: string;
  roomId: string | null;
  roomName: string;
  title: string;
  includeInOfficialAgenda?: boolean;
  sessionType: string;
  status: string;
  expectedAttendance: number | null;
  expectedAttendanceSource?: ExpectedAttendanceSource | null;
  roomSetup: string;
  roomCapacity: number | null;
  speakers: string[];
  speakerAssignments: Matrix2SessionSpeakerRecord[];
  avRequirements: string[];
  avRequirementsStructured: Matrix2SessionAVRequirementRecord[];
  foodAndBeverage: string[];
  foodService: Matrix2SessionFoodServiceRecord | null;
  staffAssigned: string[];
  staffAssignments: Matrix2SessionStaffRecord[];
  requirementSelections: Array<{
    itemId: string;
    quantity: number | null;
    linkedBudgetLineItem: LinkedBudgetLineItemRecord | null;
  }>;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Matrix2Snapshot = {
  event: {
    id: string;
    name: string;
    startDate: string;
    endDate: string | null;
    timezone: string;
  };
  dates: string[];
  rooms: Matrix2RoomRecord[];
  people: Matrix2PersonRecord[];
  requirementTemplate: SessionRequirementTemplateRecord;
  sessions: Matrix2SessionRecord[];
};

export type Matrix2SnapshotDiagnostics = {
  sectionDurationsMs: Record<string, number>;
  queryGroups: number;
  trackedPrismaCalls: number;
  usedTransaction: boolean;
  rowCount: number;
  roomCount: number;
  peopleCount: number;
};

type Matrix2SnapshotOptions = {
  onDiagnostics?: (diagnostics: Matrix2SnapshotDiagnostics) => void;
};

type Matrix2ParsedNotes = {
  plainNotes: string;
  speakers: string[];
  staffAssigned: string[];
  foodAndBeverage: string[];
  sessionType: string | null;
  roomSetup: string | null;
  status: string | null;
};

type MatrixDbClient = ReturnType<typeof getPrisma> | Prisma.TransactionClient;
type QueryTracker = (label: string) => void;

const PERSON_ROLE_ORDER: Matrix2PersonRole[] = ["speaker", "moderator", "vip", "staff", "vendor"];

const mealToLabel: Record<MealPeriod, string> = {
  NONE: "N/A",
  BREAKFAST: "Breakfast",
  BREAK: "Break",
  LUNCH: "Lunch",
  RECEPTION: "Reception",
  DINNER: "Dinner",
  OTHER: "Other",
};

function mealPeriodToFoodServiceType(mealPeriod: MealPeriod | null): string | null {
  if (!mealPeriod || mealPeriod === MealPeriod.NONE) return null;
  if (mealPeriod === MealPeriod.BREAKFAST) return "Breakfast";
  if (mealPeriod === MealPeriod.BREAK) return "Coffee Break";
  if (mealPeriod === MealPeriod.LUNCH) return "Lunch";
  if (mealPeriod === MealPeriod.RECEPTION) return "Reception";
  if (mealPeriod === MealPeriod.DINNER) return "Dinner";
  return "None";
}

function toPersonRoleLabel(role: string): Matrix2PersonRole {
  const normalized = role.trim().toLowerCase();
  if (normalized === "staff") return "staff";
  if (normalized === "vendor") return "vendor";
  if (normalized === "moderator") return "moderator";
  if (normalized === "vip") return "vip";
  return "speaker";
}

function normalizeRoleInput(role: unknown): Matrix2PersonRole {
  if (typeof role !== "string" || !role.trim()) {
    throw new Matrix2Error("role is required", 400);
  }

  const normalized = role.trim().toLowerCase();
  if (normalized === "speaker") return "speaker";
  if (normalized === "moderator") return "moderator";
  if (normalized === "vip") return "vip";
  if (normalized === "staff") return "staff";
  if (normalized === "vendor") return "vendor";

  throw new Matrix2Error("role must be one of: speaker, moderator, vip, staff, vendor", 400);
}

function toPersistedEventPersonRole(role: Matrix2PersonRole): "SPEAKER" | "STAFF" | "VENDOR" {
  if (role === "speaker") return "SPEAKER";
  if (role === "staff") return "STAFF";
  if (role === "vendor") return "VENDOR";
  throw new Matrix2Error("role must be one of: speaker, staff, vendor", 400);
}

function toOptionalText(value: unknown): string | null {
  if (typeof value === "undefined" || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function formatAvRequirementLabel(avType: string, quantity: number | null): string {
  if (quantity && quantity > 1) {
    return `${avType} (${quantity})`;
  }
  return avType;
}

function parseLegacyAvLabel(value: string): { avType: string; quantity: number | null } {
  const normalized = value.trim();
  const match = normalized.match(/^(.*?)(?:\s*\((\d+)\))$/);
  if (!match) {
    return {
      avType: normalized,
      quantity: null,
    };
  }

  const avType = match[1].trim();
  const quantity = Number(match[2]);
  if (!avType || !Number.isInteger(quantity) || quantity <= 0) {
    return {
      avType: normalized,
      quantity: null,
    };
  }

  return {
    avType,
    quantity,
  };
}

function isMissingSortOrderColumn(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2022" &&
    error.message.includes("sortOrder")
  );
}

function isMissingPeopleAssignmentTable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const message = error.message.toLowerCase();
    return (
      error.code === "P2021" ||
      error.code === "P2010" ||
      (
        error.code === "P2022" &&
        (
          message.includes("eventperson") ||
          message.includes("matrixrowspeaker") ||
          message.includes("matrixrowstaffassignment") ||
          message.includes("sessionspeakerassignment") ||
          message.includes("\"speaker\"")
        )
      ) ||
      message.includes("eventperson") ||
      message.includes("matrixrowspeaker") ||
      message.includes("matrixrowstaffassignment") ||
      message.includes("sessionspeakerassignment") ||
      message.includes("\"speaker\"")
    );
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("eventperson") ||
      message.includes("matrixrowspeaker") ||
      message.includes("matrixrowstaffassignment") ||
      message.includes("sessionspeakerassignment") ||
      message.includes("\"speaker\"")
    );
  }

  return false;
}

function isMissingCanonicalSessionAuthority(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2021" &&
    error.message.includes("SessionStaffAssignment")
  );
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

function normalizeTextList(value: string): string[] {
  return value
    .split(/[\n,;|]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseStructuredNotes(value: string | null): Matrix2ParsedNotes {
  const notes = (value ?? "").trim();
  if (!notes) {
    return {
      plainNotes: "",
      speakers: [],
      staffAssigned: [],
      foodAndBeverage: [],
      sessionType: null,
      roomSetup: null,
      status: null,
    };
  }

  const plainLines: string[] = [];
  const parsed: Matrix2ParsedNotes = {
    plainNotes: "",
    speakers: [],
    staffAssigned: [],
    foodAndBeverage: [],
    sessionType: null,
    roomSetup: null,
    status: null,
  };

  for (const rawLine of notes.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      plainLines.push("");
      continue;
    }

    const speakerMatch = line.match(/^speakers?\s*:\s*(.+)$/i);
    if (speakerMatch) {
      parsed.speakers = normalizeTextList(speakerMatch[1]);
      continue;
    }

    const staffMatch = line.match(/^staff(?:\s+assigned)?\s*:\s*(.+)$/i);
    if (staffMatch) {
      parsed.staffAssigned = normalizeTextList(staffMatch[1]);
      continue;
    }

    const fnbMatch = line.match(/^(?:f&b|fnb|food\s*&\s*beverage|food\s+and\s+beverage)\s*:\s*(.+)$/i);
    if (fnbMatch) {
      parsed.foodAndBeverage = normalizeTextList(fnbMatch[1]);
      continue;
    }

    const typeMatch = line.match(/^session\s*type\s*:\s*(.+)$/i);
    if (typeMatch) {
      parsed.sessionType = typeMatch[1].trim();
      continue;
    }

    const setupMatch = line.match(/^room\s*setup\s*:\s*(.+)$/i);
    if (setupMatch) {
      parsed.roomSetup = setupMatch[1].trim();
      continue;
    }

    const statusMatch = line.match(/^status\s*:\s*(.+)$/i);
    if (statusMatch) {
      parsed.status = statusMatch[1].trim();
      continue;
    }

    plainLines.push(rawLine);
  }

  parsed.plainNotes = plainLines.join("\n").trim();
  return parsed;
}

function inferSessionType(title: string, mealPeriod: MealPeriod | null, notesType: string | null): string {
  if (notesType && notesType.trim()) return notesType.trim();

  const normalized = title.trim().toLowerCase();
  if (!normalized) return "General";
  if (normalized.includes("keynote")) return "Keynote";
  if (normalized.includes("panel")) return "Panel";
  if (normalized.includes("workshop")) return "Workshop";
  if (normalized.includes("coffee") || mealPeriod === MealPeriod.BREAK) return "Coffee Break";
  if (normalized.includes("lunch") || mealPeriod === MealPeriod.LUNCH) return "Lunch";
  if (normalized.includes("reception") || mealPeriod === MealPeriod.RECEPTION) return "Reception";
  return "Session";
}

function sortPeople(left: Matrix2PersonRecord, right: Matrix2PersonRecord): number {
  const leftRoleRank = PERSON_ROLE_ORDER.indexOf(left.role);
  const rightRoleRank = PERSON_ROLE_ORDER.indexOf(right.role);

  if (leftRoleRank !== rightRoleRank) {
    return leftRoleRank - rightRoleRank;
  }

  return left.name.localeCompare(right.name);
}

type MatrixRowProjection = {
  id: string;
  eventId: string;
  dayDate: Date;
  startTime: Date | null;
  endTime: Date | null;
  roomId: string | null;
  roomName: string | null;
  sessionName: string | null;
  includeInOfficialAgenda: boolean;
  setupType: string | null;
  attendance: number | null;
  attendanceSource: ExpectedAttendanceSource | null;
  mealPeriod: MealPeriod | null;
  fnbNotes: string | null;
  avNotes: string | null;
  avNeeds: string | null;
  notes: string | null;
  sortOrder?: number;
  createdAt: Date;
  updatedAt: Date;
  room: {
    id: string;
    name: string;
    capacity: number | null;
  } | null;
};

function buildMatrixRowSelect(includeSortOrder: boolean): Prisma.MatrixRowSelect {
  return {
    id: true,
    eventId: true,
    dayDate: true,
    startTime: true,
    endTime: true,
    roomId: true,
    roomName: true,
    sessionName: true,
    includeInOfficialAgenda: true,
    setupType: true,
    attendance: true,
    attendanceSource: true,
    mealPeriod: true,
    fnbNotes: true,
    avNotes: true,
    avNeeds: true,
    notes: true,
    ...(includeSortOrder ? { sortOrder: true } : {}),
    createdAt: true,
    updatedAt: true,
    room: {
      select: {
        id: true,
        name: true,
        capacity: true,
      },
    },
  };
}

async function findRows(
  db: MatrixDbClient,
  eventId: string,
  options: { includeSortOrder: boolean; trackQuery?: QueryTracker },
): Promise<MatrixRowProjection[]> {
  options.trackQuery?.(`matrixRow.findMany(includeSortOrder=${String(options.includeSortOrder)})`);
  const rows = await db.matrixRow.findMany({
    where: { eventId, archivedAt: null },
    orderBy: options.includeSortOrder
      ? [{ dayDate: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
      : [{ dayDate: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
    select: buildMatrixRowSelect(options.includeSortOrder),
  });
  return rows as MatrixRowProjection[];
}

async function listRowsCompat(
  db: MatrixDbClient,
  eventId: string,
  options: { trackQuery?: QueryTracker } = {},
): Promise<MatrixRowProjection[]> {
  const attempts: Array<{ includeSortOrder: boolean }> = [
    { includeSortOrder: true },
    { includeSortOrder: false },
  ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      return await findRows(db, eventId, {
        includeSortOrder: attempt.includeSortOrder,
        trackQuery: options.trackQuery,
      });
    } catch (error) {
      const recoverableSortError = attempt.includeSortOrder && isMissingSortOrderColumn(error);
      if (recoverableSortError) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

type EventPersonRow = {
  id: string;
  name: string;
  role: string;
  company: string | null;
  email: string | null;
};

type MatrixRowSpeakerRow = {
  matrixRowId: string;
  speakerId: string;
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
  status: "NEEDS_INFO" | "INVITED" | "CONFIRMED" | "CANCELLED";
};

type MatrixRowStaffAssignmentRow = {
  matrixRowId: string;
  personId: string;
  name: string;
  role: string;
  assignmentRole: string | null;
  company: string | null;
  email: string | null;
};

async function listEventPeopleCompat(
  db: MatrixDbClient,
  eventId: string,
  options: { trackQuery?: QueryTracker } = {},
): Promise<Matrix2PersonRecord[]> {
  try {
    options.trackQuery?.("EventPerson.$queryRaw(list)");
    const peopleRows = await db.$queryRaw<EventPersonRow[]>`
      SELECT
        p."id" AS "id",
        p."name" AS "name",
        p."role" AS "role",
        p."company" AS "company",
        p."email" AS "email"
      FROM "EventPerson" p
      WHERE p."eventId" = ${eventId}::uuid
    `;

    return peopleRows
      .map((person) => ({
        id: person.id,
        name: person.name,
        role: toPersonRoleLabel(person.role),
        company: person.company ?? null,
        email: person.email ?? null,
      }))
      .sort(sortPeople);
  } catch (error) {
    if (isMissingPeopleAssignmentTable(error)) {
      return [];
    }
    throw error;
  }
}

async function listMatrixRowSpeakersCompat(
  db: MatrixDbClient,
  eventId: string,
  options: { trackQuery?: QueryTracker } = {},
): Promise<MatrixRowSpeakerRow[]> {
  try {
    options.trackQuery?.("SessionSpeakerAssignment.$queryRaw(list)");
    return await db.$queryRaw<MatrixRowSpeakerRow[]>`
      SELECT
        s."sessionId" AS "matrixRowId",
        sp."id" AS "speakerId",
        sp."name" AS "name",
        sp."title" AS "title",
        sp."company" AS "company",
        sp."email" AS "email",
        sp."status" AS "status"
      FROM "SessionSpeakerAssignment" s
      JOIN "Speaker" sp ON sp."id" = s."speakerId"
      JOIN "MatrixRow" r ON r."id" = s."sessionId"
      WHERE r."eventId" = ${eventId}::uuid
      ORDER BY s."sessionId" ASC, sp."name" ASC
    `;
  } catch (error) {
    if (isMissingPeopleAssignmentTable(error)) {
      return [];
    }
    throw error;
  }
}

async function listMatrixRowStaffAssignmentsCompat(
  db: MatrixDbClient,
  eventId: string,
  options: { trackQuery?: QueryTracker } = {},
): Promise<MatrixRowStaffAssignmentRow[]> {
  options.trackQuery?.("SessionStaffAssignment.findMany");
  let assignments;
  try {
    assignments = await db.sessionStaffAssignment.findMany({
      where: { session: { eventId } },
      select: {
        sessionId: true,
        role: true,
        person: { select: { id: true, name: true, role: true, company: true, email: true } },
      },
      orderBy: [{ sessionId: "asc" }, { person: { name: "asc" } }],
    });
  } catch (error) {
    if (isMissingCanonicalSessionAuthority(error)) {
      throw new Matrix2Error(
        "Run of Show staffing data is unavailable because the required database migration has not been applied. Apply the current Prisma migrations and retry.",
        503,
      );
    }
    throw error;
  }
  return assignments.map((assignment) => ({
    matrixRowId: assignment.sessionId,
    personId: assignment.person.id,
    name: assignment.person.name,
    role: assignment.person.role,
    assignmentRole: assignment.role,
    company: assignment.person.company,
    email: assignment.person.email,
  }));
}

export async function listMatrix2People(eventId: string): Promise<Matrix2PersonRecord[]> {
  return listEventPeopleCompat(getPrisma(), eventId);
}

export async function createMatrix2Person(
  eventId: string,
  input: {
    name?: unknown;
    role?: unknown;
    company?: unknown;
    email?: unknown;
  },
): Promise<Matrix2PersonRecord> {
  const name = toOptionalText(input.name);
  if (!name) {
    throw new Matrix2Error("name is required", 400);
  }

  const role = normalizeRoleInput(input.role);
  const persistedRole = toPersistedEventPersonRole(role);
  const company = toOptionalText(input.company);
  const email = toOptionalText(input.email);

  const existingByName = await getPrisma().$queryRaw<EventPersonRow[]>`
    SELECT
      p."id" AS "id",
      p."name" AS "name",
      p."role" AS "role",
      p."company" AS "company",
      p."email" AS "email"
    FROM "EventPerson" p
    WHERE p."eventId" = ${eventId}::uuid
      AND LOWER(p."name") = LOWER(${name})
    LIMIT 1
  `;

  if (existingByName.length > 0) {
    throw new Matrix2Error("A person with this name already exists for the event", 409);
  }

  const inserted = await getPrisma().$queryRaw<EventPersonRow[]>`
    INSERT INTO "EventPerson" ("eventId", "name", "role", "company", "email", "updatedAt")
    VALUES (${eventId}::uuid, ${name}, ${persistedRole}::"EventPersonRole", ${company}, ${email}, NOW())
    RETURNING
      "id" AS "id",
      "name" AS "name",
      "role" AS "role",
      "company" AS "company",
      "email" AS "email"
  `;

  if (inserted.length === 0) {
    throw new Matrix2Error("Failed to create person", 500);
  }

  const person = inserted[0];
  return {
    id: person.id,
    name: person.name,
    role: toPersonRoleLabel(person.role),
    company: person.company ?? null,
    email: person.email ?? null,
  };
}

function createSectionTimer() {
  const sectionDurationsMs: Record<string, number> = {};
  return {
    sectionDurationsMs,
    async time<T>(sectionName: string, work: () => Promise<T>): Promise<T> {
      const startedAt = Date.now();
      try {
        return await work();
      } finally {
        sectionDurationsMs[sectionName] = Date.now() - startedAt;
      }
    },
  };
}

export async function getMatrix2Snapshot(
  eventId: string,
  options: Matrix2SnapshotOptions = {},
): Promise<Matrix2Snapshot> {
  const timer = createSectionTimer();
  let trackedPrismaCalls = 0;
  const trackQuery: QueryTracker = () => {
    trackedPrismaCalls += 1;
  };

  const db = getPrisma();
  const event = await timer.time("event", async () => {
    trackQuery("event.findUnique");
    return db.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        timezone: true,
        sessionRequirementTemplateId: true,
      },
    });
  });
  if (!event) throw new Matrix2Error("Event not found", 404);

  // The snapshot is read-only. A transaction here held a pooled connection while
  // the template reader tried to open another one, causing P2028 under load.
  const [roomsFromTable, rows, peopleAssignments, requirements] = await Promise.all([
    timer.time("rooms", async () => {
      trackQuery("room.findMany");
      return db.room.findMany({
        where: { eventId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, capacity: true },
      });
    }),
    timer.time("rows", async () => listRowsCompat(db, eventId, { trackQuery })),
    timer.time("peopleAssignments", async () => {
      trackQuery("SessionAVRequirement.findMany");
      return Promise.all([
        listEventPeopleCompat(db, eventId, { trackQuery }),
        listMatrixRowSpeakersCompat(db, eventId, { trackQuery }),
        listMatrixRowStaffAssignmentsCompat(db, eventId, { trackQuery }),
        db.sessionAVRequirement.findMany({
          where: { session: { eventId } },
          select: { id: true, sessionId: true, avType: true, quantity: true },
          orderBy: [{ sessionId: "asc" }, { createdAt: "asc" }],
        }),
      ]);
    }),
    timer.time("requirements", async () => {
      trackQuery("getEventSessionRequirementTemplate");
      trackQuery("sessionRequirementSelection.findMany");
      return Promise.all([
        getEventSessionRequirementTemplate(eventId),
        db.sessionRequirementSelection.findMany({
          where: { session: { eventId } },
          select: {
            sessionId: true,
            itemId: true,
            quantity: true,
            budgetLineItem: {
              select: {
                id: true,
                lineItem: true,
                category: true,
                subcategory: true,
                forecastCents: true,
                actualCents: true,
                status: true,
              },
            },
          },
        }),
      ]);
    }),
  ]);
  const [people, speakerRows, staffRows, avRows] = peopleAssignments;
  const [requirementTemplate, requirementSelections] = requirements;
  const snapshotData = {
    event,
    roomsFromTable,
    rows,
    people,
    speakerRows,
    staffRows,
    avRows,
    requirementTemplate,
    requirementSelections,
  };

  const roomById = new Map<string, { id: string; name: string; capacity: number | null }>();
  for (const room of snapshotData.roomsFromTable) {
    roomById.set(room.id, {
      id: room.id,
      name: room.name,
      capacity: room.capacity ?? null,
    });
  }

  const speakersByRowId = new Map<string, Matrix2SessionSpeakerRecord[]>();
  for (const entry of snapshotData.speakerRows) {
    const current = speakersByRowId.get(entry.matrixRowId) ?? [];
    current.push({
      speakerId: entry.speakerId,
      name: entry.name,
      title: entry.title ?? null,
      company: entry.company ?? null,
      email: entry.email ?? null,
      status: entry.status,
    });
    speakersByRowId.set(entry.matrixRowId, current);
  }

  const staffByRowId = new Map<string, Matrix2SessionStaffRecord[]>();
  for (const entry of snapshotData.staffRows) {
    const current = staffByRowId.get(entry.matrixRowId) ?? [];
    current.push({
      personId: entry.personId,
      name: entry.name,
      role: toPersonRoleLabel(entry.role),
      assignmentRole: entry.assignmentRole ?? null,
      company: entry.company ?? null,
      email: entry.email ?? null,
    });
    staffByRowId.set(entry.matrixRowId, current);
  }

  const avByRowId = new Map<string, Matrix2SessionAVRequirementRecord[]>();
  for (const entry of snapshotData.avRows) {
    const current = avByRowId.get(entry.sessionId) ?? [];
    current.push({ id: entry.id, avType: entry.avType, quantity: entry.quantity ?? null });
    avByRowId.set(entry.sessionId, current);
  }

  const sessions: Matrix2SessionRecord[] = [];
  const requirementSelectionsBySession = new Map<
    string,
    Array<{ itemId: string; quantity: number | null; linkedBudgetLineItem: LinkedBudgetLineItemRecord | null }>
  >();
  for (const selection of snapshotData.requirementSelections) {
    const current = requirementSelectionsBySession.get(selection.sessionId) ?? [];
    current.push({
      itemId: selection.itemId,
      quantity: selection.quantity,
      linkedBudgetLineItem: selection.budgetLineItem
        ? {
            id: selection.budgetLineItem.id,
            lineItem: selection.budgetLineItem.lineItem,
            category: selection.budgetLineItem.category,
            subcategory: selection.budgetLineItem.subcategory,
            forecastCents: selection.budgetLineItem.forecastCents,
            actualCents: selection.budgetLineItem.actualCents,
            status: selection.budgetLineItem.status,
          }
        : null,
    });
    requirementSelectionsBySession.set(selection.sessionId, current);
  }

  await timer.time("sessionAssembly", async () => {
    for (const [rowIndex, row] of snapshotData.rows.entries()) {
      const rowRoom = row.roomId ? roomById.get(row.roomId) ?? null : null;
      const resolvedRoomId = rowRoom?.id ?? null;
      const resolvedRoomName = (rowRoom?.name ?? row.roomName ?? "Unassigned").trim() || "Unassigned";

      const parsedNotes = parseStructuredNotes(row.notes);
      const setupValue = (row.setupType ?? parsedNotes.roomSetup ?? "").trim();

      const speakerAssignments = speakersByRowId.get(row.id) ?? [];
      const staffAssignments = staffByRowId.get(row.id) ?? [];

      const avRequirementsStructured = avByRowId.get(row.id) ?? [];
      const avRequirements = avRequirementsStructured.map((entry) => formatAvRequirementLabel(entry.avType, entry.quantity));

      const structuredFoodService: Matrix2SessionFoodServiceRecord | null = (() => {
        const fallbackType = mealPeriodToFoodServiceType(row.mealPeriod);
        if (!fallbackType) return null;
        return {
          id: `legacy:${row.id}`,
          serviceType: fallbackType,
          serviceStyle: null,
          headcount: row.attendance ?? null,
        };
      })();

      const fallbackFnbItems = Array.from(
        new Set([
          ...(row.mealPeriod && row.mealPeriod !== MealPeriod.NONE ? [mealToLabel[row.mealPeriod]] : []),
          ...normalizeTextList(row.fnbNotes ?? ""),
          ...parsedNotes.foodAndBeverage,
        ]),
      );

      const foodAndBeverage = Array.from(
        new Set([
          ...(structuredFoodService?.serviceType ? [structuredFoodService.serviceType] : []),
          ...(structuredFoodService?.serviceStyle ? [structuredFoodService.serviceStyle] : []),
          ...fallbackFnbItems,
        ]),
      );

      const title = (row.sessionName ?? "").trim() || "Untitled Session";
      const roomCapacity = resolvedRoomId ? (roomById.get(resolvedRoomId)?.capacity ?? null) : null;
      const speakers = speakerAssignments.length > 0
        ? speakerAssignments.map((speaker) => speaker.name)
        : parsedNotes.speakers;
      const staffAssigned = staffAssignments.length > 0
        ? staffAssignments.map((staff) => staff.assignmentRole ? `${staff.name} (${staff.assignmentRole})` : staff.name)
        : parsedNotes.staffAssigned;

      sessions.push({
        id: row.id,
        rowId: row.id,
        eventId: row.eventId,
        sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : rowIndex + 1,
        date: formatDate(row.dayDate),
        startTime: formatTime(row.startTime),
        endTime: formatTime(row.endTime),
        roomId: resolvedRoomId,
        roomName: resolvedRoomName,
        title,
        includeInOfficialAgenda: row.includeInOfficialAgenda,
        sessionType: inferSessionType(title, row.mealPeriod, parsedNotes.sessionType),
        status: (parsedNotes.status ?? "").trim(),
        expectedAttendance: row.attendance,
        expectedAttendanceSource: row.attendanceSource,
        roomSetup: setupValue,
        roomCapacity,
        speakers,
        speakerAssignments,
        avRequirements,
        avRequirementsStructured,
        foodAndBeverage,
        foodService: structuredFoodService,
        staffAssigned,
        staffAssignments,
        requirementSelections: requirementSelectionsBySession.get(row.id) ?? [],
        notes: parsedNotes.plainNotes,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    }
  });

  const dates = Array.from(new Set(sessions.map((session) => session.date))).sort();

  const roomRecords: Matrix2RoomRecord[] = [...snapshotData.roomsFromTable]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((room) => ({
      id: room.id,
      name: room.name,
      capacity: room.capacity ?? null,
    }));

  const snapshot: Matrix2Snapshot = {
    event: {
      id: snapshotData.event.id,
      name: snapshotData.event.name,
      startDate: formatDate(snapshotData.event.startDate),
      endDate: snapshotData.event.endDate ? formatDate(snapshotData.event.endDate) : null,
      timezone: snapshotData.event.timezone,
    },
    dates,
    rooms: roomRecords,
    people: snapshotData.people,
    requirementTemplate: snapshotData.requirementTemplate,
    sessions,
  };

  options.onDiagnostics?.({
    sectionDurationsMs: timer.sectionDurationsMs,
    queryGroups: 6,
    trackedPrismaCalls,
    usedTransaction: false,
    rowCount: snapshot.sessions.length,
    roomCount: snapshot.rooms.length,
    peopleCount: snapshot.people.length,
  });

  return snapshot;
}
