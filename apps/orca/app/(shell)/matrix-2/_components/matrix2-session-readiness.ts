import {
  SESSION_READINESS_METADATA,
  deriveSessionModuleApplicability,
  deriveSessionModuleReadiness,
  type SessionModuleReadiness,
  type SessionReadinessModuleId,
  type SessionReadinessStatus,
} from "@/lib/session-readiness";
import { isRoomSetAndSeatingAvailable } from "@/config/features";
import type { Matrix2Conflict, Matrix2Session, Matrix2SessionAction } from "./types";

export type Matrix2ReadinessTone = "ready" | "attention" | "missing" | "neutral";

export type Matrix2ActionReadiness = {
  status: SessionReadinessStatus;
  tone: Matrix2ReadinessTone;
  label: string;
  count: number | null;
};

export type Matrix2ReadinessAction = Exclude<Matrix2SessionAction, "workspace">;
export type Matrix2SessionReadiness = Record<Matrix2ReadinessAction, Matrix2ActionReadiness>;

function selectedCount(primaryCount: number, fallbackCount: number): number {
  return primaryCount > 0 ? primaryCount : fallbackCount;
}

function isPlaceholderSpeakerName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized.length === 0 || normalized === "tbd" || normalized === "unassigned" || normalized === "to be determined";
}

function realSpeakerAssignments(session: Matrix2Session) {
  if (session.speakerAssignments.length > 0) {
    return session.speakerAssignments.filter((speaker) => !isPlaceholderSpeakerName(speaker.name));
  }

  return session.speakers
    .filter((name) => !isPlaceholderSpeakerName(name))
    .map((name, index) => ({
      speakerId: `legacy-speaker-${index}`,
      name,
      title: null,
      company: null,
      email: null,
      status: "CONFIRMED" as const,
    }));
}

function linkedRequirementItems(session: Matrix2Session, patterns: RegExp[]) {
  return session.requirementSelections
    .filter((selection) => {
      const linked = selection.linkedBudgetLineItem;
      const text = linked
        ? `${linked.category} ${linked.subcategory} ${linked.lineItem}`
        : selection.itemId;
      return patterns.some((pattern) => pattern.test(text));
    })
    .map((selection) => ({
      id: selection.itemId,
      label: selection.linkedBudgetLineItem?.lineItem ?? selection.itemId,
      quantity: selection.quantity,
    }));
}

function legacyRequirementItems(values: string[]) {
  return values
    .map((label, index) => ({ id: `legacy-requirement-${index}`, label, quantity: null }))
    .filter((item) => item.label.trim().length > 0);
}

function statusTone(status: SessionReadinessStatus): Matrix2ReadinessTone {
  if (status === "ready") return "ready";
  if (status === "blocked") return "missing";
  if (status === "needs_info" || status === "not_started") return "attention";
  return "neutral";
}

function labelForReadiness(readiness: SessionModuleReadiness): string {
  const metadata = SESSION_READINESS_METADATA[readiness.status];
  const reason = readiness.reasons[0];
  return reason ? `${metadata.label}: ${reason}` : metadata.label;
}

function actionReadiness(
  readiness: SessionModuleReadiness,
  count: number | null,
): Matrix2ActionReadiness {
  return {
    status: readiness.status,
    tone: statusTone(readiness.status),
    label: labelForReadiness(readiness),
    count,
  };
}

function moduleActionReadiness(
  modules: Record<SessionReadinessModuleId, SessionModuleReadiness>,
  action: SessionReadinessModuleId,
  count: number | null,
): Matrix2ActionReadiness {
  return actionReadiness(modules[action], count);
}

