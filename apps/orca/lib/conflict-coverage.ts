/**
 * Conflict check coverage.
 *
 * The conflict surface used to report "No conflicts detected from current Run of Show data",
 * which reads as a comprehensive all-clear. It is not one: only a bounded set of rules exists, they run
 * over the sessions currently loaded (one date at a time on the board), and several inputs are
 * silently skipped. This module describes exactly what ran, over what, and what could not be
 * verified, so an empty result is honest instead of reassuring.
 *
 * It is pure and derives its report from the same session list the detector consumes.
 */

export type ConflictCheckStatus = "passed" | "found" | "limited" | "unsupported";

export type ConflictCheckReport = {
  id: string;
  rule: string;
  /** What the rule looks for, in a planner's words. */
  description: string;
  status: ConflictCheckStatus;
  /** How many records the rule was actually able to evaluate. */
  evaluatedCount: number;
  findingCount: number;
  /** Records the rule could not evaluate, and why. Never silently dropped. */
  exclusions: Array<{ reason: string; count: number }>;
};

export type ConflictCoverageReport = {
  checks: ConflictCheckReport[];
  evaluatedSessionCount: number;
  /** The record set the run covered, so "no conflicts" cannot be mistaken for event-wide. */
  scopeLabel: string;
  passedCheckCount: number;
  limitedCheckCount: number;
  totalFindingCount: number;
  /** True when at least one check could not run completely; blocks a green all-clear. */
  hasLimitations: boolean;
  evaluatedAt: string;
};

type CoverageSession = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  roomId: string | null;
  roomName: string;
  expectedAttendance: number | null;
  roomCapacity: number | null;
  speakers: string[];
  staffAssigned?: string[];
  staffAssignments?: Array<{ personId: string }>;
  avRequirements?: string[];
  foodAndBeverage?: string[];
};

type CoverageConflict = {
  type: string;
};

const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

function hasUsableTimes(session: CoverageSession): boolean {
  return TIME_PATTERN.test(session.startTime.trim()) && TIME_PATTERN.test(session.endTime.trim());
}

function hasUsableRoom(session: CoverageSession): boolean {
  const normalized = session.roomName.trim().toLowerCase();
  return Boolean(session.roomId) || (normalized.length > 0 && normalized !== "unassigned");
}

function exclusion(reason: string, count: number): Array<{ reason: string; count: number }> {
  return count > 0 ? [{ reason, count }] : [];
}

/**
 * Rules the product does not evaluate yet. They are reported as unsupported rather than
 * omitted, because a check a user assumes ran is worse than one they know did not.
 */
const UNSUPPORTED_CHECKS: Array<{ id: string; rule: string; description: string; reason: string }> = [
  {
    id: "av-resource-collision",
    rule: "AV and resource collisions",
    description: "The same AV resource committed to overlapping sessions.",
    reason: "AV requirements record what is needed, not which physical unit is allocated.",
  },
  {
    id: "room-turn",
    rule: "Setup, turn, and transition time",
    description: "Back-to-back sessions in one room with no time to reset.",
    reason: "Setup and teardown durations are not recorded per session.",
  },
  {
    id: "fnb-service-timing",
    rule: "F&B service timing and guarantees",
    description: "Service windows that clash, and functions missing a guarantee.",
    reason: "Evaluated in the F&B Planner readiness view, not in this conflict run.",
  },
  {
    id: "dependencies-approvals",
    rule: "Dependencies and approvals",
    description: "Sessions blocked by an unapproved prerequisite.",
    reason: "Approval state is not part of the Run of Show conflict inputs.",
  },
];

