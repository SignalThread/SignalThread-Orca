import {
  BudgetSubmissionStatus,
  DeadlineStatus,
  DocumentStatus,
  TaskAssignmentRole,
  TaskStatus,
} from "@prisma/client";
import { assertEventAccessForUser, EventAccessError, type EventAccessUser } from "@/lib/event-access";
import {
  calendarDayDistanceToInstant,
  eventCalendarDayStart,
  getEventDateBoundaries,
  isInstantOverdue,
  type EventDateBoundaries,
} from "@/lib/event-time-boundaries";
import { getPrisma } from "@/lib/prisma";
import { computeSpeakerSessionConflicts, type SpeakerSessionSlot } from "@/lib/speaker-conflicts";

export type AttentionSeverity = "critical" | "warning" | "informational";

export type AttentionSourceReference = {
  entityType: string;
  entityId: string;
  label: string;
  field?: string;
  value?: string | number | boolean | null;
};

export type AttentionFindingCategory =
  | "conflict"
  | "overdue_task"
  | "missing_owner"
  | "deadline"
  | "approval"
  | "session_readiness"
  | "room_set"
  | "av"
  | "food_beverage"
  | "speaker"
  | "budget";

export type AttentionFinding = {
  id: string;
  eventId: string;
  category: AttentionFindingCategory;
  severity: AttentionSeverity;
  title: string;
  description: string;
  recommendedAction?: string;
  sourceReferences: AttentionSourceReference[];
};

export type EventAttentionResult = {
  eventId: string;
  generatedAt: string;
  findings: AttentionFinding[];
  summary: {
    total: number;
    critical: number;
    warning: number;
    informational: number;
  };
  support: {
    supportedChecks: string[];
    unsupportedChecks: string[];
    partialChecks: string[];
  };
  temporalContext: EventDateBoundaries;
};

export class EventAttentionError extends Error {
  status: number;
  reason?: string;

