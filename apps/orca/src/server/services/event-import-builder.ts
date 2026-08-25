/**
 * Event Import Builder — canonical server-side create orchestration.
 *
 * One deterministic transaction creates the Event and the selected Run of Show,
 * Budget, and Timeline records, reusing the existing canonical create-data
 * builders (buildMatrixImportCreateData / buildBudgetImportCreateData /
 * buildTimelineImportCreateData) and the canonical event-creation behavior
 * (createEventWithinTransaction). The UI never writes module records directly;
 * it posts a reviewed plan and this owns the writes.
 */
import {
  Prisma,
  SpeakerStatus,
  TimelineDependencyType,
  TimelinePlanningStage,
  TimelinePriority,
  TimelineStatus,
  TimelineWorkstream,
  UserRole,
  type EventStatus,
} from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { canListOrganizationEvents, createEventWithinTransaction } from "@/lib/events";
import { recordEventActivity } from "@/src/server/services/event-activity";
import { isSupportedTimezone } from "@/lib/timezones";
import { buildMatrixImportCreateData, MatrixError } from "@/lib/matrix";
import { buildBudgetImportCreateData, BudgetServiceError } from "@/src/server/services/budget";
import { buildTimelineImportCreateData, TimelineServiceError } from "@/src/server/services/timeline";
import type {
  EventImportBudgetInput,
  EventImportCreatePlan,
  EventImportCreateRequest,
  EventImportCreateResult,
  ImportWarning,
} from "@/lib/event-import-types";

export class EventImportBuilderError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "EVENT_IMPORT_CREATE_ERROR") {
    super(message);
    this.name = "EventImportBuilderError";
    this.status = status;
    this.code = code;
  }
}

export type EventImportBuilderUser = {
  id: string;
  orgId: string | null;
  role: UserRole;
};

const VALID_TIMELINE_STATUSES = new Set<string>(Object.values(TimelineStatus));
const VALID_TIMELINE_PRIORITIES = new Set<string>(Object.values(TimelinePriority));
const VALID_TIMELINE_WORKSTREAMS = new Set<string>(Object.values(TimelineWorkstream));
const VALID_TIMELINE_PLANNING_STAGES = new Set<string>(Object.values(TimelinePlanningStage));
const VALID_SOURCE_TYPES = new Set<EventImportCreatePlan["sourceType"]>([
  "workbook",
  "pasteAgenda",
  "template",
  "blank",
]);
const VALID_WORKBOOK_TARGETS = new Set(["runOfShow", "budget", "timeline", "notIncluded"]);
const REQUIRED_WORKBOOK_FIELDS: Record<string, string[]> = {
  runOfShow: ["title", "date", "startTime", "endTime"],
  budget: ["category", "forecast"],
  timeline: ["title"],
};