export function buildConflictCoverageReport(input: {
  sessions: CoverageSession[];
  conflicts: CoverageConflict[];
  scopeLabel: string;
  evaluatedAt: string;
}): ConflictCoverageReport {
  const { sessions, conflicts, scopeLabel, evaluatedAt } = input;

  const timedSessions = sessions.filter(hasUsableTimes);
  const untimedCount = sessions.length - timedSessions.length;
  const roomedSessions = timedSessions.filter(hasUsableRoom);
  const unroomedCount = timedSessions.length - roomedSessions.length;
  const speakerSessions = timedSessions.filter((session) => session.speakers.length > 0);
  const staffedSessions = timedSessions.filter((session) => (session.staffAssignments?.length ?? 0) > 0);
  const capacitySessions = sessions.filter(
    (session) => session.expectedAttendance !== null && session.roomCapacity !== null,
  );
  const capacityUnknownCount = sessions.length - capacitySessions.length;

  const findingsOfType = (type: string) => conflicts.filter((conflict) => conflict.type === type).length;

  function statusFor(findingCount: number, evaluatedCount: number, hasExclusions: boolean): ConflictCheckStatus {
    if (findingCount > 0) return "found";
    // A rule that evaluated nothing has not proved anything.
    if (evaluatedCount === 0) return "limited";
    return hasExclusions ? "limited" : "passed";
  }

  const roomExclusions = [
    ...exclusion("Session has no usable start or end time", untimedCount),
    ...exclusion("Session has no assigned room", unroomedCount),
  ];
  const speakerExclusions = [
    ...exclusion("Session has no usable start or end time", untimedCount),
    ...exclusion(
      "Session has no named speakers",
      timedSessions.length - speakerSessions.length,
    ),
  ];
  const capacityExclusions = exclusion(
    "Expected attendance or room capacity is not recorded",
    capacityUnknownCount,
  );
  const staffExclusions = [
    ...exclusion("Session has no usable start or end time", untimedCount),
    ...exclusion("Session has no structured staff assignments", timedSessions.length - staffedSessions.length),
  ];

  const checks: ConflictCheckReport[] = [
    {
      id: "room-overlap",
      rule: "Room double-booking",
      description: "Two sessions scheduled in the same room at overlapping times.",
      status: statusFor(findingsOfType("ROOM_OVERLAP"), roomedSessions.length, roomExclusions.length > 0),
      evaluatedCount: roomedSessions.length,
      findingCount: findingsOfType("ROOM_OVERLAP"),
      exclusions: roomExclusions,
    },
    {
      id: "speaker-double-booked",
      rule: "Speaker double-booking",
      description: "The same speaker assigned to overlapping sessions in different rooms.",
      status: statusFor(
        findingsOfType("SPEAKER_DOUBLE_BOOKED"),
        speakerSessions.length,
        speakerExclusions.length > 0,
      ),
      evaluatedCount: speakerSessions.length,
      findingCount: findingsOfType("SPEAKER_DOUBLE_BOOKED"),
      exclusions: speakerExclusions,
    },
    {
      id: "staff-double-booked",
      rule: "Staff double-booking",
      description: "The same staff or vendor record assigned to overlapping sessions.",
      status: statusFor(
        findingsOfType("STAFF_DOUBLE_BOOKED"),
        staffedSessions.length,
        staffExclusions.length > 0,
      ),
      evaluatedCount: staffedSessions.length,
      findingCount: findingsOfType("STAFF_DOUBLE_BOOKED"),
      exclusions: staffExclusions,
    },
    {
      id: "room-capacity",
      rule: "Room capacity",
      description: "Expected attendance above the assigned room's capacity.",
      status: statusFor(
        findingsOfType("ROOM_CAPACITY_EXCEEDED"),
        capacitySessions.length,
        capacityExclusions.length > 0,
      ),
      evaluatedCount: capacitySessions.length,
      findingCount: findingsOfType("ROOM_CAPACITY_EXCEEDED"),
      exclusions: capacityExclusions,
    },
    ...UNSUPPORTED_CHECKS.map((check) => ({
      id: check.id,
      rule: check.rule,
      description: check.description,
      status: "unsupported" as const,
      evaluatedCount: 0,
      findingCount: 0,
      exclusions: [{ reason: check.reason, count: sessions.length }],
    })),
  ];

  return {
    checks,
    evaluatedSessionCount: sessions.length,
    scopeLabel,
    passedCheckCount: checks.filter((check) => check.status === "passed").length,
    limitedCheckCount: checks.filter(
      (check) => check.status === "limited" || check.status === "unsupported",
    ).length,
    totalFindingCount: checks.reduce((total, check) => total + check.findingCount, 0),
    hasLimitations: checks.some(
      (check) => check.status === "limited" || check.status === "unsupported",
    ),
    evaluatedAt,
  };
}

/**
 * The empty-state sentence. It never claims a clean event: it names how many checks passed,
 * over what record set, and how many could not be completed.
 */
export function conflictCoverageSummary(report: ConflictCoverageReport): string {
  if (report.totalFindingCount > 0) {
    return `${report.totalFindingCount} conflict${report.totalFindingCount === 1 ? "" : "s"} found across ${report.scopeLabel}.`;
  }
  if (report.evaluatedSessionCount === 0) {
    return `No sessions were available to check in ${report.scopeLabel}. Nothing has been verified.`;
  }
  const base = `No conflicts found across ${report.passedCheckCount} completed check${report.passedCheckCount === 1 ? "" : "s"} over ${report.scopeLabel}.`;
  return report.limitedCheckCount > 0
    ? `${base} ${report.limitedCheckCount} check${report.limitedCheckCount === 1 ? " was" : "s were"} incomplete or unsupported.`
    : base;
}
