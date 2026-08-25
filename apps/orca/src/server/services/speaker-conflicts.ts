import { UserRole } from "@prisma/client";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";
import {
  computeSpeakerSessionConflicts,
  type SpeakerConflict,
  type SpeakerSessionSlot,
} from "@/lib/speaker-conflicts";

export class SpeakerConflictError extends Error {
  status: number;
  reason?: string;

  constructor(message: string, status = 400, reason?: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

type RequestUserContext = {
  id: string;
  orgId: string | null;
  role: UserRole;
};

export type SpeakerConflictOverview = {
  conflicts: SpeakerConflict[];
};

export async function getSpeakerConflicts(
  eventId: string,
  user: RequestUserContext,
): Promise<SpeakerConflictOverview> {
  try {
    await assertEventAccessForUser(eventId, user, "read");

    const assignments = await getPrisma().sessionSpeakerAssignment.findMany({
      where: {
        session: { eventId },
        speaker: { eventId },
      },
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
    });

    const slots: SpeakerSessionSlot[] = assignments.map(({ speaker, session }) => ({
      speakerId: speaker.id,
      speakerName: speaker.name,
      sessionId: session.id,
      sessionName: session.sessionName,
      roomName: session.roomName,
      dayDate: session.dayDate.toISOString().slice(0, 10),
      startTime: session.startTime?.toISOString().slice(11, 16) ?? null,
      endTime: session.endTime?.toISOString().slice(11, 16) ?? null,
    }));

    return { conflicts: computeSpeakerSessionConflicts(slots) };
  } catch (error) {
    if (error instanceof EventAccessError) {
      throw new SpeakerConflictError(error.message, error.status, error.reason);
    }
    if (error instanceof SpeakerConflictError) {
      throw error;
    }
    throw new SpeakerConflictError("Failed to compute speaker conflicts", 500);
  }
}
