import { ExpectedAttendanceSource, MealPeriod, Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { Matrix2Error, parseStructuredNotes } from "@/lib/matrix2";
import { saveSessionRequirementSelections, SessionRequirementError } from "@/lib/session-requirements";
import { logSpeakerActivity } from "@/src/server/services/speaker-comms";
import { initializeEventSessionRequirementTemplate } from "@/lib/session-requirements";
import { canonicalSessionStatusValue, sessionStatusOptionsFromTemplate } from "@/lib/session-status";
import { parseSessionRequirementQuantity, SessionRequirementQuantityError } from "@/lib/session-requirement-quantity";

type Matrix2PersonRole = "speaker" | "moderator" | "vip" | "staff" | "vendor";

const PERSON_ROLES = new Set<Matrix2PersonRole>(["speaker", "moderator", "vip", "staff", "vendor"]);
const STAFF_ROLES = new Set<Matrix2PersonRole>(["staff", "vendor"]);

type PersonDraft = {
  personId: string | null;
  name: string;
  personRole: string | null;
  company: string | null;
  email: string | null;
};

type StaffAssignmentDraft = PersonDraft & {
  assignmentRole: string | null;
};

type SpeakerDraft = {
  speakerId: string | null;
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
};

type EventPersonRecord = {
  id: string;
  name: string;
  role: string;
  company: string | null;
  email: string | null;
};

type SpeakerRecord = {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
};

type AvRequirementDraft = {
  avType: string;
  quantity: number | null;
};

type FoodServiceDraft = {
  serviceType: string;
  serviceStyle: string | null;
  headcount: number | null;
};

export type Matrix2SessionUpdateInput = {
  title?: unknown;
  sessionType?: unknown;
  status?: unknown;
  roomId?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  expectedAttendance?: unknown;
  expectedAttendanceSource?: unknown;
  roomSetupType?: unknown;
  speakers?: unknown;
  avRequirements?: unknown;
  foodService?: unknown;
  foodAndBeverage?: unknown;
  staffAssignments?: unknown;
  requirementSelections?: unknown;
  notes?: unknown;
};

function toOptionalText(value: unknown): string | null {
  if (typeof value === "undefined" || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function toRequiredText(value: unknown, fieldName: string): string {
  const normalized = toOptionalText(value);
  if (!normalized) {
    throw new Matrix2Error(`${fieldName} is required`, 400);
  }
  return normalized;
}

function parseTimeInput(value: unknown, fieldName: string): Date {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value.trim())) {
    throw new Matrix2Error(`${fieldName} must be HH:mm`, 400);
  }
  const [hoursString, minutesString] = value.trim().split(":");
  const hours = Number(hoursString);
  const minutes = Number(minutesString);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Matrix2Error(`${fieldName} must be HH:mm`, 400);
  }
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));
}

function parseOptionalAttendance(value: unknown): number | null {
  if (typeof value === "undefined" || value === null || String(value).trim() === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    throw new Matrix2Error("expectedAttendance must be an integer >= 0", 400);
  }
  return parsed;
}

function parseOptionalAttendanceSource(value: unknown): ExpectedAttendanceSource | null {
  if (typeof value === "undefined" || value === null || String(value).trim() === "") return null;
  if (!Object.values(ExpectedAttendanceSource).includes(value as ExpectedAttendanceSource)) {
    throw new Matrix2Error("expectedAttendanceSource is invalid", 400);
  }
  return value as ExpectedAttendanceSource;
}