  constructor(message: string, status = 400, reason?: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}
const ACTIVE_TASK_STATUSES = [TaskStatus.OPEN, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED] as const;
const ACTIVE_DEADLINE_STATUSES = [DeadlineStatus.OPEN, DeadlineStatus.BLOCKED] as const;
const FNB_DEMAND_MEAL_PERIODS = ["BREAKFAST", "BREAK", "LUNCH", "RECEPTION", "DINNER", "OTHER"] as const;
const DEADLINE_LOOKAHEAD_DAYS = 14;

const SUPPORT = {
  supportedChecks: [
    "open_speaker_schedule_conflicts",
    "overdue_tasks",
    "tasks_without_owners",
    "upcoming_deadlines",
    "pending_document_approvals",
    "pending_budget_submissions",
    "incomplete_session_times",
    "missing_room_assignments",
    "missing_session_speakers",
    "missing_food_and_beverage_for_meal_sessions",
  ],
  partialChecks: [
    "upcoming_critical_deadlines",
    "pending_approvals_across_workflows",
    "incomplete_session_details",
    "room_set_assignment_only",
    "av_information",
    "speaker_information_by_session",
    "unapproved_budget_changes",
  ],
  unsupportedChecks: [
    "sessions_without_assigned_owners",
    "room_set_layout_completeness",
    "material_budget_variances",
    "speaker_profile_completeness_by_session",
  ],
} as const;

type AttentionPrisma = ReturnType<typeof getPrisma>;

function sessionLabel(session: { sessionName: string | null; dayDate: Date }): string {
  const name = session.sessionName?.trim() || "Untitled session";
  return `${name} (${session.dayDate.toISOString().slice(0, 10)})`;
}

function severityRank(severity: AttentionSeverity): number {
  return severity === "critical" ? 0 : severity === "warning" ? 1 : 2;
}

function categoryRank(category: AttentionFindingCategory): number {
  return [
    "conflict",
    "overdue_task",
    "deadline",
    "approval",
    "room_set",
    "session_readiness",
    "food_beverage",
    "speaker",
    "missing_owner",
    "av",
    "budget",
  ].indexOf(category);
}

function sortFindings(findings: AttentionFinding[]): AttentionFinding[] {
  return findings.sort((a, b) => {
    const severity = severityRank(a.severity) - severityRank(b.severity);
    if (severity !== 0) return severity;
    const category = categoryRank(a.category) - categoryRank(b.category);
    if (category !== 0) return category;
    const title = a.title.localeCompare(b.title);
    return title !== 0 ? title : a.id.localeCompare(b.id);
  });
}

function normalizeFindingText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * Canonical identity for one issue on one source record. Finding IDs remain the
 * stable client-facing identity, while this protects the result from duplicate
 * rows or future generation branches that describe the same source issue.
 */
export function attentionFindingDeduplicationKey(finding: AttentionFinding): string {
  const sources = finding.sourceReferences
    .map((source) => [source.entityType, source.entityId, source.field ?? ""].join(":"))
    .sort()
    .join("|");
  return [finding.eventId, finding.category, normalizeFindingText(finding.title), sources].join("\u001f");
}

/** Keep one stable finding per event/category/source/issue without collapsing distinct sessions. */
export function deduplicateAttentionFindings(findings: AttentionFinding[]): AttentionFinding[] {
  const byKey = new Map<string, AttentionFinding>();
  for (const finding of findings) {
    const key = attentionFindingDeduplicationKey(finding);
    const existing = byKey.get(key);
    if (!existing || finding.id.localeCompare(existing.id) < 0) {
      byKey.set(key, finding);
    }
  }
  return Array.from(byKey.values());
}

export function summarizeAttentionFindings(findings: AttentionFinding[]): EventAttentionResult["summary"] {
  return {
    total: findings.length,
    critical: findings.filter((finding) => finding.severity === "critical").length,
    warning: findings.filter((finding) => finding.severity === "warning").length,
    informational: findings.filter((finding) => finding.severity === "informational").length,
  };
}

/**
 * Read-only deterministic event analysis. AV absence, session ownership, room-set
 * layout completeness, and material budget variance are deliberately not emitted:
 * the current schema does not define enough semantics to make those findings true.
 */
export async function getEventAttention(
  eventId: string,
  user: EventAccessUser,
  options: { now?: Date; prisma?: AttentionPrisma } = {},
): Promise<EventAttentionResult> {
  try {
    await assertEventAccessForUser(eventId, user, "read");

    const prisma = options.prisma ?? getPrisma();
    const now = options.now ?? new Date();
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { timezone: true },
    });
    if (!event) throw new EventAttentionError("Event not found", 404);
    const temporalContext = getEventDateBoundaries(now, event.timezone);
    const lookaheadEnd = eventCalendarDayStart(temporalContext, DEADLINE_LOOKAHEAD_DAYS);

    const [tasks, deadlines, documents, budgetSubmissions, sessions, speakerAssignments] = await Promise.all([
      prisma.task.findMany({
        where: {
          eventId,
          status: { in: [...ACTIVE_TASK_STATUSES] },
        },
        select: {
          id: true,
          title: true,
          status: true,
          dueAt: true,
          assignments: { select: { role: true } },
        },
      }),
      prisma.deadline.findMany({
        where: {
          eventId,
          status: { in: [...ACTIVE_DEADLINE_STATUSES] },
          dueAt: { lte: lookaheadEnd },
        },
        orderBy: [{ dueAt: "asc" }, { id: "asc" }],
        select: { id: true, title: true, status: true, dueAt: true },
      }),
      prisma.document.findMany({
        where: { eventId, status: DocumentStatus.IN_REVIEW },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        select: { id: true, title: true, updatedAt: true },
      }),
      prisma.budgetSubmission.findMany({
        where: { budget: { eventId }, status: BudgetSubmissionStatus.SUBMITTED },
        orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
        select: { id: true, message: true, submittedAt: true },
      }),
      prisma.matrixRow.findMany({
        where: { eventId },
        orderBy: [{ dayDate: "asc" }, { startTime: "asc" }, { id: "asc" }],
        select: {
          id: true,
          sessionName: true,
          dayDate: true,
          roomId: true,
          room: { select: { id: true, eventId: true, name: true } },
          startTime: true,
          endTime: true,
          mealPeriod: true,
          sessionSpeakerAssignments: { select: { speakerId: true } },
          fnbCatalogAssignments: { select: { id: true } },
          sessionFoodService: { select: { id: true } },
        },
      }),
      prisma.sessionSpeakerAssignment.findMany({
        where: { session: { eventId }, speaker: { eventId } },
        select: {
          speaker: { select: { id: true, name: true } },
          session: {
            select: {
              id: true,
              sessionName: true,
              roomName: true,
              dayDate: true,
              startTime: true,
              endTime: true,
            },
          },
        },
      }),
    ]);