function normalizeName(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function extractSpeakerLine(notes: string | null | undefined): string {
  if (!notes) return "";
  const line = notes.split(/\r?\n/).find((entry) => /^speakers?:/i.test(entry.trim()));
  return line?.replace(/^speakers?:/i, "").trim() ?? "";
}

function splitSpeakerEntries(value: string): string[] {
  return value
    .split(/\s*(?:;|\||\/|\band\b)\s*|\s*,\s*/i)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseSpeakerEntry(value: string): { name: string; email: string | null } | null {
  const emailMatch = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = emailMatch ? normalizeEmail(emailMatch[0]) : null;
  const name = value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(/[<>()\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name && !email) return null;
  return { name: name || email!, email };
}

/** Parse an `YYYY-MM-DD` string into a UTC Date, or null if malformed. */
function isoDateToUtc(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

function validateTimelineRows(plan: EventImportCreatePlan): void {
  for (const [index, row] of plan.timeline.entries()) {
    const label = `Timeline row ${index + 1}`;
    if (!row.title?.trim()) {
      throw new EventImportBuilderError(`${label}: title is required`, 400, "INVALID_TIMELINE_ROW");
    }
    const startDate = row.startDateIso ? isoDateToUtc(row.startDateIso) : null;
    const endDate = row.endDateIso ? isoDateToUtc(row.endDateIso) : null;
    if (row.startDateIso && !startDate) {
      throw new EventImportBuilderError(`${label}: start date must be valid YYYY-MM-DD`, 400, "INVALID_TIMELINE_ROW");
    }
    if (row.endDateIso && !endDate) {
      throw new EventImportBuilderError(`${label}: end date must be valid YYYY-MM-DD`, 400, "INVALID_TIMELINE_ROW");
    }
    if (startDate && endDate && endDate < startDate) {
      throw new EventImportBuilderError(`${label}: end date must be on or after start date`, 400, "INVALID_TIMELINE_ROW");
    }
    if (!VALID_TIMELINE_STATUSES.has(row.status)) {
      throw new EventImportBuilderError(`${label}: invalid status`, 400, "INVALID_TIMELINE_TAXONOMY");
    }
    if (row.priority != null && !VALID_TIMELINE_PRIORITIES.has(row.priority)) {
      throw new EventImportBuilderError(`${label}: invalid priority`, 400, "INVALID_TIMELINE_TAXONOMY");
    }
    if (row.workstream != null && !VALID_TIMELINE_WORKSTREAMS.has(row.workstream)) {
      throw new EventImportBuilderError(`${label}: invalid workstream`, 400, "INVALID_TIMELINE_TAXONOMY");
    }
    if (row.planningStage != null && !VALID_TIMELINE_PLANNING_STAGES.has(row.planningStage)) {
      throw new EventImportBuilderError(`${label}: invalid planning stage`, 400, "INVALID_TIMELINE_TAXONOMY");
    }
  }
}

function validatePlan(plan: EventImportCreatePlan): void {
  if (!VALID_SOURCE_TYPES.has(plan.sourceType)) {
    throw new EventImportBuilderError("Invalid import source type");
  }
  const name = plan.eventBasics.name?.trim();
  if (!name) throw new EventImportBuilderError("Event name is required");
  const start = isoDateToUtc(plan.eventBasics.startDate);
  const end = isoDateToUtc(plan.eventBasics.endDate);
  if (!start) throw new EventImportBuilderError("A valid start date is required");
  if (!end) throw new EventImportBuilderError("A valid end date is required");
  if (end < start) throw new EventImportBuilderError("End date cannot be before the start date");
  if (!plan.eventBasics.timezone || !isSupportedTimezone(plan.eventBasics.timezone)) {
    throw new EventImportBuilderError("Select a valid timezone");
  }
  validateTimelineRows(plan);
  for (const mapping of plan.workbookMappings ?? []) {
    if (!VALID_WORKBOOK_TARGETS.has(mapping.selectedTarget)) {
      throw new EventImportBuilderError("Invalid workbook import target");
    }
    if (mapping.skipped || mapping.selectedTarget === "notIncluded") continue;
    const selectedFields = new Set(Object.values(mapping.columnMapping).filter(Boolean));
    const missing = (REQUIRED_WORKBOOK_FIELDS[mapping.selectedTarget] ?? []).filter(
      (field) => !selectedFields.has(field),
    );
    if (missing.length > 0) {
      throw new EventImportBuilderError(
        `Missing required column mapping for ${mapping.fileName ? `${mapping.fileName} / ` : ""}${mapping.sheetName}`,
      );
    }
  }
}

function validateApprovedRequest(request: EventImportCreateRequest): void {
  validatePlan(request);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.idempotencyKey)) {
    throw new EventImportBuilderError("A valid import idempotency key is required", 400, "INVALID_IDEMPOTENCY_KEY");
  }
  if (request.approval?.confirmed !== true || request.approval.evidence !== "FINAL_REVIEW") {
    throw new EventImportBuilderError("Confirm the final import review before creating the workspace", 400, "IMPORT_NOT_APPROVED");
  }
  const reviewedAt = new Date(request.approval.reviewedAt);
  if (!request.approval.reviewedAt || Number.isNaN(reviewedAt.getTime())) {
    throw new EventImportBuilderError("A valid review timestamp is required", 400, "INVALID_APPROVAL_EVIDENCE");
  }
  if (request.sourceType === "workbook" && (request.workbookMappings?.length ?? 0) === 0) {
    throw new EventImportBuilderError("Reviewed workbook mappings are required", 400, "MAPPINGS_NOT_REVIEWED");
  }
  const omissions = request.approval.omissions;
  const omissionCount = (omissions?.skippedSheets.length ?? 0)
    + (omissions?.skippedColumns.length ?? 0)
    + (omissions?.skippedRows.length ?? 0);
  if (omissionCount > 0 && request.approval.omissionsAcknowledged !== true) {
    throw new EventImportBuilderError(
      "Acknowledge the reviewed skipped sheets, columns, and rows before creating the workspace",
      400,
      "IMPORT_OMISSIONS_NOT_ACKNOWLEDGED",
    );
  }
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function canceledError(): EventImportBuilderError {
  return new EventImportBuilderError("Event import was canceled before completion", 499, "IMPORT_CANCELED");
}

function normalizeBudgetRows(rows: EventImportBudgetInput[]) {
  return rows.map((row) => {
    const status = typeof row.status === "string" ? row.status.trim() : row.status;
    if (status === null || status === "") {
      return { ...row, status: undefined };
    }
    return { ...row, status };
  });
}

async function resolveTimelineOwnerIds(
  tx: Prisma.TransactionClient,
  orgId: string,
  rows: EventImportCreateRequest["timeline"],
): Promise<Array<string | null>> {
  if (!rows.some((row) => row.owner?.trim())) return rows.map(() => null);

  const users = await tx.user.findMany({
    where: { orgId },
    select: { id: true, name: true, email: true },
  });

  return rows.map((row, index) => {
    const source = row.owner?.trim();
    if (!source) return null;
    const key = normalizeName(source);
    const matches = users.filter((candidate) =>
      normalizeEmail(candidate.email) === key || (candidate.name ? normalizeName(candidate.name) === key : false),
    );
    const ids = [...new Set(matches.map((candidate) => candidate.id))];
    if (ids.length === 0) {
      throw new EventImportBuilderError(
        `Timeline row ${index + 1}: owner "${source}" does not match a user in this organization`,
        400,
        "TIMELINE_OWNER_NOT_FOUND",
      );
    }
    if (ids.length > 1) {
      throw new EventImportBuilderError(
        `Timeline row ${index + 1}: owner "${source}" matches multiple users in this organization`,
        409,
        "TIMELINE_OWNER_AMBIGUOUS",
      );
    }
    return ids[0]!;
  });
}

function moduleValidationErrorToBuilderError(error: unknown): EventImportBuilderError | null {
  if (error instanceof BudgetServiceError || error instanceof MatrixError || error instanceof TimelineServiceError) {
    return new EventImportBuilderError(error.message, error.status);
  }
  return null;
}

/**
 * Create the event workspace from a reviewed import plan. Atomic: if any step
 * fails the whole creation rolls back (no half-created event).
 */
async function executeEventImport(
  plan: EventImportCreateRequest,
  user: EventImportBuilderUser,
  intentId: string,
  signal?: AbortSignal,
): Promise<EventImportCreateResult> {
  if (!user.orgId) {
    throw new EventImportBuilderError("An active organization is required to create events", 403);
  }
  if (!canListOrganizationEvents(user.role)) {
    throw new EventImportBuilderError("Organization owner or admin role required to create events", 403);
  }
  validateApprovedRequest(plan);
  if (signal?.aborted) throw canceledError();

  const warnings: ImportWarning[] = [];
  const startDate = isoDateToUtc(plan.eventBasics.startDate)!;
  const endDate = isoDateToUtc(plan.eventBasics.endDate)!;

  // The approved plan already contains only explicitly reviewed rows. Never
  // filter here: malformed or unsupported values must fail, not disappear.
  const rosRows = plan.runOfShow;
  const budgetRows = plan.budget;
  const timelineRows = plan.timeline;

  if (plan.sourceType !== "blank" && rosRows.length === 0 && budgetRows.length === 0 && timelineRows.length === 0) {
    throw new EventImportBuilderError("Select at least one import target before creating the workspace.");
  }

  const skipped = {
    runOfShowRows: 0,
    budgetLineItems: 0,
    timelineItems: 0,
  };

  try {
    const result = await getPrisma().$transaction(async (tx) => {
      if (signal?.aborted) throw canceledError();
      const timelineOwnerIds = await resolveTimelineOwnerIds(tx, user.orgId!, timelineRows);
      // 1. Event (+ membership, root timeline, session template).
      const event = await createEventWithinTransaction(
        tx,
        {
          name: plan.eventBasics.name.trim(),
          startDate,
          endDate,
          status: "DRAFT" as EventStatus,
          timezone: plan.eventBasics.timezone,
          venueName: plan.eventBasics.venueName ?? null,
          city: plan.eventBasics.city ?? null,
        },
        { orgId: user.orgId!, createdByUserId: user.id },
      );

      // 2. Rooms — dedupe by normalized name, keep first display casing.
      const roomDisplayByKey = new Map<string, string>();
      for (const row of rosRows) {
        const display = row.roomName?.replace(/\s+/g, " ").trim();
        if (!display) continue;
        const key = normalizeName(display);
        if (!roomDisplayByKey.has(key)) roomDisplayByKey.set(key, display);
      }
      if (roomDisplayByKey.size > 0) {
        await tx.room.createMany({
          data: [...roomDisplayByKey.values()].map((name) => ({ eventId: event.id, name })),
          skipDuplicates: true,
        });
      }
      const roomRecords = await tx.room.findMany({
        where: { eventId: event.id },
        select: { id: true, name: true },
      });
      const roomIdByKey = new Map(roomRecords.map((r) => [normalizeName(r.name), r.id] as const));

      // 3. Run of Show — reuse canonical build helper, link roomId where matched.
      let runOfShowRows = 0;
      if (rosRows.length > 0) {
        const data = buildMatrixImportCreateData(event.id, rosRows, 0).map((row) => {
          const key = row.roomName ? normalizeName(row.roomName) : null;
          return { ...row, roomId: key ? roomIdByKey.get(key) ?? null : null };
        });
        const createdSessions = [];
        for (const row of data) {
          createdSessions.push(
            await tx.matrixRow.create({
              data: row,
              select: { id: true, notes: true },
            }),
          );
        }
        runOfShowRows = createdSessions.length;

        const importedSpeakersBySession = new Map<string, Array<{ name: string; email: string | null }>>();
        const speakerByEmail = new Map<string, { name: string; email: string | null }>();
        const speakerByName = new Map<string, { name: string; email: string | null }>();
        for (const session of createdSessions) {
          const parsed = splitSpeakerEntries(extractSpeakerLine(session.notes))
            .map(parseSpeakerEntry)
            .filter((entry): entry is { name: string; email: string | null } => Boolean(entry));
          if (parsed.length === 0) continue;
          importedSpeakersBySession.set(session.id, parsed);
          for (const speaker of parsed) {
            if (speaker.email) {
              if (!speakerByEmail.has(speaker.email)) speakerByEmail.set(speaker.email, speaker);
            } else {
              const key = normalizeName(speaker.name);
              if (key && !speakerByName.has(key)) speakerByName.set(key, speaker);
            }
          }
        }

        if (speakerByEmail.size > 0 || speakerByName.size > 0) {
          const existingSpeakers = await tx.speaker.findMany({
            where: {
              eventId: event.id,
              OR: [
                ...(speakerByEmail.size > 0 ? [{ email: { in: [...speakerByEmail.keys()] } }] : []),
                ...(speakerByName.size > 0 ? [{ name: { in: [...speakerByName.values()].map((speaker) => speaker.name) } }] : []),
              ],
            },
            select: { id: true, name: true, email: true },
          });
          const speakerIdByEmail = new Map(
            existingSpeakers
              .filter((speaker) => speaker.email)
              .map((speaker) => [normalizeEmail(speaker.email!), speaker.id] as const),
          );
          const speakerIdByName = new Map(existingSpeakers.map((speaker) => [normalizeName(speaker.name), speaker.id] as const));

          for (const speaker of [...speakerByEmail.values(), ...speakerByName.values()]) {
            const emailKey = speaker.email ? normalizeEmail(speaker.email) : null;
            const nameKey = normalizeName(speaker.name);
            if ((emailKey && speakerIdByEmail.has(emailKey)) || speakerIdByName.has(nameKey)) continue;
            const created = await tx.speaker.create({
              data: {
                eventId: event.id,
                name: speaker.name,
                email: speaker.email,
                status: SpeakerStatus.NEEDS_INFO,
              },
              select: { id: true, name: true, email: true },
            });
            if (created.email) speakerIdByEmail.set(normalizeEmail(created.email), created.id);
            speakerIdByName.set(normalizeName(created.name), created.id);
          }

          const assignments: Prisma.SessionSpeakerAssignmentCreateManyInput[] = [];
          const seenAssignments = new Set<string>();
          for (const [sessionId, speakers] of importedSpeakersBySession.entries()) {
            for (const speaker of speakers) {
              const speakerId = speaker.email
                ? speakerIdByEmail.get(normalizeEmail(speaker.email))
                : speakerIdByName.get(normalizeName(speaker.name));
              if (!speakerId) continue;
              const key = `${sessionId}:${speakerId}`;
              if (seenAssignments.has(key)) continue;
              seenAssignments.add(key);
              assignments.push({ sessionId, speakerId });
            }
          }
          if (assignments.length > 0) {
            await tx.sessionSpeakerAssignment.createMany({ data: assignments, skipDuplicates: true });
          }
        }
      }

      // 4. Budget — one Budget per event, then line items via canonical builder.
      let budgetLineItems = 0;
      if (budgetRows.length > 0) {
        const budget = await tx.budget.create({ data: { eventId: event.id, status: "DRAFT" } });
        const data = buildBudgetImportCreateData(budget.id, normalizeBudgetRows(budgetRows), 0);
        await tx.budgetLineItem.createMany({ data });
        budgetLineItems = data.length;
      }

      // 5. Timeline — sibling tasks after the root item (sortOrder 0).
      let timelineItems = 0;
      if (timelineRows.length > 0) {
        const data = buildTimelineImportCreateData(
          event.id,
          timelineRows.map((r, index) => ({
            title: r.title,
            startDateIso: r.startDateIso,
            endDateIso: r.endDateIso,
            status: r.status as TimelineStatus,
            priority: (r.priority ?? TimelinePriority.MEDIUM) as TimelinePriority,
            workstream: (r.workstream ?? null) as TimelineWorkstream | null,
            planningStage: (r.planningStage ?? null) as TimelinePlanningStage | null,
            isCriticalPath: r.isCriticalPath ?? false,
            notes: r.notes ?? null,
            ownerUserId: timelineOwnerIds[index] ?? null,
          })),
          0,
        );
        await tx.timelineItem.createMany({ data });
        timelineItems = data.length;
      }

      // 6. Timeline dependencies — only when a reference resolves to exactly one task.
      let timelineDependencies = 0;
      if (plan.timelineDependencies.length > 0) {
        const created = await tx.timelineItem.findMany({
          where: { eventId: event.id },
          select: { id: true, title: true },
        });
        const idsByTitle = new Map<string, string[]>();
        for (const item of created) {
          const key = normalizeName(item.title);
          const bucket = idsByTitle.get(key);
          if (bucket) bucket.push(item.id);
          else idsByTitle.set(key, [item.id]);
        }
        const depData: Prisma.TimelineDependencyCreateManyInput[] = [];
        for (const dep of plan.timelineDependencies) {
          const pre = idsByTitle.get(normalizeName(dep.predecessorTitle));
          const suc = idsByTitle.get(normalizeName(dep.successorTitle));
          if (pre?.length === 1 && suc?.length === 1 && pre[0] !== suc[0]) {
            depData.push({
              eventId: event.id,
              predecessorItemId: pre[0],
              successorItemId: suc[0],
              type: TimelineDependencyType.FINISH_TO_START,
            });
          } else {
            warnings.push({
              module: "timeline",
              severity: "warning",
              message: `Dependency "${dep.predecessorTitle}" → "${dep.successorTitle}" could not be linked (no unique match).`,
            });
          }
        }
        if (depData.length > 0) {
          const dependencyResult = await tx.timelineDependency.createMany({ data: depData, skipDuplicates: true });
          timelineDependencies = dependencyResult.count;
        }
      }

      await recordEventActivity(tx, {
        eventId: event.id,
        actor: { kind: "USER", userId: user.id },
        module: "EVENT_SETTINGS",
        action: "IMPORTED",
        entityType: "EventImport",
        entityId: event.id,
        entityLabel: event.name,
        message: `Created event workspace from ${plan.sourceType} import (${runOfShowRows} Run of Show rows, ${budgetLineItems} budget line items, ${timelineItems} timeline items)`,
      });

      if (signal?.aborted) throw canceledError();
      const completed = {
        eventId: event.id,
        intentId,
        created: {
          rooms: roomDisplayByKey.size,
          runOfShowRows,
          budgetLineItems,
          timelineItems,
          timelineDependencies,
        },
        skipped,
        warnings,
      } satisfies EventImportCreateResult;

      await tx.eventImportResult.create({
        data: {
          intentId,
          orgId: user.orgId!,
          requestedByUserId: user.id,
          eventId: event.id,
          status: "SUCCEEDED",
          createdSummary: asJson(completed.created),
          skippedSummary: asJson(completed.skipped),
          warnings: asJson(completed.warnings),
        },
      });
      await tx.eventImportIntent.update({
        where: { id: intentId },
        data: { status: "SUCCEEDED", completedAt: new Date() },
      });

      return completed;
    });

    return result;
  } catch (error) {
    if (error instanceof EventImportBuilderError) throw error;
    const moduleValidationError = moduleValidationErrorToBuilderError(error);
    if (moduleValidationError) throw moduleValidationError;
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("Event import create transaction failed:", {
        code: error.code,
        message: error.message,
        meta: error.meta,
      });
      throw new EventImportBuilderError("Failed to create the event workspace. No changes were saved.", 500);
    }
    throw error;
  }
}

type EventImportExecutionOptions = {
  signal?: AbortSignal;
};

function replayTerminalIntent(intent: {
  id: string;
  status: string;
  result: {
    eventId: string | null;
    createdSummary: unknown;
    skippedSummary: unknown;
    warnings: unknown;
    errorCode: string | null;
    errorMessage: string | null;
    httpStatus: number | null;
  } | null;
}): EventImportCreateResult {
  const result = intent.result;
  if (intent.status === "SUCCEEDED" && result?.eventId) {
    return {
      eventId: result.eventId,
      intentId: intent.id,
      replayed: true,
      created: result.createdSummary as EventImportCreateResult["created"],
      skipped: result.skippedSummary as EventImportCreateResult["skipped"],
      warnings: (result.warnings ?? []) as ImportWarning[],
    };
  }
  if (intent.status === "FAILED" || intent.status === "CANCELED") {
    throw new EventImportBuilderError(
      result?.errorMessage ?? (intent.status === "CANCELED" ? "Event import was canceled" : "Event import failed"),
      result?.httpStatus ?? (intent.status === "CANCELED" ? 409 : 500),
      result?.errorCode ?? (intent.status === "CANCELED" ? "IMPORT_CANCELED" : "EVENT_IMPORT_CREATE_ERROR"),
    );
  }
  throw new EventImportBuilderError(
    "This approved import is already being processed. Retry with the same key to read its terminal result.",
    409,
    "IMPORT_IN_PROGRESS",
  );
}

async function findImportIntent(orgId: string, requestedByUserId: string, idempotencyKey: string) {
  return getPrisma().eventImportIntent.findUnique({
    where: { orgId_requestedByUserId_idempotencyKey: { orgId, requestedByUserId, idempotencyKey } },
    include: { result: true },
  });
}

export async function createEventFromImportPlan(
  request: EventImportCreateRequest,
  user: EventImportBuilderUser,
  options: EventImportExecutionOptions = {},
): Promise<EventImportCreateResult> {
  if (!user.orgId) {
    throw new EventImportBuilderError("An active organization is required to create events", 403);
  }
  if (!canListOrganizationEvents(user.role)) {
    throw new EventImportBuilderError("Organization owner or admin role required to create events", 403);
  }
  validateApprovedRequest(request);

  let intent: { id: string };
  try {
    intent = await getPrisma().eventImportIntent.create({
      data: {
        orgId: user.orgId,
        requestedByUserId: user.id,
        idempotencyKey: request.idempotencyKey,
        sourceType: request.sourceType,
        status: "PROCESSING",
        approvedAt: new Date(),
        approvalEvidence: asJson(request.approval),
        reviewedMappings: asJson(request.workbookMappings ?? []),
        approvedPlan: asJson(request),
      },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await findImportIntent(user.orgId, user.id, request.idempotencyKey);
      if (existing) return replayTerminalIntent(existing);
    }
    throw error;
  }

  try {
    return await executeEventImport(request, user, intent.id, options.signal);
  } catch (error) {
    const terminalStatus = error instanceof EventImportBuilderError && error.code === "IMPORT_CANCELED"
      ? "CANCELED"
      : "FAILED";
    const terminalError = error instanceof EventImportBuilderError
      ? error
      : new EventImportBuilderError("Failed to create the event workspace. No changes were saved.", 500);
    await getPrisma().$transaction([
      getPrisma().eventImportResult.upsert({
        where: { intentId: intent.id },
        create: {
          intentId: intent.id,
          orgId: user.orgId,
          requestedByUserId: user.id,
          status: terminalStatus,
          errorCode: terminalError.code,
          errorMessage: terminalError.message,
          httpStatus: terminalError.status,
        },
        update: {
          status: terminalStatus,
          errorCode: terminalError.code,
          errorMessage: terminalError.message,
          httpStatus: terminalError.status,
          completedAt: new Date(),
        },
      }),
      getPrisma().eventImportIntent.update({
        where: { id: intent.id },
        data: { status: terminalStatus, completedAt: new Date() },
      }),
    ]);
    throw terminalError;
  }
}