function normalizeSpeakerDrafts(value: unknown): SpeakerDraft[] {
  if (!Array.isArray(value)) return [];

  const normalized: SpeakerDraft[] = [];
  const dedupe = new Set<string>();

  for (const rawEntry of value) {
    if (!rawEntry || typeof rawEntry !== "object") continue;
    const entry = rawEntry as Record<string, unknown>;

    const speakerId = toOptionalText(entry.speakerId);
    const name = toOptionalText(entry.name) ?? "";
    const title = toOptionalText(entry.title);
    const company = toOptionalText(entry.company);
    const email = toOptionalText(entry.email);

    if (!speakerId && !name) continue;

    const key = speakerId ? `id:${speakerId}` : `name:${name.toLowerCase()}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);

    normalized.push({
      speakerId,
      name,
      title,
      company,
      email,
    });
  }

  return normalized;
}

function normalizeStaffAssignmentDrafts(value: unknown): StaffAssignmentDraft[] {
  if (!Array.isArray(value)) return [];

  const normalized: StaffAssignmentDraft[] = [];
  const dedupe = new Set<string>();

  for (const rawEntry of value) {
    if (!rawEntry || typeof rawEntry !== "object") continue;
    const entry = rawEntry as Record<string, unknown>;

    const personId = toOptionalText(entry.personId);
    const name = toOptionalText(entry.name) ?? "";

    const rawRole = toOptionalText(entry.role);
    const explicitPersonRole = toOptionalText(entry.personRole);
    const personRole = explicitPersonRole ?? rawRole;

    const explicitAssignmentRole =
      toOptionalText(entry.assignmentRole) ??
      toOptionalText(entry.assignmentrole) ??
      toOptionalText(entry.staffRole);

    const normalizedRawRole = rawRole?.toLowerCase() ?? null;
    const inferredRawRoleAsPerson = normalizedRawRole && PERSON_ROLES.has(normalizedRawRole as Matrix2PersonRole)
      ? rawRole
      : null;

    const assignmentRole = explicitAssignmentRole
      ?? (explicitPersonRole ? rawRole : (inferredRawRoleAsPerson ? null : rawRole));

    const company = toOptionalText(entry.company);
    const email = toOptionalText(entry.email);

    if (!personId && !name) continue;

    const key = personId ? `id:${personId}` : `name:${name.toLowerCase()}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);

    normalized.push({
      personId,
      name,
      personRole,
      company,
      email,
      assignmentRole,
    });
  }

  return normalized;
}

function normalizeAvRequirements(value: unknown): AvRequirementDraft[] {
  if (!Array.isArray(value)) return [];

  const normalized: AvRequirementDraft[] = [];
  const dedupe = new Set<string>();

  for (const rawEntry of value) {
    if (!rawEntry || typeof rawEntry !== "object") continue;
    const entry = rawEntry as Record<string, unknown>;

    const avType = toOptionalText(entry.avType);
    if (!avType) continue;

    const dedupeKey = avType.toLowerCase();
    if (dedupe.has(dedupeKey)) continue;
    dedupe.add(dedupeKey);

    let quantity: number | null = null;
    const rawQuantity = entry.quantity;
    if (typeof rawQuantity !== "undefined" && rawQuantity !== null && String(rawQuantity).trim() !== "") {
      try {
        quantity = parseSessionRequirementQuantity(rawQuantity, avType);
      } catch (error) {
        if (error instanceof SessionRequirementQuantityError) {
          throw new Matrix2Error(error.message, 400);
        }
        throw error;
      }
    }

    normalized.push({
      avType,
      quantity,
    });
  }

  return normalized;
}

function normalizeFoodService(value: unknown): FoodServiceDraft | null {
  if (!value || typeof value !== "object") return null;

  const entry = value as Record<string, unknown>;
  const serviceTypeRaw = toOptionalText(entry.serviceType);
  if (!serviceTypeRaw) return null;

  if (serviceTypeRaw.toLowerCase() === "none") {
    return null;
  }

  const serviceStyle = toOptionalText(entry.serviceStyle);
  const rawHeadcount = entry.headcount;
  let headcount: number | null = null;
  if (typeof rawHeadcount !== "undefined" && rawHeadcount !== null && String(rawHeadcount).trim() !== "") {
    const parsed = Number(rawHeadcount);
    if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      throw new Matrix2Error("foodService.headcount must be an integer >= 0", 400);
    }
    headcount = parsed;
  }

  return {
    serviceType: serviceTypeRaw,
    serviceStyle,
    headcount,
  };
}

function normalizeTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const normalized: string[] = [];
  const dedupe = new Set<string>();
  for (const rawEntry of value) {
    const text = toOptionalText(rawEntry);
    if (!text) continue;
    const key = text.toLowerCase();
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    normalized.push(text);
  }
  return normalized;
}

