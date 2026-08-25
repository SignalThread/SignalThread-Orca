import {
  FnbRequirementKind,
  MealPeriod,
  Prisma,
  RequirementDisposition,
} from "@prisma/client";

import { calculateFnbPlanCost, type FnbPlanCostBreakdown } from "@/lib/fnb-cost-calculation";
import { toSessionFnbAssignmentRecord } from "@/lib/fnb-catalog";
import { createMatrixRow } from "@/lib/matrix";
import { getPrisma } from "@/lib/prisma";
import { recordEventActivity } from "@/src/server/services/event-activity";

/**
 * Event-level F&B Planner.
 *
 * The canonical F&B function record is a `MatrixRow`: it owns the date, times, room,
 * attendance, meal period, tax percentage, and service-charge percentage. Assignments
 * (`SessionFnbCatalogAssignment`), the guarantee (`SessionFoodService`), and dietary/allergen
 * requirements (`SessionFnbRequirement`) all hang off it. This module reads those records and
 * derives event-wide rollups; it never stores its own copy of them.
 */

export class FnbEventPlannerError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "FNB_EVENT_PLANNER_ERROR") {
    super(message);
    this.name = "FnbEventPlannerError";
  }
}

export type FnbFunctionReadinessState = "ready" | "needsWork" | "blocked";

export type FnbFunctionWarning = {
  code:
    | "NO_ITEMS_ASSIGNED"
    | "UNPRICED_ITEMS"
    | "NO_GUARANTEE"
    | "NO_TIMES"
    | "NO_LOCATION"
    | "OPEN_SAFETY_REQUIREMENTS"
    | "BUDGET_APPROVAL_PENDING";
  label: string;
  /** What the planner has to do next, in the order they would do it. */
  nextAction: string;
  tone: "critical" | "warning";
};

export type FnbFunctionRecord = {
  sessionId: string;
  name: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  /** Meal period is the function type. `null` means the row carries F&B without a declared type. */
  type: MealPeriod | null;
  typeLabel: string;
  location: string | null;
  /** True when this function is attached to a Run of Show content session rather than standing alone. */
  isSessionLinked: boolean;
  attendance: number | null;
  /** Guaranteed headcount from `SessionFoodService`, which overrides attendance for costing. */
  guarantee: number | null;
  assignedItemCount: number;
  unpricedItemCount: number;
  taxPercent: string;
  serviceChargePercent: string;
  calculation: FnbPlanCostBreakdown;
  budgetedCents: number | null;
  budgetVarianceCents: number | null;
  approvalsPending: number;
  openRequirementCount: number;
  accommodationCount: number;
  readiness: FnbFunctionReadinessState;
  warnings: FnbFunctionWarning[];
  href: string;
};

export type FnbEventTotals = {
  functionCount: number;
  sessionLinkedFunctionCount: number;
  independentFunctionCount: number;
  subtotalCents: number;
  taxCents: number;
  serviceChargeCents: number;
  additionalTaxCents: number;
  totalEstimatedCents: number;
  budgetedCents: number | null;
  budgetVarianceCents: number | null;
  /** Weighted by guarantee/attendance across functions that declare one; null when none do. */
  averageCostPerPersonCents: number | null;
  /** How many functions the per-person figure is derived from, so the UI can say what it excludes. */
  costPerPersonFunctionCount: number;
  /** Functions with cost but no headcount; their spend is not in the per-person figure. */
  costPerPersonExcludedFunctionCount: number;
  assignedItemCount: number;
  unpricedItemCount: number;
  readyCount: number;
  needsWorkCount: number;
  blockedCount: number;
  approvalsPending: number;
  openRequirementCount: number;
  accommodationCount: number;
};

export type FnbCostByDay = {
  date: string;
  functionCount: number;
  totalEstimatedCents: number;
};

export type FnbCostByType = {
  type: MealPeriod | null;
  typeLabel: string;
  functionCount: number;
  totalEstimatedCents: number;
};

export type FnbEventPlannerPayload = {
  eventId: string;
  functions: FnbFunctionRecord[];
  totals: FnbEventTotals;
  costByDay: FnbCostByDay[];
  costByType: FnbCostByType[];
  generatedAt: string;
};

const MEAL_PERIOD_LABELS: Record<MealPeriod, string> = {
  [MealPeriod.NONE]: "Not specified",
  [MealPeriod.BREAKFAST]: "Breakfast",
  [MealPeriod.BREAK]: "Break",
  [MealPeriod.LUNCH]: "Lunch",
  [MealPeriod.RECEPTION]: "Reception",
  [MealPeriod.DINNER]: "Dinner",
  [MealPeriod.OTHER]: "Other",
};

