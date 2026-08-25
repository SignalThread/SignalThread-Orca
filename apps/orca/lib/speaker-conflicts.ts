/**
 * Pure speaker/session conflict computation.
 * Server services fetch the data; this module only reasons about it,
 * so conflicts stay deterministic and unit-testable.
 */

export type SpeakerSessionSlot = {
  speakerId: string;
  speakerName: string;
  sessionId: string;
  sessionName: string | null;
  roomName: string | null;
  /** ISO date, e.g. "2026-06-10" */
  dayDate: string;
  /** "HH:MM" or null when the session has no time set */
  startTime: string | null;
  endTime: string | null;
};

export type SpeakerConflict = {
  type: "session_overlap" | "tight_room_transition";
  speakerId: string;
  speakerName: string;
  dayDate: string;
  sessionIds: [string, string];
  description: string;
};

function toMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function slotLabel(slot: SpeakerSessionSlot): string {
  return slot.sessionName?.trim() || "Untitled session";
}

/**
 * Detects same-speaker conflicts:
 * - session_overlap: two sessions on the same day whose time ranges intersect
 * - tight_room_transition: back-to-back sessions (zero gap) in different rooms
 *
 * Slots with missing or unparseable start/end times are skipped (fail soft).
 */
export function computeSpeakerSessionConflicts(slots: SpeakerSessionSlot[]): SpeakerConflict[] {
  const conflicts: SpeakerConflict[] = [];

  const bySpeakerDay = new Map<string, SpeakerSessionSlot[]>();
  for (const slot of slots) {
    if (!slot.startTime || !slot.endTime) continue;
    if (toMinutes(slot.startTime) === null || toMinutes(slot.endTime) === null) continue;
    const key = `${slot.speakerId}|${slot.dayDate}`;
    const list = bySpeakerDay.get(key) ?? [];
    list.push(slot);
    bySpeakerDay.set(key, list);
  }

  for (const list of bySpeakerDay.values()) {
    const sorted = [...list].sort((a, b) => (toMinutes(a.startTime!)! - toMinutes(b.startTime!)!));

    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const a = sorted[i];
        const b = sorted[j];
        if (a.sessionId === b.sessionId) continue;

        const aStart = toMinutes(a.startTime!)!;
        const aEnd = toMinutes(a.endTime!)!;
        const bStart = toMinutes(b.startTime!)!;
        const bEnd = toMinutes(b.endTime!)!;

        if (aStart < bEnd && bStart < aEnd) {
          conflicts.push({
            type: "session_overlap",
            speakerId: a.speakerId,
            speakerName: a.speakerName,
            dayDate: a.dayDate,
            sessionIds: [a.sessionId, b.sessionId],
            description: `${a.speakerName}: "${slotLabel(a)}" overlaps "${slotLabel(b)}" on ${a.dayDate}`,
          });
        } else if (
          bStart === aEnd &&
          a.roomName &&
          b.roomName &&
          a.roomName.trim().toLowerCase() !== b.roomName.trim().toLowerCase()
        ) {
          conflicts.push({
            type: "tight_room_transition",
            speakerId: a.speakerId,
            speakerName: a.speakerName,
            dayDate: a.dayDate,
            sessionIds: [a.sessionId, b.sessionId],
            description: `${a.speakerName}: no transition time between "${slotLabel(a)}" (${a.roomName}) and "${slotLabel(b)}" (${b.roomName}) on ${a.dayDate}`,
          });
        }
      }
    }
  }

  return conflicts;
}