function toMealPeriod(serviceType: string | null): MealPeriod {
  const normalized = (serviceType ?? "").trim().toLowerCase();
  if (!normalized || normalized === "none") return MealPeriod.NONE;
  if (normalized.includes("breakfast")) return MealPeriod.BREAKFAST;
  if (normalized.includes("lunch")) return MealPeriod.LUNCH;
  if (normalized.includes("dinner")) return MealPeriod.DINNER;
  if (normalized.includes("reception") || normalized.includes("cocktail")) return MealPeriod.RECEPTION;
  if (normalized.includes("break")) return MealPeriod.BREAK;
  return MealPeriod.OTHER;
}

function buildLegacyNotes(input: {
  sessionType: string;
  status: string;
  speakers: string[];
  staffAssigned: string[];
  foodAndBeverage: string[];
  notes: string;
}): string {
  const lines: string[] = [];

  if (input.sessionType.trim()) {
    lines.push(`Session Type: ${input.sessionType.trim()}`);
  }
  if (input.status.trim()) {
    lines.push(`Status: ${input.status.trim()}`);
  }
  if (input.speakers.length > 0) {
    lines.push(`Speakers: ${input.speakers.join(", ")}`);
  }
  if (input.staffAssigned.length > 0) {
    lines.push(`Staff: ${input.staffAssigned.join(", ")}`);
  }
  if (input.foodAndBeverage.length > 0) {
    lines.push(`F&B: ${input.foodAndBeverage.join(", ")}`);
  }

  const freeformNotes = input.notes.trim();
  if (freeformNotes) {
    if (lines.length > 0) lines.push("");
    lines.push(freeformNotes);
  }

  return lines.join("\n").trim();
}

function normalizePersonRole(rawRole: string | null): Matrix2PersonRole | null {
  if (!rawRole) return null;
  const normalized = rawRole.trim().toLowerCase();
  if (normalized === "speaker") return "speaker";
  if (normalized === "moderator") return "moderator";
  if (normalized === "vip") return "vip";
  if (normalized === "staff") return "staff";
  if (normalized === "vendor") return "vendor";
  return null;
}

function resolveRoleForSelection(options: {
  requestedRole: string | null;
  defaultRole: Matrix2PersonRole;
  allowedRoles: Set<Matrix2PersonRole>;
  fieldLabel: string;
}): Matrix2PersonRole {
  const normalizedRequested = normalizePersonRole(options.requestedRole);
  const resolved = normalizedRequested ?? options.defaultRole;
  if (!options.allowedRoles.has(resolved)) {
    throw new Matrix2Error(`${options.fieldLabel} must use an allowed person role`, 400);
  }
  return resolved;
}

function toPersistedEventPersonRole(role: Matrix2PersonRole): "STAFF" | "VENDOR" {
  if (role === "staff") return "STAFF";
  if (role === "vendor") return "VENDOR";
  throw new Matrix2Error("Event people support only staff or vendor roles in this workflow", 400);
}

async function findEventPersonById(
  tx: Prisma.TransactionClient,
  eventId: string,
  personId: string,
): Promise<EventPersonRecord | null> {
  const rows = await tx.$queryRaw<EventPersonRecord[]>`
    SELECT
      p."id" AS "id",
      p."name" AS "name",
      p."role" AS "role",
      p."company" AS "company",
      p."email" AS "email"
    FROM "EventPerson" p
    WHERE p."id" = ${personId}::uuid
      AND p."eventId" = ${eventId}::uuid
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function findEventPersonByName(
  tx: Prisma.TransactionClient,
  eventId: string,
  name: string,
): Promise<EventPersonRecord | null> {
  const rows = await tx.$queryRaw<EventPersonRecord[]>`
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

  return rows[0] ?? null;
}

async function createEventPerson(
  tx: Prisma.TransactionClient,
  eventId: string,
  entry: PersonDraft,
  role: Matrix2PersonRole,
): Promise<EventPersonRecord> {
  const persistedRole = toPersistedEventPersonRole(role);
  const inserted = await tx.$queryRaw<EventPersonRecord[]>`
    INSERT INTO "EventPerson" ("eventId", "name", "role", "company", "email", "updatedAt")
    VALUES (${eventId}::uuid, ${entry.name.trim()}, ${persistedRole}::"EventPersonRole", ${entry.company}, ${entry.email}, NOW())
    RETURNING
      "id" AS "id",
      "name" AS "name",
      "role" AS "role",
      "company" AS "company",
      "email" AS "email"
  `;

  const created = inserted[0];
  if (!created) {
    throw new Matrix2Error("Failed to create event person", 500);
  }

  return created;
}