export function fnbFunctionTypeLabel(type: MealPeriod | null): string {
  if (!type) return "Not specified";
  return MEAL_PERIOD_LABELS[type] ?? "Other";
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Prisma `@db.Time` values come back as 1970-01-01 timestamps; only the clock part is meaningful. */
function clockTime(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(11, 16);
}

function sessionFnbHref(eventId: string, sessionId: string): string {
  return `/events/${encodeURIComponent(eventId)}/matrix/sessions/${encodeURIComponent(sessionId)}?focus=fnb`;
}

/**
 * A `MatrixRow` counts as an F&B function when the planner has actually recorded F&B intent on
 * it: a meal period, a food-service guarantee, catalog assignments, or dietary requirements.
 * Nothing here infers a function from a session's name.
 */
function qualifiesAsFnbFunction(row: {
  mealPeriod: MealPeriod | null;
  sessionFoodService: unknown | null;
  fnbCatalogAssignments: unknown[];
  fnbRequirements: unknown[];
}): boolean {
  if (row.mealPeriod && row.mealPeriod !== MealPeriod.NONE) return true;
  if (row.sessionFoodService) return true;
  if (row.fnbCatalogAssignments.length > 0) return true;
  return row.fnbRequirements.length > 0;
}

function decimalToFixed(value: Prisma.Decimal): string {
  return value.toFixed(4);
}

function buildWarnings(input: {
  assignedItemCount: number;
  unpricedItemCount: number;
  guarantee: number | null;
  attendance: number | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  openRequirementCount: number;
  approvalsPending: number;
}): FnbFunctionWarning[] {
  const warnings: FnbFunctionWarning[] = [];

  if (!input.startTime || !input.endTime) {
    warnings.push({
      code: "NO_TIMES",
      label: "Service window not set",
      nextAction: "Set the start and end time so service timing can be checked.",
      tone: "critical",
    });
  }
  if (input.assignedItemCount === 0) {
    warnings.push({
      code: "NO_ITEMS_ASSIGNED",
      label: "No menu items assigned",
      nextAction: "Assign approved catalog items to this function.",
      tone: "critical",
    });
  }
  if (input.unpricedItemCount > 0) {
    warnings.push({
      code: "UNPRICED_ITEMS",
      label: `${input.unpricedItemCount} item${input.unpricedItemCount === 1 ? "" : "s"} without a usable price`,
      nextAction: "Add a unit price or a manual total so the estimate is complete.",
      tone: "warning",
    });
  }
  if (input.guarantee === null && input.attendance === null) {
    warnings.push({
      code: "NO_GUARANTEE",
      label: "No guarantee or attendance",
      nextAction: "Record the guaranteed headcount before the venue cutoff.",
      tone: "warning",
    });
  }
  if (!input.location) {
    warnings.push({
      code: "NO_LOCATION",
      label: "No location set",
      nextAction: "Assign a room so setup and service can be staged.",
      tone: "warning",
    });
  }
  if (input.openRequirementCount > 0) {
    warnings.push({
      code: "OPEN_SAFETY_REQUIREMENTS",
      label: `${input.openRequirementCount} open dietary or allergen requirement${input.openRequirementCount === 1 ? "" : "s"}`,
      nextAction: "Verify accommodations against the assigned menu items.",
      tone: "critical",
    });
  }
  if (input.approvalsPending > 0) {
    warnings.push({
      code: "BUDGET_APPROVAL_PENDING",
      label: `${input.approvalsPending} budget line${input.approvalsPending === 1 ? "" : "s"} awaiting approval`,
      nextAction: "Route the linked budget lines for approval.",
      tone: "warning",
    });
  }

  return warnings;
}

/**
 * Readiness is defined once, here, for F&B functions:
 * - blocked: a prerequisite is missing that stops the function from being planned at all;
 * - needsWork: actionable but incomplete;
 * - ready: no outstanding warnings.
 */
function readinessFor(warnings: FnbFunctionWarning[]): FnbFunctionReadinessState {
  if (warnings.some((warning) => warning.tone === "critical")) return "blocked";
  if (warnings.length > 0) return "needsWork";
  return "ready";
}

/**
 * Reads every F&B function for an event and derives the planner rollups.
 *
 * Callers must have already asserted event access; this function does not authorize.
 */
export async function getEventFnbPlanner(eventId: string): Promise<FnbEventPlannerPayload> {
  const prisma = getPrisma();

  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) {
    throw new FnbEventPlannerError("Event not found", 404, "EVENT_NOT_FOUND");
  }

  const rows = await prisma.matrixRow.findMany({
    where: { eventId, archivedAt: null },
    orderBy: [{ dayDate: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      dayDate: true,
      startTime: true,
      endTime: true,
      roomName: true,
      sessionName: true,
      attendance: true,
      mealPeriod: true,
      fnbTaxPercent: true,
      fnbServiceChargePercent: true,
      sessionFoodService: { select: { headcount: true, serviceType: true } },
      sessionSpeakerAssignments: { select: { speakerId: true } },
      fnbRequirements: {
        select: { id: true, kind: true, quantity: true, disposition: true },
      },
      fnbCatalogAssignments: {
        where: { catalogItem: { eventId, archivedAt: null } },
        orderBy: [{ createdAt: "asc" }],
        include: {
          catalogItem: { include: { claims: { orderBy: [{ kind: "asc" }, { code: "asc" }] } } },
          budgetLineItem: true,
          taxes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        },
      },
    },
  });

  const functions: FnbFunctionRecord[] = rows
    .filter(qualifiesAsFnbFunction)
    .map((row) => {
      const assignmentRecords = row.fnbCatalogAssignments.map((assignment) =>
        toSessionFnbAssignmentRecord({
          ...assignment,
          session: {
            fnbTaxPercent: row.fnbTaxPercent,
            fnbServiceChargePercent: row.fnbServiceChargePercent,
          },
        }),
      );

      const guarantee = row.sessionFoodService?.headcount ?? null;
      const forecastAttendance = guarantee ?? row.attendance;
      const calculation = calculateFnbPlanCost({
        assignments: assignmentRecords.map((assignment) => assignment.calculation),
        forecastAttendance,
      });

      const budgetLines = row.fnbCatalogAssignments
        .map((assignment) => assignment.budgetLineItem)
        .filter((line): line is NonNullable<typeof line> => Boolean(line));
      const budgetedCents = budgetLines.length > 0
        ? budgetLines.reduce((total, line) => total + line.forecastCents, 0)
        : null;
      const approvalsPending = budgetLines.filter((line) => line.approval === "PENDING").length;

      // "Open" means the planner still owes an action. Complete and explicitly not-needed
      // requirements are settled and must not inflate the outstanding count.
      const openRequirements = row.fnbRequirements.filter(
        (requirement) =>
          requirement.disposition !== RequirementDisposition.COMPLETE &&
          requirement.disposition !== RequirementDisposition.NOT_NEEDED,
      );
      // Accommodations are a headcount of servings, distinct from the number of requirements.
      const accommodationCount = openRequirements.reduce(
        (total, requirement) => total + (requirement.quantity ?? 0),
        0,
      );

      const startTime = clockTime(row.startTime);
      const endTime = clockTime(row.endTime);
      const location = row.roomName?.trim() || null;

      const warnings = buildWarnings({
        assignedItemCount: assignmentRecords.length,
        unpricedItemCount: calculation.unpricedItemCount,
        guarantee,
        attendance: row.attendance,
        startTime,
        endTime,
        location,
        openRequirementCount: openRequirements.filter(
          (requirement) => requirement.kind !== FnbRequirementKind.ACCESSIBILITY,
        ).length,
        approvalsPending,
      });

      return {
        sessionId: row.id,
        name: row.sessionName?.trim() || fnbFunctionTypeLabel(row.mealPeriod),
        date: isoDate(row.dayDate),
        startTime,
        endTime,
        type: row.mealPeriod && row.mealPeriod !== MealPeriod.NONE ? row.mealPeriod : null,
        typeLabel: fnbFunctionTypeLabel(
          row.mealPeriod && row.mealPeriod !== MealPeriod.NONE ? row.mealPeriod : null,
        ),
        location,
        // A function that carries speakers is a content session that also serves food; one
        // without them is a standalone F&B function.
        isSessionLinked: row.sessionSpeakerAssignments.length > 0,
        attendance: row.attendance,
        guarantee,
        assignedItemCount: assignmentRecords.length,
        unpricedItemCount: calculation.unpricedItemCount,
        taxPercent: decimalToFixed(row.fnbTaxPercent),
        serviceChargePercent: decimalToFixed(row.fnbServiceChargePercent),
        calculation,
        budgetedCents,
        budgetVarianceCents:
          budgetedCents === null ? null : calculation.totalEstimatedCents - budgetedCents,
        approvalsPending,
        openRequirementCount: openRequirements.length,
        accommodationCount,
        readiness: readinessFor(warnings),
        warnings,
        href: sessionFnbHref(eventId, row.id),
      } satisfies FnbFunctionRecord;
    });

  return {
    eventId,
    functions,
    totals: buildEventTotals(functions),
    costByDay: buildCostByDay(functions),
    costByType: buildCostByType(functions),
    generatedAt: new Date().toISOString(),
  };
}

export type CreateFnbFunctionInput = {
  /** Attach F&B to an existing Run of Show session. Omit to create a standalone function. */
  sessionId?: unknown;
  name?: unknown;
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  type?: unknown;
  location?: unknown;
  attendance?: unknown;
  guarantee?: unknown;
  serviceStyle?: unknown;
};

const MEAL_PERIOD_VALUES = new Set<string>(Object.values(MealPeriod));

function parseFunctionType(value: unknown): MealPeriod {
  if (typeof value !== "string" || !value.trim()) return MealPeriod.OTHER;
  const upper = value.trim().toUpperCase();
  return MEAL_PERIOD_VALUES.has(upper) ? (upper as MealPeriod) : MealPeriod.OTHER;
}

function parseOptionalCount(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new FnbEventPlannerError(`${field} must be a non-negative whole number`, 400, "INVALID_INPUT");
  }
  return parsed;
}

