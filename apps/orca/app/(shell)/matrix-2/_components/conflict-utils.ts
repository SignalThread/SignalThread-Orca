import { Matrix2Conflict, Matrix2Session } from "./types";

export type Matrix2ConflictMap = Map<string, Matrix2Conflict[]>;

const ROOM_OVERLAP: Matrix2Conflict["type"] = "ROOM_OVERLAP";
const SPEAKER_DOUBLE_BOOKED: Matrix2Conflict["type"] = "SPEAKER_DOUBLE_BOOKED";
const ROOM_CAPACITY_EXCEEDED: Matrix2Conflict["type"] = "ROOM_CAPACITY_EXCEEDED";

export function toMinutes(timeValue: string): number | null {
  const match = timeValue.trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes: number): string {
  const normalized = Math.max(0, Math.min(24 * 60, totalMinutes));
  const hours = Math.floor(normalized / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (normalized % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatTimeLabel(timeValue: string): string {
  const minutes = toMinutes(timeValue);
  if (minutes === null) return timeValue;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

export function formatDateLabel(dateValue: string): string {
  const parsed = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

export function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

export function normalizeListInput(value: string): string[] {
  return value
    .split(/[\n,;|]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function buildEncodedNotes(input: {
  sessionType: string;
  speakers: string[];
  staffAssigned: string[];
  foodAndBeverage: string[];
  notes: string;
}): string {
  const lines: string[] = [];

  if (input.sessionType.trim()) {
    lines.push(`Session Type: ${input.sessionType.trim()}`);
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
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push(freeformNotes);
  }

  return lines.join("\n").trim();
}

export function detectMatrix2Conflicts(sessions: Matrix2Session[]): {
  conflicts: Matrix2Conflict[];
  bySession: Matrix2ConflictMap;
} {
  const conflicts: Matrix2Conflict[] = [];
  const bySession: Matrix2ConflictMap = new Map();

  const datedSessions = sessions.map((session) => {
    const startMinutes = toMinutes(session.startTime) ?? 0;
    const endMinutes = toMinutes(session.endTime) ?? startMinutes + 30;
    const normalizedRoomName = session.roomName.trim().toLowerCase();
    const isUnassignedRoom = !session.roomId && normalizedRoomName === "unassigned";
    return {
      session,
      startMinutes,
      endMinutes: Math.max(endMinutes, startMinutes + 1),
      roomKey: isUnassignedRoom ? "" : normalizedRoomName,
      speakerKeys: session.speakers.map((speaker) => speaker.trim().toLowerCase()).filter(Boolean),
    };
  });

  for (let index = 0; index < datedSessions.length; index += 1) {
    const current = datedSessions[index];

    if (
      current.session.expectedAttendance !== null &&
      current.session.roomCapacity !== null &&
      current.session.expectedAttendance > current.session.roomCapacity
    ) {
      const conflict: Matrix2Conflict = {
        id: `capacity:${current.session.id}`,
        type: ROOM_CAPACITY_EXCEEDED,
        severity: "warning",
        sessionIds: [current.session.id],
        message: `Expected attendance (${current.session.expectedAttendance}) exceeds room capacity (${current.session.roomCapacity}).`,
        roomName: current.session.roomName,
      };

      conflicts.push(conflict);
      pushConflict(bySession, current.session.id, conflict);
    }

    for (let otherIndex = index + 1; otherIndex < datedSessions.length; otherIndex += 1) {
      const candidate = datedSessions[otherIndex];

      if (current.session.date !== candidate.session.date) continue;
      if (!rangesOverlap(current.startMinutes, current.endMinutes, candidate.startMinutes, candidate.endMinutes)) {
        continue;
      }

      if (current.roomKey && current.roomKey === candidate.roomKey) {
        const roomConflict: Matrix2Conflict = {
          id: `room:${current.session.id}:${candidate.session.id}`,
          type: ROOM_OVERLAP,
          severity: "error",
          sessionIds: [current.session.id, candidate.session.id],
          message: `Room overlap in ${current.session.roomName} (${current.session.startTime}-${current.session.endTime} and ${candidate.session.startTime}-${candidate.session.endTime}).`,
          roomName: current.session.roomName,
        };

        conflicts.push(roomConflict);
        pushConflict(bySession, current.session.id, roomConflict);
        pushConflict(bySession, candidate.session.id, roomConflict);
      }

      if (current.roomKey && current.roomKey === candidate.roomKey) continue;
      if (current.speakerKeys.length === 0 || candidate.speakerKeys.length === 0) continue;

      const candidateSpeakerSet = new Set(candidate.speakerKeys);
      for (const currentSpeakerKey of current.speakerKeys) {
        if (!candidateSpeakerSet.has(currentSpeakerKey)) continue;

        const speakerDisplay =
          current.session.speakers.find((speaker) => speaker.trim().toLowerCase() === currentSpeakerKey) ??
          candidate.session.speakers.find((speaker) => speaker.trim().toLowerCase() === currentSpeakerKey) ??
          currentSpeakerKey;

        const speakerConflict: Matrix2Conflict = {
          id: `speaker:${current.session.id}:${candidate.session.id}:${currentSpeakerKey}`,
          type: SPEAKER_DOUBLE_BOOKED,
          severity: "error",
          sessionIds: [current.session.id, candidate.session.id],
          message: `${speakerDisplay} is double-booked across overlapping sessions.`,
          speakerName: speakerDisplay,
        };

        conflicts.push(speakerConflict);
        pushConflict(bySession, current.session.id, speakerConflict);
        pushConflict(bySession, candidate.session.id, speakerConflict);
      }
    }
  }

  return {
    conflicts,
    bySession,
  };
}

export function visibleMatrix2Conflicts(
  conflicts: Matrix2Conflict[],
  options: { roomSetAndSeatingAvailable: boolean },
): Matrix2Conflict[] {
  if (options.roomSetAndSeatingAvailable) return conflicts;
  return conflicts.filter(
    (conflict) => conflict.type !== ROOM_CAPACITY_EXCEEDED && conflict.type !== ROOM_OVERLAP,
  );
}

export function visibleMatrix2ConflictMap(
  bySession: Matrix2ConflictMap,
  options: { roomSetAndSeatingAvailable: boolean },
): Matrix2ConflictMap {
  if (options.roomSetAndSeatingAvailable) return bySession;

  const visibleBySession: Matrix2ConflictMap = new Map();
  for (const [sessionId, conflicts] of bySession.entries()) {
    const visibleConflicts = visibleMatrix2Conflicts(conflicts, options);
    if (visibleConflicts.length > 0) {
      visibleBySession.set(sessionId, visibleConflicts);
    }
  }
  return visibleBySession;
}

function pushConflict(map: Matrix2ConflictMap, sessionId: string, conflict: Matrix2Conflict): void {
  const current = map.get(sessionId) ?? [];
  current.push(conflict);
  map.set(sessionId, current);
}

export function sessionSearchText(session: Matrix2Session): string {
  return [
    session.title,
    session.roomName,
    session.sessionType,
    session.speakers.join(" "),
    session.avRequirements.join(" "),
    session.foodAndBeverage.join(" "),
    session.staffAssigned.join(" "),
    session.notes,
  ]
    .join(" ")
    .trim()
    .toLowerCase();
}

/** Default visible operating day when no sessions exist. Session days derive from actual scheduled times. */
const DEFAULT_TIMELINE_START_MINUTES = 9 * 60;
const DEFAULT_TIMELINE_END_MINUTES = 18 * 60;
const SESSION_TIMELINE_PADDING_MINUTES = 30;

export function buildTimeWindow(sessions: Matrix2Session[]): {
  startMinutes: number;
  endMinutes: number;
  ticks: number[];
} {
  if (sessions.length === 0) {
    return {
      startMinutes: DEFAULT_TIMELINE_START_MINUTES,
      endMinutes: DEFAULT_TIMELINE_END_MINUTES,
      ticks: Array.from(
        { length: (DEFAULT_TIMELINE_END_MINUTES - DEFAULT_TIMELINE_START_MINUTES) / 60 + 1 },
        (_, index) => DEFAULT_TIMELINE_START_MINUTES + index * 60,
      ),
    };
  }

  let earliest = 24 * 60;
  let latest = 0;

  for (const session of sessions) {
    const start = toMinutes(session.startTime) ?? 0;
    const end = toMinutes(session.endTime) ?? start + 30;
    earliest = Math.min(earliest, start);
    latest = Math.max(latest, end);
  }

  const startMinutes = Math.max(0, Math.floor((earliest - SESSION_TIMELINE_PADDING_MINUTES) / 60) * 60);
  let endMinutes = Math.min(24 * 60, Math.ceil((latest + SESSION_TIMELINE_PADDING_MINUTES) / 60) * 60);

  if (endMinutes <= startMinutes) {
    endMinutes = Math.min(24 * 60, startMinutes + 60);
  }

  const ticks: number[] = [];
  for (let cursor = startMinutes; cursor <= endMinutes; cursor += 60) {
    ticks.push(cursor);
  }

  return {
    startMinutes,
    endMinutes,
    ticks,
  };
}

export function conflictSummary(conflicts: Matrix2Conflict[] | undefined): {
  hasError: boolean;
  hasWarning: boolean;
  total: number;
} {
  if (!conflicts || conflicts.length === 0) {
    return { hasError: false, hasWarning: false, total: 0 };
  }

  return {
    hasError: conflicts.some((conflict) => conflict.severity === "error"),
    hasWarning: conflicts.some((conflict) => conflict.severity === "warning"),
    total: conflicts.length,
  };
}