export function deriveMatrix2SessionReadiness(
  session: Matrix2Session,
  conflicts: Matrix2Conflict[],
): Matrix2SessionReadiness {
  const speakers = realSpeakerAssignments(session);
  const avRequirementItems = [
    ...session.avRequirementsStructured.map((requirement) => ({
      id: requirement.id,
      label: requirement.avType,
      quantity: requirement.quantity,
    })),
    ...legacyRequirementItems(session.avRequirements),
    ...linkedRequirementItems(session, [/\bav\b/i, /\baudio\b/i, /\bvisual\b/i, /\bprojection\b/i, /\bmicrophone\b/i]),
  ];
  const fnbRequirementItems = [
    ...legacyRequirementItems(session.foodAndBeverage),
    ...linkedRequirementItems(session, [/\bf&b\b/i, /\bfood\b/i, /\bbeverage\b/i, /\bcatering\b/i, /\bmeal\b/i]),
  ];
  const staffingAssignments = session.staffAssignments.length > 0
    ? session.staffAssignments
    : session.staffAssigned
      .filter((name) => name.trim().length > 0)
      .map((name, index) => ({
        personId: `legacy-staff-${index}`,
        name,
        role: "staff" as const,
        assignmentRole: name,
        company: null,
        email: null,
      }));
  const roomSetRequirementCount = linkedRequirementItems(session, [/\broom\b/i, /\bsetup\b/i, /\bfurniture\b/i]).length;
  const fnbCoverageCount = fnbRequirementItems.length + (session.foodService ? 1 : 0);
  const applicability = deriveSessionModuleApplicability({
    sessionType: session.sessionType,
    hasSpeakerRequirements: speakers.length > 0,
    hasAvRequirements: avRequirementItems.length > 0,
    hasFnbRequirements: fnbCoverageCount > 0,
  });

  const modules = deriveSessionModuleReadiness({
    details: {
      title: session.title,
      sessionType: session.sessionType,
      roomId: session.roomId,
      roomName: session.roomName,
      startTime: session.startTime,
      endTime: session.endTime,
    },
    speakers: {
      required: applicability.speakersRequired,
      speakers,
      hardProblems: conflicts.filter((conflict) => conflict.severity === "error" && conflict.type === "SPEAKER_DOUBLE_BOOKED"),
    },
    av: {
      required: applicability.avRequired,
      requirements: avRequirementItems,
    },
    fnb: {
      serviceRequired: applicability.fnbRequired,
      expectedAttendance: session.expectedAttendance,
      foodService: session.foodService,
      selectedRequirements: fnbRequirementItems,
      hasStarted: session.expectedAttendance !== null || fnbCoverageCount > 0,
    },
    staffing: {
      assignments: staffingAssignments,
      hasStarted: staffingAssignments.length > 0,
    },
    roomSet: {
      roomRequired: true,
      roomId: session.roomId,
      roomName: session.roomName,
      roomSetup: session.roomSetup,
      roomCapacity: session.roomCapacity,
      expectedAttendance: session.expectedAttendance,
      layoutExists: roomSetRequirementCount > 0,
      hardProblems: conflicts.filter((conflict) => conflict.severity === "error" && conflict.type === "ROOM_OVERLAP"),
      hasStarted: Boolean(session.roomId || session.roomName.trim() || session.roomSetup.trim() || roomSetRequirementCount > 0),
    },
    seating: {
      seatingRequired: session.expectedAttendance !== null ? true : undefined,
      expectedAttendance: session.expectedAttendance,
      hardProblems: conflicts.filter((conflict) => conflict.type === "ROOM_CAPACITY_EXCEEDED"),
      hasStarted: false,
    },
    conflicts: {
      conflicts,
    },
    notesActivity: {
      notes: session.notes,
    },
  }, {
    includeRoomSetAndSeating: isRoomSetAndSeatingAvailable(),
  });

  return {
    basics: moduleActionReadiness(modules, "details", null),
    speakers: moduleActionReadiness(modules, "speakers", speakers.length > 0 ? speakers.length : null),
    av: moduleActionReadiness(
      modules,
      "av",
      selectedCount(session.avRequirementsStructured.length, session.avRequirements.length) || null,
    ),
    fnb: moduleActionReadiness(modules, "fnb", fnbCoverageCount > 0 ? fnbCoverageCount : null),
    staffing: moduleActionReadiness(modules, "staffing", staffingAssignments.length > 0 ? staffingAssignments.length : null),
    "room-set": moduleActionReadiness(modules, "room-set", null),
    seating: moduleActionReadiness(modules, "seating", null),
    conflicts: moduleActionReadiness(modules, "conflicts", conflicts.length > 0 ? conflicts.length : null),
  };
}