function parseOptionalTrimmed(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Creates an F&B function.
 *
 * A content session is never required: when `sessionId` is omitted this creates a standalone
 * `MatrixRow` through the canonical `createMatrixRow` path (which also writes session activity).
 * When `sessionId` is supplied the existing Run of Show session is marked as an F&B function
 * instead of duplicating it.
 *
 * Callers must have already asserted event *write* access.
 */
export async function createEventFnbFunction(
  eventId: string,
  input: CreateFnbFunctionInput,
  actor: { id: string },
): Promise<{ sessionId: string; created: boolean }> {
  const prisma = getPrisma();
  const type = parseFunctionType(input.type);
  const guarantee = parseOptionalCount(input.guarantee, "guarantee");
  const attendance = parseOptionalCount(input.attendance, "attendance");
  const serviceStyle = parseOptionalTrimmed(input.serviceStyle);
  const linkedSessionId = parseOptionalTrimmed(input.sessionId);

  let sessionId: string;
  let created: boolean;

  if (linkedSessionId) {
    const existing = await prisma.matrixRow.findFirst({
      where: { id: linkedSessionId, eventId, archivedAt: null },
      select: { id: true, sessionName: true, mealPeriod: true },
    });
    if (!existing) {
      throw new FnbEventPlannerError("Session not found for this event", 404, "SESSION_NOT_FOUND");
    }
    await prisma.matrixRow.update({
      where: { id: existing.id },
      data: {
        mealPeriod: type,
        ...(attendance === null ? {} : { attendance }),
      },
    });
    await recordEventActivity(prisma, {
      eventId,
      actor: { kind: "USER", userId: actor.id },
      module: "RUN_OF_SHOW",
      action: "UPDATED",
      entityType: "MatrixRow",
      entityId: existing.id,
      entityLabel: existing.sessionName ?? "Session",
      message: `Session marked as a ${fnbFunctionTypeLabel(type)} F&B function`,
      changes: [
        {
          field: "mealPeriod",
          label: "Function type",
          from: existing.mealPeriod ?? null,
          to: type,
        },
      ],
    });
    sessionId = existing.id;
    created = false;
  } else {
    const name = parseOptionalTrimmed(input.name);
    if (!name) {
      throw new FnbEventPlannerError("name is required for a standalone function", 400, "INVALID_INPUT");
    }
    const date = parseOptionalTrimmed(input.date);
    if (!date) {
      throw new FnbEventPlannerError("date is required for a standalone function", 400, "INVALID_INPUT");
    }

    // createMatrixRow owns validation (times, room resolution, sort order) and audit logging.
    const row = await createMatrixRow(
      eventId,
      {
        date,
        startTime: parseOptionalTrimmed(input.startTime) ?? undefined,
        endTime: parseOptionalTrimmed(input.endTime) ?? undefined,
        room: parseOptionalTrimmed(input.location) ?? undefined,
        sessionName: name,
        attendance: attendance ?? undefined,
        meal: type,
      },
      actor,
    );
    sessionId = row.id;
    created = true;
  }

  if (guarantee !== null) {
    // SessionFoodService is the durable guarantee record; `serviceType` mirrors the meal period
    // so exports and readiness read a consistent value.
    await prisma.sessionFoodService.upsert({
      where: { sessionId },
      create: { sessionId, serviceType: type, serviceStyle, headcount: guarantee },
      update: { serviceType: type, serviceStyle, headcount: guarantee },
    });
    await recordEventActivity(prisma, {
      eventId,
      actor: { kind: "USER", userId: actor.id },
      module: "RUN_OF_SHOW",
      action: "UPDATED",
      entityType: "SessionFoodService",
      entityId: sessionId,
      entityLabel: fnbFunctionTypeLabel(type),
      message: `F&B guarantee set to ${guarantee.toLocaleString()}`,
      changes: [{ field: "headcount", label: "Guarantee", from: null, to: String(guarantee) }],
    });
  }

  return { sessionId, created };
}

export function buildEventTotals(functions: FnbFunctionRecord[]): FnbEventTotals {
  const budgetedFunctions = functions.filter((entry) => entry.budgetedCents !== null);
  const budgetedCents = budgetedFunctions.length > 0
    ? budgetedFunctions.reduce((total, entry) => total + (entry.budgetedCents ?? 0), 0)
    : null;

  // Cost per person is a weighted average over covered headcount, not a mean of per-function
  // rates: a 500-person lunch and a 10-person break must not carry equal weight. Functions with
  // no headcount are excluded from both sides of the ratio rather than being charged to the
  // people we do know about, which would silently inflate the rate.
  const covered = functions.reduce(
    (acc, entry) => {
      const headcount = entry.guarantee ?? entry.attendance;
      if (headcount === null || headcount <= 0) return acc;
      return {
        people: acc.people + headcount,
        cents: acc.cents + entry.calculation.totalEstimatedCents,
        functionCount: acc.functionCount + 1,
      };
    },
    { people: 0, cents: 0, functionCount: 0 },
  );

  const totalEstimatedCents = functions.reduce(
    (total, entry) => total + entry.calculation.totalEstimatedCents,
    0,
  );

  return {
    functionCount: functions.length,
    sessionLinkedFunctionCount: functions.filter((entry) => entry.isSessionLinked).length,
    independentFunctionCount: functions.filter((entry) => !entry.isSessionLinked).length,
    subtotalCents: functions.reduce((total, entry) => total + entry.calculation.subtotalCents, 0),
    taxCents: functions.reduce((total, entry) => total + entry.calculation.taxCents, 0),
    serviceChargeCents: functions.reduce(
      (total, entry) => total + entry.calculation.serviceChargeCents,
      0,
    ),
    additionalTaxCents: functions.reduce(
      (total, entry) => total + entry.calculation.additionalTaxCents,
      0,
    ),
    totalEstimatedCents,
    budgetedCents,
    budgetVarianceCents: budgetedCents === null ? null : totalEstimatedCents - budgetedCents,
    averageCostPerPersonCents:
      covered.people > 0 ? Math.round(covered.cents / covered.people) : null,
    costPerPersonFunctionCount: covered.functionCount,
    costPerPersonExcludedFunctionCount: functions.length - covered.functionCount,
    assignedItemCount: functions.reduce((total, entry) => total + entry.assignedItemCount, 0),
    unpricedItemCount: functions.reduce((total, entry) => total + entry.unpricedItemCount, 0),
    readyCount: functions.filter((entry) => entry.readiness === "ready").length,
    needsWorkCount: functions.filter((entry) => entry.readiness === "needsWork").length,
    blockedCount: functions.filter((entry) => entry.readiness === "blocked").length,
    approvalsPending: functions.reduce((total, entry) => total + entry.approvalsPending, 0),
    openRequirementCount: functions.reduce(
      (total, entry) => total + entry.openRequirementCount,
      0,
    ),
    accommodationCount: functions.reduce((total, entry) => total + entry.accommodationCount, 0),
  };
}

export function buildCostByDay(functions: FnbFunctionRecord[]): FnbCostByDay[] {
  const byDay = new Map<string, FnbCostByDay>();
  for (const entry of functions) {
    const current = byDay.get(entry.date) ?? {
      date: entry.date,
      functionCount: 0,
      totalEstimatedCents: 0,
    };
    current.functionCount += 1;
    current.totalEstimatedCents += entry.calculation.totalEstimatedCents;
    byDay.set(entry.date, current);
  }
  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function buildCostByType(functions: FnbFunctionRecord[]): FnbCostByType[] {
  const byType = new Map<string, FnbCostByType>();
  for (const entry of functions) {
    const key = entry.type ?? "UNSPECIFIED";
    const current = byType.get(key) ?? {
      type: entry.type,
      typeLabel: entry.typeLabel,
      functionCount: 0,
      totalEstimatedCents: 0,
    };
    current.functionCount += 1;
    current.totalEstimatedCents += entry.calculation.totalEstimatedCents;
    byType.set(key, current);
  }
  return Array.from(byType.values()).sort(
    (a, b) => b.totalEstimatedCents - a.totalEstimatedCents || a.typeLabel.localeCompare(b.typeLabel),
  );
}