    const findings: AttentionFinding[] = [];
    const findingIds = new Set<string>();
    const addFinding = (finding: AttentionFinding) => {
      if (findingIds.has(finding.id)) return;
      findingIds.add(finding.id);
      findings.push(finding);
    };

    for (const task of tasks) {
      const taskSource: AttentionSourceReference = {
        entityType: "task",
        entityId: task.id,
        label: task.title,
      };
      if (task.dueAt && isInstantOverdue(task.dueAt, temporalContext)) {
        addFinding({
          id: `overdue_task:${task.id}`,
          eventId,
          category: "overdue_task",
          severity: task.status === TaskStatus.BLOCKED ? "critical" : "warning",
          title: `Overdue task: ${task.title}`,
          description: `This ${task.status.toLowerCase().replace("_", " ")} task was due ${task.dueAt.toISOString().slice(0, 10)}.`,
          recommendedAction: "Review the task status, owner, and due date.",
          sourceReferences: [{ ...taskSource, field: "dueAt", value: task.dueAt.toISOString() }],
        });
      }
      if (!task.assignments.some((assignment) => assignment.role === TaskAssignmentRole.OWNER)) {
        addFinding({
          id: `missing_owner:task:${task.id}`,
          eventId,
          category: "missing_owner",
          severity: "warning",
          title: `Task has no owner: ${task.title}`,
          description: "This active task has no assignment with the OWNER role.",
          recommendedAction: "Assign an event member as the task owner.",
          sourceReferences: [taskSource],
        });
      }
    }

    for (const deadline of deadlines) {
      const remaining = calendarDayDistanceToInstant(deadline.dueAt, temporalContext);
      const overdue = isInstantOverdue(deadline.dueAt, temporalContext);
      const severity: AttentionSeverity = deadline.status === DeadlineStatus.BLOCKED || overdue || remaining <= 3 ? "critical" : "warning";
      addFinding({
        id: `deadline:${deadline.id}`,
        eventId,
        category: "deadline",
        severity,
        title: deadline.status === DeadlineStatus.BLOCKED
          ? `Blocked deadline: ${deadline.title}`
          : overdue
            ? `Overdue deadline: ${deadline.title}`
            : `Upcoming deadline: ${deadline.title}`,
        description: deadline.status === DeadlineStatus.BLOCKED
          ? `This deadline is blocked and due ${deadline.dueAt.toISOString().slice(0, 10)}.`
          : overdue
            ? `This deadline passed at ${deadline.dueAt.toISOString()}.`
            : `This deadline is due ${deadline.dueAt.toISOString().slice(0, 10)} (${remaining} day${remaining === 1 ? "" : "s"}).`,
        recommendedAction: "Review the deadline status, dependency, and owner.",
        sourceReferences: [{ entityType: "deadline", entityId: deadline.id, label: deadline.title, field: "dueAt", value: deadline.dueAt.toISOString() }],
      });
    }

    for (const document of documents) {
      addFinding({
        id: `approval:document:${document.id}`,
        eventId,
        category: "approval",
        severity: "warning",
        title: `Document pending approval: ${document.title}`,
        description: `This document has been in review since at least ${document.updatedAt.toISOString().slice(0, 10)}.`,
        recommendedAction: "Review the document and record an approval decision.",
        sourceReferences: [{ entityType: "document", entityId: document.id, label: document.title, field: "status" }],
      });
    }

    for (const submission of budgetSubmissions) {
      const label = submission.message?.trim() || "Budget submission";
      addFinding({
        id: `approval:budget_submission:${submission.id}`,
        eventId,
        category: "budget",
        severity: "warning",
        title: `Budget submission pending approval: ${label}`,
        description: `This budget submission has awaited review since ${submission.submittedAt.toISOString().slice(0, 10)}.`,
        recommendedAction: "Review the submitted budget changes and record an approval decision.",
        sourceReferences: [{ entityType: "budget_submission", entityId: submission.id, label, field: "status" }],
      });
    }