async function resolvePerson(
  tx: Prisma.TransactionClient,
  eventId: string,
  entry: PersonDraft,
  options: {
    defaultRole: Matrix2PersonRole;
    allowedRoles: Set<Matrix2PersonRole>;
    fieldLabel: string;
  },
): Promise<EventPersonRecord> {
  if (entry.personId) {
    const existingById = await findEventPersonById(tx, eventId, entry.personId);
    if (!existingById) {
      throw new Matrix2Error("Selected person is not available for this event", 400);
    }

    const existingRole = normalizePersonRole(existingById.role);
    if (!existingRole || !options.allowedRoles.has(existingRole)) {
      throw new Matrix2Error(`${options.fieldLabel} must reference allowed event people`, 400);
    }

    return existingById;
  }

  const normalizedName = entry.name.trim();
  if (!normalizedName) {
    throw new Matrix2Error("Person name is required", 400);
  }

  const existingByName = await findEventPersonByName(tx, eventId, normalizedName);
  if (existingByName) {
    const existingRole = normalizePersonRole(existingByName.role);
    if (!existingRole || !options.allowedRoles.has(existingRole)) {
      throw new Matrix2Error(`${options.fieldLabel} must reference allowed event people`, 400);
    }
    return existingByName;
  }

  const role = resolveRoleForSelection({
    requestedRole: entry.personRole,
    defaultRole: options.defaultRole,
    allowedRoles: options.allowedRoles,
    fieldLabel: options.fieldLabel,
  });

  return createEventPerson(tx, eventId, entry, role);
}

