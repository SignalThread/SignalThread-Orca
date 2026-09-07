export type SessionReadinessStatus =
  | "ready"
  | "needs_info"
  | "blocked"
  | "not_started"
  | "not_needed";

export type SessionReadinessModuleId =
  | "details"
  | "speakers"
  | "av"
  | "fnb"
  | "staffing"
  | "supplies"
  | "signage"
  | "accessibility"
  | "vendor-production"
  | "safety-escalation"
  | "room-set"
  | "seating"
  | "conflicts"
  | "notes-activity";

export type SessionReadinessTone = "success" | "warning" | "danger" | "neutral" | "muted";

export type SessionReadinessMetadata = {
  label: string;
  priority: number;
  description: string;
  tone: SessionReadinessTone;
  badgeClassName: string;
};

export type SessionModuleReadiness = {
  moduleId: SessionReadinessModuleId;
  status: SessionReadinessStatus;
  reasons: string[];
};

export type SessionAttentionPriority = "blocked" | "conflict" | "required_missing" | "warning";

export type SessionAttentionItem = {
  id: string;
  moduleId: SessionReadinessModuleId;
  targetModuleId: SessionReadinessModuleId;
  title: string;
  description: string;
  actionLabel: string;
  priority: SessionAttentionPriority;
};

export type SessionReadinessResult = {
  modules: Record<SessionReadinessModuleId, SessionModuleReadiness>;
  attentionItems: SessionAttentionItem[];
};

export const SESSION_ATTENTION_PRIORITY_ORDER: Record<SessionAttentionPriority, number> = {
  blocked: 400,
  conflict: 300,
  required_missing: 200,
  warning: 100,
};

export type SessionModuleApplicabilityInput = {
  sessionType?: string | null;
  hasSpeakerRequirements?: boolean;
  hasAvRequirements?: boolean;
  hasFnbRequirements?: boolean;
};

export type SessionModuleApplicability = {
  speakersRequired: boolean;
  avRequired: boolean;
  fnbRequired: boolean;
};

/** Canonical session-type applicability used by every readiness surface. */
export function deriveSessionModuleApplicability(input: SessionModuleApplicabilityInput): SessionModuleApplicability {
  const sessionType = input.sessionType?.trim().toLowerCase() ?? "";
  const isPresentedSession = /\b(keynote|panel|workshop|breakout|presentation|fireside|roundtable)\b/.test(sessionType);
  const isMealSession = /\b(breakfast|lunch|dinner|meal|coffee\s*break|break|reception)\b/.test(sessionType);

  return {
    speakersRequired: isPresentedSession || input.hasSpeakerRequirements === true,
    avRequired: isPresentedSession || input.hasAvRequirements === true,
    fnbRequired: isMealSession || input.hasFnbRequirements === true,
  };
}

export const SESSION_READINESS_STATUS_ORDER: SessionReadinessStatus[] = [
  "blocked",
  "needs_info",
  "not_started",
  "ready",
  "not_needed",
];