    for (const session of sessions) {
      const label = sessionLabel(session);
      const source = { entityType: "matrix_row", entityId: session.id, label };
      if (!session.startTime || !session.endTime) {
        addFinding({
          id: `session_readiness:time:${session.id}`,
          eventId,
          category: "session_readiness",
          severity: "critical",
          title: `Session needs valid times: ${label}`,
          description: "This session is missing a start time or end time.",
          recommendedAction: "Add both a start time and an end time.",
          sourceReferences: [{ ...source, field: "startTime/endTime" }],
        });
      }
      if (!session.roomId || !session.room || session.room.eventId !== eventId) {
        addFinding({
          id: `room_set:room:${session.id}`,
          eventId,
          category: "room_set",
          severity: "critical",
          title: `Session needs a room: ${label}`,
          description: "This session does not have a valid room assignment for the event.",
          recommendedAction: "Assign an event room to this session.",
          sourceReferences: [{ ...source, field: "roomId" }],
        });
      }
      if (session.sessionSpeakerAssignments.length === 0) {
        addFinding({
          id: `speaker:session:${session.id}`,
          eventId,
          category: "speaker",
          severity: "warning",
          title: `Session needs a speaker: ${label}`,
          description: "This session has no assigned speaker records.",
          recommendedAction: "Assign a speaker or confirm that no speaker is required.",
          sourceReferences: [source],
        });
      }
      if (
        session.mealPeriod &&
        FNB_DEMAND_MEAL_PERIODS.includes(session.mealPeriod as (typeof FNB_DEMAND_MEAL_PERIODS)[number]) &&
        session.fnbCatalogAssignments.length === 0 &&
        !session.sessionFoodService
      ) {
        addFinding({
          id: `food_beverage:session:${session.id}`,
          eventId,
          category: "food_beverage",
          severity: "warning",
          title: `Session needs F&B details: ${label}`,
          description: `This ${session.mealPeriod.toLowerCase()} session has no food-service record or catalog assignment.`,
          recommendedAction: "Add food service or an F&B catalog assignment.",
          sourceReferences: [{ ...source, field: "mealPeriod" }],
        });
      }
    }

    const slots: SpeakerSessionSlot[] = speakerAssignments.map(({ speaker, session }) => ({
      speakerId: speaker.id,
      speakerName: speaker.name,
      sessionId: session.id,
      sessionName: session.sessionName,
      roomName: session.roomName,
      dayDate: session.dayDate.toISOString().slice(0, 10),
      startTime: session.startTime?.toISOString().slice(11, 16) ?? null,
      endTime: session.endTime?.toISOString().slice(11, 16) ?? null,
    }));
    const sessionLabelsById = new Map(sessions.map((session) => [session.id, sessionLabel(session)]));
    for (const conflict of computeSpeakerSessionConflicts(slots)) {
      addFinding({
        id: `conflict:${conflict.type}:${conflict.speakerId}:${[...conflict.sessionIds].sort().join(":")}`,
        eventId,
        category: "conflict",
        severity: conflict.type === "session_overlap" ? "critical" : "warning",
        title: conflict.type === "session_overlap" ? `Speaker scheduling conflict: ${conflict.speakerName}` : `Speaker transition risk: ${conflict.speakerName}`,
        description: conflict.description,
        recommendedAction: "Resolve the schedule conflict before confirming the affected sessions.",
        sourceReferences: conflict.sessionIds.map((sessionId) => ({
          entityType: "matrix_row",
          entityId: sessionId,
          label: sessionLabelsById.get(sessionId) ?? "Affected session",
          field: "startTime/endTime",
        })),
      });
    }

    const ordered = sortFindings(deduplicateAttentionFindings(findings));
    return {
      eventId,
      generatedAt: now.toISOString(),
      findings: ordered,
      summary: summarizeAttentionFindings(ordered),
      support: {
        supportedChecks: [...SUPPORT.supportedChecks],
        partialChecks: [...SUPPORT.partialChecks],
        unsupportedChecks: [...SUPPORT.unsupportedChecks],
      },
      temporalContext,
    };
  } catch (error) {
    if (error instanceof EventAccessError) {
      throw new EventAttentionError(error.message, error.status, error.reason);
    }
    if (error instanceof EventAttentionError) throw error;
    throw new EventAttentionError("Failed to analyze event attention", 500);
  }
}