async function findSpeakerById(
  tx: Prisma.TransactionClient,
  eventId: string,
  speakerId: string,
): Promise<SpeakerRecord | null> {
  const rows = await tx.$queryRaw<SpeakerRecord[]>`
    SELECT
      s."id" AS "id",
      s."name" AS "name",
      s."title" AS "title",
      s."company" AS "company",
      s."email" AS "email"
    FROM "Speaker" s
    WHERE s."id" = ${speakerId}::uuid
      AND s."eventId" = ${eventId}::uuid
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function findSpeakerByExactName(
  tx: Prisma.TransactionClient,
  eventId: string,
  name: string,
): Promise<SpeakerRecord | null> {
  const rows = await tx.$queryRaw<SpeakerRecord[]>`
    SELECT
      s."id" AS "id",
      s."name" AS "name",
      s."title" AS "title",
      s."company" AS "company",
      s."email" AS "email"
    FROM "Speaker" s
    WHERE s."eventId" = ${eventId}::uuid
      AND LOWER(s."name") = LOWER(${name})
    ORDER BY s."createdAt" DESC
    LIMIT 2
  `;

  if (rows.length > 1) {
    throw new Matrix2Error(`Multiple speakers named "${name}" were found. Select one from the speaker directory.`, 400);
  }

  return rows[0] ?? null;
}

export async function updateMatrix2Session(
  eventId: string,
  sessionId: string,
  input: Matrix2SessionUpdateInput,
): Promise<{ id: string }> {
  const statusOptions = typeof input.status !== "undefined"
    ? sessionStatusOptionsFromTemplate(await initializeEventSessionRequirementTemplate(eventId))
    : [];
  const requestedStatus = typeof input.status !== "undefined"
    ? canonicalSessionStatusValue(input.status, statusOptions)
    : null;
  if (typeof input.status !== "undefined" && !requestedStatus) {
    throw new Matrix2Error(
      `status must be one of: ${statusOptions.map((option) => option.label).join(", ")}`,
      400,
    );
  }

  const session = await getPrisma().matrixRow.findFirst({
    where: {
      id: sessionId,
      eventId,
      archivedAt: null,
    },
    select: {
      id: true,
      roomId: true,
      roomName: true,
      sessionName: true,
      startTime: true,
      endTime: true,
      setupType: true,
      attendance: true,
      attendanceSource: true,
      mealPeriod: true,
      avNeeds: true,
      fnbNotes: true,
      notes: true,
    },
  });

  if (!session) {
    throw new Matrix2Error("Session not found", 404);
  }

  // Partial-merge semantics: a field is only changed when the caller explicitly
  // provides it (typeof !== "undefined"). Omitted scalars reuse the persisted
  // value; omitted arrays leave related rows untouched. Explicit values (including
  // empty arrays/strings) still clear, matching prior full-payload behavior.
  // The `notes` column is a denormalized blob of sessionType/status/speakers/staff/
  // F&B/freeform, so omitted contributors are rehydrated from the parsed blob to
  // avoid clobbering the parts the caller did not touch.
  const parsedNotes = parseStructuredNotes(session.notes);

  const title = typeof input.title !== "undefined"
    ? toRequiredText(input.title, "title")
    : (session.sessionName ?? "");
  if (!title) {
    throw new Matrix2Error("title is required", 400);
  }

  const sessionType = typeof input.sessionType !== "undefined"
    ? (toOptionalText(input.sessionType) ?? "Session")
    : (parsedNotes.sessionType ?? "");
  const status = typeof input.status !== "undefined"
    ? requestedStatus ?? ""
    : (parsedNotes.status ?? "");
  const freeformNotes = typeof input.notes !== "undefined"
    ? (toOptionalText(input.notes) ?? "")
    : parsedNotes.plainNotes;

  const startTime = typeof input.startTime !== "undefined"
    ? parseTimeInput(input.startTime, "startTime")
    : session.startTime;
  const endTime = typeof input.endTime !== "undefined"
    ? parseTimeInput(input.endTime, "endTime")
    : session.endTime;
  if (startTime && endTime && endTime.getTime() <= startTime.getTime()) {
    throw new Matrix2Error("endTime must be after startTime", 400);
  }

  const expectedAttendance = typeof input.expectedAttendance !== "undefined"
    ? parseOptionalAttendance(input.expectedAttendance)
    : session.attendance;
  const expectedAttendanceSource = expectedAttendance === null
    ? null
    : typeof input.expectedAttendanceSource !== "undefined"
      ? parseOptionalAttendanceSource(input.expectedAttendanceSource)
      : typeof input.expectedAttendance !== "undefined" && expectedAttendance !== session.attendance
        ? ExpectedAttendanceSource.PLANNER_ESTIMATE
        : session.attendanceSource;
  const setupType = typeof input.roomSetupType !== "undefined"
    ? ((toOptionalText(input.roomSetupType) ?? "") || null)
    : session.setupType;

  const roomProvided = typeof input.roomId !== "undefined";
  const requestedRoomId = roomProvided ? toOptionalText(input.roomId) : null;

  const speakersProvided = typeof input.speakers !== "undefined";
  const staffProvided = typeof input.staffAssignments !== "undefined";
  const avProvided = typeof input.avRequirements !== "undefined";
  const fnbProvided =
    typeof input.foodService !== "undefined" || typeof input.foodAndBeverage !== "undefined";

  const speakerDrafts = speakersProvided ? normalizeSpeakerDrafts(input.speakers) : [];
  const staffDrafts = staffProvided ? normalizeStaffAssignmentDrafts(input.staffAssignments) : [];
  const avRequirements = avProvided ? normalizeAvRequirements(input.avRequirements) : [];
  const foodService = fnbProvided ? normalizeFoodService(input.foodService) : null;
  const foodAndBeverage = fnbProvided ? normalizeTextArray(input.foodAndBeverage) : [];
  const requirementSelections = input.requirementSelections;

  try {
    return await getPrisma().$transaction(async (tx) => {
      let resolvedRoomId: string | null;
      let resolvedRoomName: string;
      if (roomProvided) {
        if (requestedRoomId) {
          const resolvedRoom = await tx.room.findFirst({
            where: { id: requestedRoomId, eventId },
            select: { id: true, name: true },
          });
          if (!resolvedRoom) {
            throw new Matrix2Error("Room not found for this event", 400);
          }
          resolvedRoomId = resolvedRoom.id;
          resolvedRoomName = resolvedRoom.name;
        } else {
          resolvedRoomId = null;
          resolvedRoomName = "Unassigned";
        }
      } else {
        resolvedRoomId = session.roomId;
        resolvedRoomName = session.roomName ?? "Unassigned";
      }

      // Speakers: only rewrite assignments when the caller provided the array.
      let speakerNames: string[];
      let uniqueSpeakerIds: string[] = [];
      if (speakersProvided) {
        const resolvedSpeakers = await Promise.all(
          speakerDrafts.map(async (entry) => {
            if (entry.speakerId) {
              const speaker = await findSpeakerById(tx, eventId, entry.speakerId);
              if (!speaker) {
                throw new Matrix2Error("Selected speaker is not available for this event", 400);
              }
              return speaker;
            }

            const normalizedName = entry.name.trim();
            if (!normalizedName) {
              throw new Matrix2Error("Speakers must reference an existing speaker record", 400);
            }

            const speaker = await findSpeakerByExactName(tx, eventId, normalizedName);
            if (!speaker) {
              throw new Matrix2Error(`Speaker "${normalizedName}" was not found in the speaker directory`, 404);
            }

            return speaker;
          }),
        );
        speakerNames = resolvedSpeakers.map((entry) => entry.name.trim()).filter(Boolean);
        uniqueSpeakerIds = Array.from(new Set(resolvedSpeakers.map((entry) => entry.id)));
      } else {
        speakerNames = parsedNotes.speakers;
      }

      // Staff: only rewrite assignments when the caller provided the array.
      let staffPeople: string[];
      let uniqueStaffAssignments: Array<{ person: EventPersonRecord; assignmentRole: string | null }> = [];
      if (staffProvided) {
        const resolvedStaff = await Promise.all(
          staffDrafts.map(async (entry) => ({
            person: await resolvePerson(tx, eventId, entry, {
              defaultRole: "staff",
              allowedRoles: STAFF_ROLES,
              fieldLabel: "Staff",
            }),
            assignmentRole: entry.assignmentRole,
          })),
        );
        uniqueStaffAssignments = Array.from(
          new Map(resolvedStaff.map((entry) => [entry.person.id, entry])).values(),
        );
        staffPeople = uniqueStaffAssignments
          .map((entry) => {
            const name = entry.person.name.trim();
            if (!name) return "";
            return entry.assignmentRole ? `${name} (${entry.assignmentRole})` : name;
          })
          .filter(Boolean);
      } else {
        staffPeople = parsedNotes.staffAssigned;
      }

      // MatrixRow.avNeeds is a retired legacy projection. SessionAVRequirement is
      // the canonical session-level AV authority; do not write new AV state here.
      const avNeeds = session.avNeeds ?? "";

      // F&B: preserve existing fnbNotes/mealPeriod/blob F&B when neither F&B input was provided.
      let fnbNotes: string;
      let mealPeriod: MealPeriod | null;
      let fnbList: string[];
      if (fnbProvided) {
        const fnbSummary = foodAndBeverage.length > 0
          ? foodAndBeverage
          : [
              foodService?.serviceType ?? "",
              foodService?.serviceStyle ?? "",
              foodService?.headcount !== null && typeof foodService?.headcount !== "undefined"
                ? `Headcount ${foodService.headcount}`
                : "",
            ].filter(Boolean);
        fnbNotes = fnbSummary.join("\n");
        mealPeriod = toMealPeriod(foodService?.serviceType ?? fnbSummary[0] ?? null);
        fnbList = fnbSummary;
      } else {
        fnbNotes = session.fnbNotes ?? "";
        mealPeriod = session.mealPeriod;
        fnbList = parsedNotes.foodAndBeverage;
      }

      await tx.matrixRow.update({
        where: { id: sessionId },
        data: {
          roomId: resolvedRoomId,
          roomName: resolvedRoomName,
          sessionName: title,
          startTime,
          endTime,
          setupType,
          attendance: expectedAttendance,
          attendanceSource: expectedAttendanceSource,
          mealPeriod,
          avNeeds,
          fnbNotes,
          notes: buildLegacyNotes({
            sessionType,
            status,
            speakers: speakerNames,
            staffAssigned: staffPeople,
            foodAndBeverage: fnbList,
            notes: freeformNotes,
          }),
        },
      });

      if (speakersProvided) {
        await tx.$executeRaw`
          DELETE FROM "SessionSpeakerAssignment"
          WHERE "sessionId" = ${sessionId}::uuid
        `;

        for (const speakerId of uniqueSpeakerIds) {
          await tx.$executeRaw`
            INSERT INTO "SessionSpeakerAssignment" ("sessionId", "speakerId")
            VALUES (${sessionId}::uuid, ${speakerId}::uuid)
            ON CONFLICT ("sessionId", "speakerId") DO NOTHING
          `;
        }
      }

      if (staffProvided) {
        await tx.sessionStaffAssignment.deleteMany({ where: { sessionId } });
        if (uniqueStaffAssignments.length > 0) {
          await tx.sessionStaffAssignment.createMany({
            data: uniqueStaffAssignments.map((entry) => ({
              sessionId,
              personId: entry.person.id,
              role: entry.assignmentRole,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (avProvided) {
        await tx.sessionAVRequirement.deleteMany({ where: { sessionId } });
        if (avRequirements.length > 0) {
          await tx.sessionAVRequirement.createMany({
            data: avRequirements.map((entry) => ({
              sessionId,
              avType: entry.avType,
              quantity: entry.quantity,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (typeof requirementSelections !== "undefined") {
        await saveSessionRequirementSelections({
          tx,
          eventId,
          sessionId,
          selections: requirementSelections,
        });
      }

      return { id: sessionId };
    });
  } catch (error) {
    if (error instanceof SessionRequirementError) {
      throw new Matrix2Error(error.message, error.status);
    }
    throw error;
  }
}

export async function removeMatrix2SessionSpeakerAssignment(
  eventId: string,
  sessionId: string,
  speakerId: string,
  actorUserId?: string,
): Promise<{ id: string; speakerId: string }> {
  const session = await getPrisma().matrixRow.findFirst({
    where: {
      id: sessionId,
      eventId,
      archivedAt: null,
    },
    select: {
      id: true,
    },
  });

  if (!session) {
    throw new Matrix2Error("Session not found", 404);
  }

  const speaker = await getPrisma().speaker.findFirst({
    where: {
      id: speakerId,
      eventId,
    },
    select: {
      id: true,
    },
  });

  if (!speaker) {
    throw new Matrix2Error("Speaker not found for this event", 404);
  }

  await getPrisma().$executeRaw`
    DELETE FROM "SessionSpeakerAssignment"
    WHERE "sessionId" = ${sessionId}::uuid
      AND "speakerId" = ${speakerId}::uuid
  `;

  if (actorUserId) {
    await logSpeakerActivity(eventId, actorUserId, "Speaker unassigned from session", {
      action: "UNASSIGNED",
      entityType: "SessionSpeakerAssignment",
      entityId: sessionId,
    });
  }

  return {
    id: sessionId,
    speakerId,
  };
}

export async function addMatrix2SessionSpeakerAssignment(
  eventId: string,
  sessionId: string,
  speakerId: string,
  actorUserId?: string,
): Promise<{ id: string; speakerId: string }> {
  const session = await getPrisma().matrixRow.findFirst({
    where: {
      id: sessionId,
      eventId,
      archivedAt: null,
    },
    select: {
      id: true,
    },
  });

  if (!session) {
    throw new Matrix2Error("Session not found", 404);
  }

  const speaker = await getPrisma().speaker.findFirst({
    where: {
      id: speakerId,
      eventId,
    },
    select: {
      id: true,
    },
  });

  if (!speaker) {
    throw new Matrix2Error("Speaker not found for this event", 404);
  }

  await getPrisma().$executeRaw`
    INSERT INTO "SessionSpeakerAssignment" ("sessionId", "speakerId")
    VALUES (${sessionId}::uuid, ${speakerId}::uuid)
    ON CONFLICT ("sessionId", "speakerId") DO NOTHING
  `;

  if (actorUserId) {
    await logSpeakerActivity(eventId, actorUserId, "Speaker assigned to session", {
      action: "ASSIGNED",
      entityType: "SessionSpeakerAssignment",
      entityId: sessionId,
    });
  }

  return {
    id: sessionId,
    speakerId,
  };
}
