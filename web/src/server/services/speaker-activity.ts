import { UserRole } from "@prisma/client";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";

export class SpeakerActivityError extends Error {
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

export type SpeakerTimelineEntry = {
  at: Date;
  actorType: "PLANNER" | "SPEAKER" | "SYSTEM";
  action: string;
};

const TIMELINE_LIMIT = 50;

/**
 * Planner-facing speaker activity timeline.
 *
 * Derived entirely from canonical speaker-scoped records — nothing is stored
 * twice and nothing can drift. Internal-only material (note bodies, message
 * text, emails, storage keys, tokens) is never included: entries are action
 * summaries with timestamps and actor type only.
 */
export async function getSpeakerActivityTimeline(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
): Promise<SpeakerTimelineEntry[]> {
  try {
    await assertEventAccessForUser(eventId, user, "read");

    const speaker = await getPrisma().speaker.findFirst({
      where: { id: speakerId, eventId },
      select: { id: true, createdAt: true },
    });
    if (!speaker) {
      throw new SpeakerActivityError("Speaker not found", 404);
    }

    const prisma = getPrisma();
    const [files, submissions, documentRequests, messages, notes, emailLogs] = await Promise.all([
      prisma.speakerFile.findMany({
        where: { eventId, speakerId },
        select: {
          kind: true,
          version: true,
          uploadedViaPortal: true,
          createdAt: true,
          reviewStatus: true,
          reviewedAt: true,
        },
      }),
      prisma.speakerProfileSubmission.findMany({
        where: { eventId, speakerId },
        select: { submittedAt: true, status: true, reviewedAt: true },
      }),
      prisma.speakerDocumentRequest.findMany({
        where: { eventId, speakerId },
        select: { title: true, createdAt: true, submittedAt: true, documentId: true, updatedAt: true },
      }),
      prisma.speakerMessage.findMany({
        where: { eventId, speakerId },
        select: { senderType: true, createdAt: true },
      }),
      prisma.speakerInternalNote.findMany({
        where: { eventId, speakerId },
        select: { createdAt: true },
      }),
      prisma.speakerEmailLog.findMany({
        where: { eventId, speakerId },
        select: { kind: true, status: true, createdAt: true },
      }),
    ]);

    const entries: SpeakerTimelineEntry[] = [
      { at: speaker.createdAt, actorType: "PLANNER", action: "Speaker record created" },
    ];

    for (const file of files) {
      entries.push({
        at: file.createdAt,
        actorType: file.uploadedViaPortal ? "SPEAKER" : "PLANNER",
        action: `File uploaded (${file.kind.toLowerCase()} v${file.version})`,
      });
      if (file.reviewedAt) {
        entries.push({
          at: file.reviewedAt,
          actorType: "PLANNER",
          action: `File review updated: ${file.reviewStatus.toLowerCase().replaceAll("_", " ")}`,
        });
      }
    }

    for (const submission of submissions) {
      entries.push({
        at: submission.submittedAt,
        actorType: "SPEAKER",
        action: "Profile submission received",
      });
      if (submission.reviewedAt && submission.status !== "PENDING") {
        entries.push({
          at: submission.reviewedAt,
          actorType: "PLANNER",
          action: `Profile submission ${submission.status.toLowerCase()}`,
        });
      }
    }

    for (const request of documentRequests) {
      entries.push({
        at: request.createdAt,
        actorType: "PLANNER",
        action: `Document assigned: ${request.title}`,
      });
      if (request.submittedAt) {
        entries.push({
          at: request.submittedAt,
          actorType: "SPEAKER",
          action: `Document submitted: ${request.title}`,
        });
      }
      if (request.documentId) {
        entries.push({
          at: request.updatedAt,
          actorType: "PLANNER",
          action: `Document sent to Docs Hub: ${request.title}`,
        });
      }
    }

    for (const message of messages) {
      entries.push({
        at: message.createdAt,
        actorType: message.senderType,
        action: message.senderType === "SPEAKER" ? "Message received from speaker" : "Message sent to speaker",
      });
    }

    for (const note of notes) {
      entries.push({ at: note.createdAt, actorType: "PLANNER", action: "Internal note added" });
    }

    for (const log of emailLogs) {
      entries.push({
        at: log.createdAt,
        actorType: "SYSTEM",
        action: `Reminder recorded (${log.kind.toLowerCase().replaceAll("_", " ")}): ${log.status.toLowerCase().replaceAll("_", " ")}`,
      });
    }

    return entries
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, TIMELINE_LIMIT);
  } catch (error) {
    if (error instanceof SpeakerActivityError) throw error;
    if (error instanceof EventAccessError) {
      throw new SpeakerActivityError(error.message, error.status, error.reason);
    }
    throw new SpeakerActivityError("Failed to load speaker activity", 500);
  }
}