export const SESSION_READINESS_METADATA: Record<SessionReadinessStatus, SessionReadinessMetadata> = {
  blocked: {
    label: "Blocked",
    priority: 50,
    description: "A known hard problem prevents this module from being ready.",
    tone: "danger",
    badgeClassName: "border-rose-200 bg-rose-50 text-rose-700",
  },
  needs_info: {
    label: "Needs info",
    priority: 40,
    description: "Required data is missing, incomplete, or needs clarification.",
    tone: "warning",
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-800",
  },
  not_started: {
    label: "Not started",
    priority: 30,
    description: "The module applies to this session, but work has not begun.",
    tone: "neutral",
    badgeClassName: "border-slate-200 bg-slate-50 text-slate-600",
  },
  ready: {
    label: "Ready",
    priority: 20,
    description: "Enough complete data exists for this module.",
    tone: "success",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  not_needed: {
    label: "Not needed",
    priority: 10,
    description: "This module explicitly does not apply to the session.",
    tone: "muted",
    badgeClassName: "border-slate-200 bg-slate-50 text-slate-400",
  },
};

export type ConservativeReadinessInput = {
  applies?: boolean;
  hasHardProblem?: boolean;
  hasRequiredData?: boolean;
  hasStarted?: boolean;
  isComplete?: boolean;
};

export function deriveConservativeReadinessStatus(input: ConservativeReadinessInput): SessionReadinessStatus {
  if (input.applies === false) return "not_needed";
  if (input.hasHardProblem) return "blocked";
  if (input.hasRequiredData !== true) return "needs_info";
  if (input.hasStarted === false) return "not_started";
  if (input.isComplete === false) return "needs_info";
  return "ready";
}

function result(
  moduleId: SessionReadinessModuleId,
  status: SessionReadinessStatus,
  reasons: string[],
): SessionModuleReadiness {
  return { moduleId, status, reasons };
}

function compactReasons(reasons: Array<string | false | null | undefined>): string[] {
  return reasons.filter((reason): reason is string => Boolean(reason));
}

function hasItems<T>(items: readonly T[] | null | undefined): boolean {
  return Array.isArray(items) && items.length > 0;
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasHardProblems(problems: readonly unknown[] | null | undefined): boolean {
  return hasItems(problems);
}

function hasAssignedRoom(roomId: string | null | undefined, roomName: string | null | undefined): boolean {
  if (hasText(roomId)) return true;
  const normalizedRoomName = typeof roomName === "string" ? roomName.trim().toLowerCase() : "";
  if (!normalizedRoomName) return false;
  return normalizedRoomName !== "unassigned" && normalizedRoomName !== "tbd" && normalizedRoomName !== "to be determined";
}

export type DetailsReadinessInput = {
  title?: string | null;
  sessionType?: string | null;
  roomId?: string | null;
  roomName?: string | null;
  roomAvailable?: boolean | null;
  startTime?: string | null;
  endTime?: string | null;
  hardProblems?: readonly unknown[];
};

function parseTimeMinutes(value: string | null | undefined): number | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(normalized);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function deriveDetailsReadiness(input: DetailsReadinessInput): SessionModuleReadiness {
  const hasTitle = hasText(input.title);
  const hasSessionType = hasText(input.sessionType);
  const hasRoom = hasAssignedRoom(input.roomId, input.roomName);
  const hasStartTime = hasText(input.startTime);
  const hasEndTime = hasText(input.endTime);
  const hasAllCoreData = hasTitle && hasSessionType && hasRoom && hasStartTime && hasEndTime;
  const startMinutes = parseTimeMinutes(input.startTime);
  const endMinutes = parseTimeMinutes(input.endTime);
  const invalidTimeRange = hasAllCoreData && (
    startMinutes === null ||
    endMinutes === null ||
    endMinutes <= startMinutes
  );
  const unavailableRoom = hasRoom && input.roomAvailable === false;
  const hasHardProblem = hasHardProblems(input.hardProblems) || unavailableRoom || invalidTimeRange;
  const status: SessionReadinessStatus = hasHardProblem
    ? "blocked"
    : hasAllCoreData
      ? "ready"
      : "needs_info";

  return result("details", status, compactReasons([
    hasHardProblems(input.hardProblems) && "A known session validity blocker must be resolved.",
    unavailableRoom && "The selected room is unavailable.",
    invalidTimeRange && "End time must be after start time.",
    !hasTitle && "Session title is missing.",
    !hasSessionType && "Session type is missing.",
    !hasRoom && "A room must be assigned.",
    !hasStartTime && "Start time is missing.",
    !hasEndTime && "End time is missing.",
    status === "ready" && "Core session details are complete and valid.",
  ]));
}

export type SpeakerReadinessInput = {
  applies?: boolean;
  required?: boolean;
  expectedCount?: number | null;
  speakers?: readonly {
    id?: string | null;
    speakerId?: string | null;
    name?: string | null;
    status?: string | null;
  }[];
  hardProblems?: readonly unknown[];
  hasStarted?: boolean;
};

export function deriveSpeakersReadiness(input: SpeakerReadinessInput): SessionModuleReadiness {
  const speakers = input.speakers ?? [];
  const explicitlyNotNeeded = input.applies === false || input.required === false;
  const hasHardProblem = hasHardProblems(input.hardProblems);
  const hasStarted = input.hasStarted ?? hasItems(speakers);
  const expectedCount = input.expectedCount ?? (input.required ? 1 : null);
  const hasEnoughSpeakers = expectedCount === null ? hasItems(speakers) : speakers.length >= expectedCount;
  const hasIncompleteSpeaker = speakers.some((speaker) => {
    const status = speaker.status?.toUpperCase();
    return (
      !hasText(speaker.id ?? speaker.speakerId) ||
      !hasText(speaker.name) ||
      status === "NEEDS_INFO" ||
      status === "CANCELLED"
    );
  });

  const status = deriveConservativeReadinessStatus({
    applies: explicitlyNotNeeded ? false : true,
    hasHardProblem,
    hasRequiredData: hasEnoughSpeakers && !hasIncompleteSpeaker,
    hasStarted,
  });

  return result("speakers", status, compactReasons([
    hasHardProblem && "Speaker conflict or cancellation is blocking the session.",
    !explicitlyNotNeeded && !hasEnoughSpeakers && "Required speaker assignments are missing.",
    !explicitlyNotNeeded && hasIncompleteSpeaker && "One or more speaker assignments need complete confirmed details.",
    status === "ready" && "Speaker assignments are complete enough for readiness.",
    status === "not_needed" && "Speakers are explicitly not needed for this session.",
  ]));
}

export type RequirementReadinessItem = {
  id?: string | null;
  label?: string | null;
  quantity?: number | null;
};

export type AvReadinessInput = {
  applies?: boolean;
  required?: boolean;
  requirements?: readonly RequirementReadinessItem[];
  hardProblems?: readonly unknown[];
  hasStarted?: boolean;
};

export type OperationalRequirementReadinessInput = {
  applies?: boolean;
  required?: boolean;
  requirements?: readonly RequirementReadinessItem[];
  hardProblems?: readonly unknown[];
  hasStarted?: boolean;
};

export type OptionalSessionModuleReadinessInput = {
  enabled?: boolean;
  hasStarted?: boolean;
  allNotNeeded?: boolean;
  hasIncompleteActiveRequirement?: boolean;
};

export function deriveOptionalSessionModuleReadiness(
  moduleId: "accessibility" | "vendor-production" | "safety-escalation",
  input: OptionalSessionModuleReadinessInput,
): SessionModuleReadiness {
  const label = moduleId === "accessibility" ? "Accessibility" : moduleId === "vendor-production" ? "Vendor & Production" : "Safety & Escalation";
  const status = deriveConservativeReadinessStatus({
    applies: input.enabled === true && input.allNotNeeded !== true,
    hasRequiredData: input.hasIncompleteActiveRequirement !== true,
    hasStarted: input.hasStarted ?? false,
  });
  return result(moduleId, status, compactReasons([
    status === "not_needed" && `${label} is not enabled for this session.`,
    input.hasIncompleteActiveRequirement && `An active ${label.toLowerCase()} requirement needs an owner or confirmation.`,
    status === "not_started" && `${label} is enabled but no work has started.`,
    status === "ready" && `${label} requirements are ready.`,
  ]));
}

export function deriveOperationalRequirementReadiness(
  moduleId: "supplies" | "signage",
  input: OperationalRequirementReadinessInput,
): SessionModuleReadiness {
  const requirements = input.requirements ?? [];
  const explicitlyNotNeeded = input.applies === false || input.required === false;
  const hasHardProblem = hasHardProblems(input.hardProblems);
  const hasStarted = input.hasStarted ?? hasItems(requirements);
  const hasCompleteRequirements = hasItems(requirements) && requirements.every((item) =>
    (hasText(item.id) || hasText(item.label)) &&
    (item.quantity === null || item.quantity === undefined || (Number.isInteger(item.quantity) && item.quantity > 0)),
  );
  const label = moduleId === "supplies" ? "Supplies" : "Signage";
  const status = deriveConservativeReadinessStatus({
    applies: explicitlyNotNeeded ? false : true,
    hasHardProblem,
    hasRequiredData: input.required ? hasCompleteRequirements : hasStarted ? hasCompleteRequirements : true,
    hasStarted,
  });

  return result(moduleId, status, compactReasons([
    hasHardProblem && `A known ${label.toLowerCase()} blocker must be resolved.`,
    input.required && !hasCompleteRequirements && `Required ${label.toLowerCase()} details are missing.`,
    hasStarted && !hasCompleteRequirements && `Started ${label.toLowerCase()} requirements need complete detail.`,
    status === "not_started" && `${label} work applies but has not started.`,
    status === "ready" && `${label} requirements are complete enough for readiness.`,
    status === "not_needed" && `${label} is explicitly not needed for this session.`,
  ]));
}

export function deriveAvReadiness(input: AvReadinessInput): SessionModuleReadiness {
  const requirements = input.requirements ?? [];
  const explicitlyNotNeeded = input.applies === false || input.required === false;
  const hasHardProblem = hasHardProblems(input.hardProblems);
  const hasStarted = input.hasStarted ?? hasItems(requirements);
  const hasCompleteRequirements = hasItems(requirements) && requirements.every((item) => hasText(item.id) || hasText(item.label));

  const status = deriveConservativeReadinessStatus({
    applies: explicitlyNotNeeded ? false : true,
    hasHardProblem,
    hasRequiredData: input.required ? hasCompleteRequirements : hasStarted ? hasCompleteRequirements : true,
    hasStarted,
  });

  return result("av", status, compactReasons([
    hasHardProblem && "A known AV blocker must be resolved.",
    input.required && !hasCompleteRequirements && "Required AV details are missing.",
    hasStarted && !hasCompleteRequirements && "Started AV requirements need complete detail.",
    status === "not_started" && "AV work applies but has not started.",
    status === "ready" && "AV requirements are complete enough for readiness.",
    status === "not_needed" && "AV is explicitly not needed for this session.",
  ]));
}

export type FnbReadinessInput = {
  applies?: boolean;
  serviceRequired?: boolean;
  expectedAttendance?: number | null;
  foodService?: {
    serviceType?: string | null;
    headcount?: number | null;
  } | null;
  catalogAssignments?: readonly unknown[];
  selectedRequirements?: readonly RequirementReadinessItem[];
  hardProblems?: readonly unknown[];
  hasStarted?: boolean;
  safetyAlert?: {
    severity: "BLOCKING" | "ATTENTION" | "CLEAR";
    reasonCodes?: readonly string[];
  } | null;
};

export function deriveFnbReadiness(input: FnbReadinessInput): SessionModuleReadiness {
  const selectedRequirements = input.selectedRequirements ?? [];
  const hasCoverage =
    hasText(input.foodService?.serviceType) ||
    hasItems(input.catalogAssignments) ||
    hasItems(selectedRequirements);
  const headcount = input.foodService?.headcount ?? input.expectedAttendance ?? null;
  const explicitlyNotNeeded = input.applies === false || input.serviceRequired === false;
  const hasSafetyBlocker = input.safetyAlert?.severity === "BLOCKING";
  const hasSafetyAttention = input.safetyAlert?.severity === "ATTENTION";
  const hasHardProblem = hasHardProblems(input.hardProblems) || hasSafetyBlocker;
  const hasStarted = input.hasStarted ?? Boolean(hasCoverage || headcount !== null);
  const hasRequiredData = input.serviceRequired
    ? hasCoverage && headcount !== null
    : headcount !== null && !hasCoverage
      ? false
      : hasCoverage
        ? headcount !== null
        : true;

  const baseStatus = deriveConservativeReadinessStatus({
    applies: explicitlyNotNeeded ? false : true,
    hasHardProblem,
    hasRequiredData,
    hasStarted,
  });
  const status = hasSafetyAttention && baseStatus === "ready" ? "needs_info" : baseStatus;

  return result("fnb", status, compactReasons([
    hasHardProblem && "A known F&B blocker must be resolved.",
    hasSafetyBlocker && "Dietary or accessibility safety has a blocking issue.",
    hasSafetyAttention && "Dietary or accessibility safety needs review.",
    input.serviceRequired && headcount === null && "F&B headcount is required.",
    input.serviceRequired && !hasCoverage && "Required F&B menu coverage is missing.",
    headcount !== null && !hasCoverage && "Attendance exists, but no F&B coverage is selected.",
    hasCoverage && headcount === null && "F&B coverage needs a headcount.",
    status === "not_started" && "F&B applies but no work has started.",
    status === "ready" && "F&B coverage and headcount are complete enough for readiness.",
    status === "not_needed" && "F&B is explicitly not needed for this session.",
  ]));
}

export type StaffingReadinessInput = {
  applies?: boolean;
  required?: boolean;
  expectedCount?: number | null;
  assignments?: readonly {
    id?: string | null;
    personId?: string | null;
    name?: string | null;
    role?: string | null;
    assignmentRole?: string | null;
  }[];
  hardProblems?: readonly unknown[];
  hasStarted?: boolean;
};

export function deriveStaffingReadiness(input: StaffingReadinessInput): SessionModuleReadiness {
  const assignments = input.assignments ?? [];
  const explicitlyNotNeeded = input.applies === false || input.required === false;
  const hasHardProblem = hasHardProblems(input.hardProblems);
  const hasStarted = input.hasStarted ?? hasItems(assignments);
  const expectedCount = input.expectedCount ?? (input.required ? 1 : null);
  const hasEnoughStaff = expectedCount === null ? hasItems(assignments) : assignments.length >= expectedCount;
  const hasIncompleteAssignment = assignments.some((assignment) => {
    return !hasText(assignment.id ?? assignment.personId) || !hasText(assignment.name) || !hasText(assignment.assignmentRole ?? assignment.role);
  });

  const status = deriveConservativeReadinessStatus({
    applies: explicitlyNotNeeded ? false : true,
    hasHardProblem,
    hasRequiredData: input.required || hasStarted ? hasEnoughStaff && !hasIncompleteAssignment : true,
    hasStarted,
  });

  return result("staffing", status, compactReasons([
    hasHardProblem && "A known staffing blocker must be resolved.",
    (input.required || hasStarted) && !hasEnoughStaff && "Required staffing assignments are missing.",
    hasIncompleteAssignment && "One or more staffing assignments need complete role details.",
    status === "not_started" && "Staffing applies but no work has started.",
    status === "ready" && "Staffing assignments are complete enough for readiness.",
    status === "not_needed" && "Staffing is explicitly not needed for this session.",
  ]));
}

export type RoomSetReadinessInput = {
  applies?: boolean;
  roomRequired?: boolean;
  roomId?: string | null;
  roomName?: string | null;
  roomSetup?: string | null;
  roomCapacity?: number | null;
  expectedAttendance?: number | null;
  layoutExists?: boolean;
  hardProblems?: readonly unknown[];
  hasStarted?: boolean;
};

export function deriveRoomSetReadiness(input: RoomSetReadinessInput): SessionModuleReadiness {
  const hasRoom = hasText(input.roomId) || hasText(input.roomName);
  const hasSetup = hasText(input.roomSetup) || input.layoutExists === true;
  const capacityBlocked =
    typeof input.expectedAttendance === "number" &&
    typeof input.roomCapacity === "number" &&
    input.expectedAttendance > input.roomCapacity;
  const explicitlyNotNeeded = input.applies === false || input.roomRequired === false;
  const hasHardProblem = hasHardProblems(input.hardProblems) || capacityBlocked;
  const hasStarted = input.hasStarted ?? Boolean(hasRoom || hasSetup);
  const hasRequiredData = input.roomRequired || hasStarted ? hasRoom && hasSetup : true;

  const status = deriveConservativeReadinessStatus({
    applies: explicitlyNotNeeded ? false : true,
    hasHardProblem,
    hasRequiredData,
    hasStarted,
  });

  return result("room-set", status, compactReasons([
    capacityBlocked && "Expected attendance exceeds room capacity.",
    hasHardProblems(input.hardProblems) && "A known room set blocker must be resolved.",
    !hasRoom && "A room must be assigned.",
    hasRoom && !hasSetup && "Room setup or layout details are missing.",
    status === "not_started" && "Room set applies but no work has started.",
    status === "ready" && "Room assignment and setup are complete enough for readiness.",
    status === "not_needed" && "Room set is explicitly not needed for this session.",
  ]));
}

export type SeatingReadinessInput = {
  applies?: boolean;
  seatingRequired?: boolean;
  expectedAttendance?: number | null;
  seatingPlanExists?: boolean;
  assignedSeatCount?: number | null;
  unassignedAttendeeCount?: number | null;
  hardProblems?: readonly unknown[];
  hasStarted?: boolean;
};

export function deriveSeatingReadiness(input: SeatingReadinessInput): SessionModuleReadiness {
  const explicitlyNotNeeded = input.applies === false || input.seatingRequired === false || input.expectedAttendance === 0;
  const hasHardProblem = hasHardProblems(input.hardProblems);
  const assignedSeatCount = input.assignedSeatCount ?? 0;
  const unassignedAttendeeCount = input.unassignedAttendeeCount ?? 0;
  const hasStarted = input.hasStarted ?? Boolean(input.seatingPlanExists || assignedSeatCount > 0);
  const expectedAttendance = input.expectedAttendance ?? null;
  const hasCompleteAssignments =
    input.seatingPlanExists === true &&
    (expectedAttendance === null ? assignedSeatCount > 0 : assignedSeatCount >= expectedAttendance) &&
    unassignedAttendeeCount === 0;

  const status = deriveConservativeReadinessStatus({
    applies: explicitlyNotNeeded ? false : true,
    hasHardProblem,
    hasRequiredData: input.seatingRequired || hasStarted ? hasCompleteAssignments : true,
    hasStarted,
  });

  return result("seating", status, compactReasons([
    hasHardProblem && "A known seating blocker must be resolved.",
    input.seatingPlanExists !== true && "A seating plan is missing.",
    input.seatingPlanExists === true && !hasCompleteAssignments && "Seating assignments are incomplete.",
    status === "not_started" && "Seating applies but no work has started.",
    status === "ready" && "Seating assignments are complete enough for readiness.",
    status === "not_needed" && "Seating is explicitly not needed for this session.",
  ]));
}

export type ConflictReadinessInput = {
  applies?: boolean;
  checked?: boolean;
  conflicts?: readonly {
    id?: string | null;
    type?: string | null;
    message?: string | null;
    severity?: string | null;
  }[];
};

export function deriveConflictsReadiness(input: ConflictReadinessInput): SessionModuleReadiness {
  const conflicts = input.conflicts ?? [];
  const hasBlockingConflict = conflicts.some((conflict) => {
    const severity = conflict.severity?.toLowerCase();
    return severity === "error" || severity === "blocked" || severity === "blocker";
  });
  const hasNonBlockingConflict = conflicts.length > 0 && !hasBlockingConflict;

  const status = deriveConservativeReadinessStatus({
    applies: input.applies === false ? false : true,
    hasHardProblem: hasBlockingConflict,
    hasRequiredData: !hasNonBlockingConflict,
    hasStarted: input.checked !== false,
  });

  return result("conflicts", status, compactReasons([
    hasBlockingConflict && "One or more blocking conflicts exist.",
    hasNonBlockingConflict && "One or more conflicts need review.",
    input.checked === false && "Conflict checks have not run.",
    status === "ready" && "No conflicts are currently detected.",
    status === "not_needed" && "Conflict checks are explicitly not needed for this session.",
  ]));
}

export type NotesActivityReadinessInput = {
  applies?: boolean;
  required?: boolean;
  notes?: string | null;
  activityCount?: number | null;
  hardProblems?: readonly unknown[];
  hasStarted?: boolean;
};

export function deriveNotesActivityReadiness(input: NotesActivityReadinessInput): SessionModuleReadiness {
  const hasNotes = hasText(input.notes);
  const hasActivity = (input.activityCount ?? 0) > 0;
  const explicitlyNotNeeded = input.applies === false || input.required === false;
  const hasHardProblem = hasHardProblems(input.hardProblems);
  const hasStarted = input.hasStarted ?? Boolean(hasNotes || hasActivity);
  const hasRequiredData = input.required ? hasNotes : true;

  const status = deriveConservativeReadinessStatus({
    applies: explicitlyNotNeeded ? false : true,
    hasHardProblem,
    hasRequiredData,
    hasStarted,
  });

  return result("notes-activity", status, compactReasons([
    hasHardProblem && "A known notes or activity blocker must be resolved.",
    input.required && !hasNotes && "Required planner notes are missing.",
    status === "not_started" && "Notes/activity applies but has not started.",
    status === "ready" && "Notes/activity has enough information for readiness.",
    status === "not_needed" && "Notes/activity is explicitly not needed for this session.",
  ]));
}

export type SessionReadinessModulesInput = {
  details: DetailsReadinessInput;
  speakers: SpeakerReadinessInput;
  av: AvReadinessInput;
  fnb: FnbReadinessInput;
  staffing: StaffingReadinessInput;
  accessibility?: OptionalSessionModuleReadinessInput;
  vendorProduction?: OptionalSessionModuleReadinessInput;
  safetyEscalation?: OptionalSessionModuleReadinessInput;
  supplies?: OperationalRequirementReadinessInput;
  signage?: OperationalRequirementReadinessInput;
  roomSet: RoomSetReadinessInput;
  seating: SeatingReadinessInput;
  conflicts: ConflictReadinessInput;
  notesActivity: NotesActivityReadinessInput;
};

export type SessionReadinessOptions = {
  /** Room Set and Seating are not work to complete when the product gate hides them. */
  includeRoomSetAndSeating?: boolean;
};

function attentionActionForModule(
  moduleId: SessionReadinessModuleId,
  reason: string,
): Pick<SessionAttentionItem, "title" | "actionLabel" | "targetModuleId"> {
  if (moduleId === "details") {
    return { title: reason, actionLabel: reason.toLowerCase().includes("room") ? "Assign room" : "Complete details", targetModuleId: "details" };
  }
  if (moduleId === "speakers") return { title: "Required speakers are missing", actionLabel: "Assign", targetModuleId: "speakers" };
  if (moduleId === "av") return { title: "Required AV details are missing", actionLabel: "Confirm AV", targetModuleId: "av" };
  if (moduleId === "fnb") {
    const needsHeadcount = reason.toLowerCase().includes("headcount");
    return {
      title: needsHeadcount ? "F&B headcount is required" : "Required F&B menu coverage is missing",
      actionLabel: needsHeadcount ? "Add headcount" : "Build menu",
      targetModuleId: "fnb",
    };
  }
  if (moduleId === "staffing") return { title: "Required staffing is incomplete", actionLabel: "Assign", targetModuleId: "staffing" };
  if (moduleId === "accessibility") return { title: reason, actionLabel: "Review accessibility", targetModuleId: "accessibility" };
  if (moduleId === "vendor-production") return { title: reason, actionLabel: "Review vendors", targetModuleId: "vendor-production" };
  if (moduleId === "safety-escalation") return { title: reason, actionLabel: "Review safety", targetModuleId: "safety-escalation" };
  if (moduleId === "supplies") return { title: "Required supplies are incomplete", actionLabel: "Review supplies", targetModuleId: "supplies" };
  if (moduleId === "signage") return { title: "Required signage is incomplete", actionLabel: "Review signage", targetModuleId: "signage" };
  if (moduleId === "room-set") return { title: reason, actionLabel: "Open Room Set", targetModuleId: "room-set" };
  if (moduleId === "seating") return { title: reason, actionLabel: "Open Room Set", targetModuleId: "seating" };
  if (moduleId === "notes-activity") return { title: reason, actionLabel: "Add notes", targetModuleId: "notes-activity" };
  return { title: reason, actionLabel: "Resolve conflict", targetModuleId: "conflicts" };
}

function conflictTitle(conflict: NonNullable<ConflictReadinessInput["conflicts"]>[number]): string {
  if (conflict.type === "ROOM_CAPACITY_EXCEEDED") return "Attendance exceeds room capacity";
  if (conflict.type === "SPEAKER_DOUBLE_BOOKED") return "Speaker scheduling conflict";
  if (conflict.type === "STAFF_DOUBLE_BOOKED") return "Staff scheduling conflict";
  if (conflict.type === "ROOM_OVERLAP") return "Room scheduling conflict";
  return "Active session conflict";
}

export function deriveSessionReadiness(
  input: SessionReadinessModulesInput,
  options: SessionReadinessOptions = {},
): SessionReadinessResult {
  const includeRoomSetAndSeating = options.includeRoomSetAndSeating ?? true;
  const moduleList = [
    deriveDetailsReadiness(input.details),
    deriveSpeakersReadiness(input.speakers),
    deriveAvReadiness(input.av),
    deriveFnbReadiness(input.fnb),
    deriveStaffingReadiness(input.staffing),
    deriveOptionalSessionModuleReadiness("accessibility", input.accessibility ?? { enabled: false }),
    deriveOptionalSessionModuleReadiness("vendor-production", input.vendorProduction ?? { enabled: false }),
    deriveOptionalSessionModuleReadiness("safety-escalation", input.safetyEscalation ?? { enabled: false }),
    deriveOperationalRequirementReadiness("supplies", input.supplies ?? { required: false }),
    deriveOperationalRequirementReadiness("signage", input.signage ?? { required: false }),
    deriveRoomSetReadiness({
      ...input.roomSet,
      applies: includeRoomSetAndSeating ? input.roomSet.applies : false,
    }),
    deriveSeatingReadiness({
      ...input.seating,
      applies: includeRoomSetAndSeating ? input.seating.applies : false,
    }),
    deriveConflictsReadiness(input.conflicts),
    deriveNotesActivityReadiness(input.notesActivity),
  ];
  const modules = moduleList.reduce(
    (byModuleId, moduleReadiness) => {
      byModuleId[moduleReadiness.moduleId] = moduleReadiness;
      return byModuleId;
    },
    {} as Record<SessionReadinessModuleId, SessionModuleReadiness>,
  );
  const attentionItems: SessionAttentionItem[] = [];

  for (const [index, conflict] of (input.conflicts.conflicts ?? []).entries()) {
    const severity = conflict.severity?.toLowerCase();
    const blocking = severity === "error" || severity === "blocked" || severity === "blocker";
    attentionItems.push({
      id: conflict.id?.trim() || `conflict-${index}`,
      moduleId: "conflicts",
      targetModuleId: conflict.type === "ROOM_CAPACITY_EXCEEDED" && includeRoomSetAndSeating ? "room-set" : "conflicts",
      title: conflictTitle(conflict),
      description: conflict.message?.trim() || "Review and resolve this active session conflict.",
      actionLabel: "Resolve conflict",
      priority: blocking ? "blocked" : "conflict",
    });
  }

  const requiredByModule: Partial<Record<SessionReadinessModuleId, boolean>> = {
    details: true,
    speakers: input.speakers.required === true,
    av: input.av.required === true,
    fnb: input.fnb.serviceRequired === true,
    staffing: input.staffing.required === true,
    supplies: input.supplies?.required === true,
    signage: input.signage?.required === true,
    "room-set": includeRoomSetAndSeating && input.roomSet.roomRequired === true,
    seating: includeRoomSetAndSeating && input.seating.seatingRequired === true,
    "notes-activity": input.notesActivity.required === true,
  };

  for (const moduleReadiness of moduleList) {
    if (moduleReadiness.moduleId === "conflicts" || moduleReadiness.status === "ready" || moduleReadiness.status === "not_needed") continue;
    const blocked = moduleReadiness.status === "blocked";
    const requiredMissing = requiredByModule[moduleReadiness.moduleId] === true &&
      (moduleReadiness.status === "needs_info" || moduleReadiness.status === "not_started");
    if (!blocked && !requiredMissing) continue;

    const reason = moduleReadiness.moduleId === "fnb"
      ? moduleReadiness.reasons.find((entry) => entry.toLowerCase().includes("headcount")) ?? moduleReadiness.reasons[0]
      : moduleReadiness.reasons[0];
    const description = reason || SESSION_READINESS_METADATA[moduleReadiness.status].description;
    const action = attentionActionForModule(moduleReadiness.moduleId, description);
    attentionItems.push({
      id: `${moduleReadiness.moduleId}-${blocked ? "blocked" : "required-missing"}`,
      moduleId: moduleReadiness.moduleId,
      ...action,
      description,
      priority: blocked ? "blocked" : "required_missing",
    });
  }

  attentionItems.sort((left, right) =>
    SESSION_ATTENTION_PRIORITY_ORDER[right.priority] - SESSION_ATTENTION_PRIORITY_ORDER[left.priority],
  );

  return { modules, attentionItems };
}

export function deriveSessionModuleReadiness(
  input: SessionReadinessModulesInput,
  options: SessionReadinessOptions = {},
): Record<SessionReadinessModuleId, SessionModuleReadiness> {
  return deriveSessionReadiness(input, options).modules;
}
