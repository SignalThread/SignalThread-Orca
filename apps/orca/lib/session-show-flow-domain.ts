export type ShowFlowTimingMode = "ABSOLUTE" | "OFFSET";

export type ShowFlowConflictCode =
  | "MISSING_TIME"
  | "INVALID_DURATION"
  | "OUT_OF_SESSION"
  | "GAP"
  | "OVERLAP"
  | "OVERRUN"
  | "ROOM_CONFLICT"
  | "SPEAKER_CONFLICT"
  | "STAFF_CONFLICT";

export type ShowFlowConflict = {
  code: ShowFlowConflictCode;
  severity: "BLOCKING" | "WARNING";
  message: string;
  itemIds: string[];
  otherSessionId?: string;
};

export type ShowFlowTimingCue = {
  id: string;
  sortOrder: number;
  timingMode: ShowFlowTimingMode;
  startTime: string | null;
  offsetMin: number | null;
  durationMin: number | null;
};

export type DerivedShowFlowCue<T extends ShowFlowTimingCue = ShowFlowTimingCue> = T & {
  effectiveStartTime: string | null;
  effectiveEndTime: string | null;
  effectiveStartMinute: number | null;
  effectiveEndMinute: number | null;
};

export function clockToMinute(value: string | null): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function minuteToClock(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const minuteOfDay = ((Math.trunc(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`;
}

export function deriveShowFlowCueTiming<T extends ShowFlowTimingCue>(
  cue: T,
  sessionStartTime: string | null,
): DerivedShowFlowCue<T> {
  const sessionStart = clockToMinute(sessionStartTime);
  const absoluteStart = clockToMinute(cue.startTime);
  const effectiveStartMinute = cue.timingMode === "OFFSET"
    ? sessionStart !== null && cue.offsetMin !== null ? sessionStart + cue.offsetMin : null
    : absoluteStart;
  const effectiveEndMinute = effectiveStartMinute !== null && cue.durationMin !== null && cue.durationMin > 0
    ? effectiveStartMinute + cue.durationMin
    : null;
  return {
    ...cue,
    effectiveStartTime: minuteToClock(effectiveStartMinute),
    effectiveEndTime: minuteToClock(effectiveEndMinute),
    effectiveStartMinute,
    effectiveEndMinute,
  };
}
export function detectShowFlowTimingConflicts(
  session: { startTime: string | null; endTime: string | null },
  cues: ShowFlowTimingCue[],
): { cues: DerivedShowFlowCue[]; conflicts: ShowFlowConflict[] } {
  const sessionStart = clockToMinute(session.startTime);
  const sessionEnd = clockToMinute(session.endTime);
  const derived = [...cues]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
    .map((cue) => deriveShowFlowCueTiming(cue, session.startTime));
  const conflicts: ShowFlowConflict[] = [];

  for (const cue of derived) {
    if (cue.effectiveStartMinute === null) {
      conflicts.push({ code: "MISSING_TIME", severity: "BLOCKING", message: "Cue needs an absolute time or valid session offset.", itemIds: [cue.id] });
    }
    if (cue.durationMin === null || cue.durationMin <= 0) {
      conflicts.push({ code: "INVALID_DURATION", severity: "BLOCKING", message: "Cue duration must be a positive whole number.", itemIds: [cue.id] });
    }
    if (cue.effectiveStartMinute !== null && sessionStart !== null && sessionEnd !== null
      && (cue.effectiveStartMinute < sessionStart || cue.effectiveStartMinute >= sessionEnd)) {
      conflicts.push({ code: "OUT_OF_SESSION", severity: "BLOCKING", message: "Cue begins outside the session window.", itemIds: [cue.id] });
    }
    if (cue.effectiveEndMinute !== null && sessionEnd !== null && cue.effectiveEndMinute > sessionEnd) {
      conflicts.push({ code: "OVERRUN", severity: "BLOCKING", message: "Cue runs past the session end.", itemIds: [cue.id] });
    }
  }

  for (let index = 0; index < derived.length - 1; index += 1) {
    const current = derived[index];
    const next = derived[index + 1];
    if (current.effectiveEndMinute === null || next.effectiveStartMinute === null) continue;
    if (next.effectiveStartMinute < current.effectiveEndMinute) {
      conflicts.push({ code: "OVERLAP", severity: "BLOCKING", message: "Ordered cues overlap.", itemIds: [current.id, next.id] });
    } else if (next.effectiveStartMinute > current.effectiveEndMinute) {
      conflicts.push({ code: "GAP", severity: "WARNING", message: `${next.effectiveStartMinute - current.effectiveEndMinute} minute gap between cues.`, itemIds: [current.id, next.id] });
    }
  }

  return { cues: derived, conflicts };
}

export type PublicShowFlowCueInput = DerivedShowFlowCue & {
  label: string;
  publicDescription?: string | null;
  talentName?: string | null;
  speaker?: { name: string } | null;
  visibility: "INTERNAL" | "PUBLIC";
};

export function projectPublicShowFlowCue(cue: PublicShowFlowCueInput) {
  if (cue.visibility !== "PUBLIC") return null;
  return {
    id: cue.id,
    startTime: cue.effectiveStartTime,
    endTime: cue.effectiveEndTime,
    durationMin: cue.durationMin,
    cue: cue.label,
    description: cue.publicDescription?.trim() || null,
    talent: cue.speaker?.name?.trim() || cue.talentName?.trim() || null,
  };
}
