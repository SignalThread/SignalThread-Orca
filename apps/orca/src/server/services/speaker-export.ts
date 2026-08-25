import { UserRole } from "@prisma/client";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";
import {
  computeSpeakerReadinessFlags,
  type SpeakerReadinessFlag,
} from "@/src/server/services/speaker-readiness";

export class SpeakerExportError extends Error {
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

function csvEscape(value: string | null | undefined): string {
  const text = value ?? "";
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(headers: string[], rows: string[][]): string {
  return [headers.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\r\n");
}

function asExportError(error: unknown, fallbackMessage: string): SpeakerExportError {
  if (error instanceof SpeakerExportError) return error;
  if (error instanceof EventAccessError) {
    return new SpeakerExportError(error.message, error.status, error.reason);
  }
  return new SpeakerExportError(fallbackMessage, 500);
}

export async function exportSpeakersCsv(eventId: string, user: RequestUserContext): Promise<string> {
  try {
    await assertEventAccessForUser(eventId, user, "read");

    const speakers = await getPrisma().speaker.findMany({
      where: { eventId },
      orderBy: { name: "asc" },
      select: {
        name: true,
        email: true,
        phone: true,
        title: true,
        company: true,
        bio: true,
        status: true,
        headshotUrl: true,
        avNeeds: true,
        travelNeeds: true,
        dietaryRestrictions: true,
        topics: true,
        linkedinUrl: true,
        websiteUrl: true,
        intakeTokens: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { submittedAt: true, revokedAt: true, expiresAt: true },
        },
        profileSubmissions: {
          where: { status: "PENDING" },
          take: 1,
          select: { id: true },
        },
        files: {
          where: { kind: "SLIDES" },
          orderBy: [{ version: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: { reviewStatus: true },
        },
        documentRequests: {
          select: {
            speakerFileId: true,
            speakerFile: { select: { reviewStatus: true } },
            document: { select: { status: true } },
          },
        },
      },
    });

    const headers = [
      "Name",
      "Email",
      "Phone",
      "Title",
      "Company",
      "Status",
      "Bio",
      "Headshot URL",
      "AV Needs",
      "Travel Needs",
      "Dietary Restrictions",
      "Topics",
      "LinkedIn",
      "Website",
      "Readiness",
    ];

    const rows = speakers.map((speaker) => {
      const flags: SpeakerReadinessFlag[] = computeSpeakerReadinessFlags({
        id: "",
        bio: speaker.bio,
        headshotUrl: speaker.headshotUrl,
        title: speaker.title,
        company: speaker.company,
        avNeeds: speaker.avNeeds,
        travelNeeds: speaker.travelNeeds,
        dietaryRestrictions: speaker.dietaryRestrictions,
        intakeTokens: speaker.intakeTokens,
        profileSubmissions: speaker.profileSubmissions,
        files: speaker.files,
        documentRequests: speaker.documentRequests,
      });

      return [
        speaker.name,
        speaker.email,
        speaker.phone,
        speaker.title,
        speaker.company,
        speaker.status,
        speaker.bio,
        speaker.headshotUrl,
        speaker.avNeeds,
        speaker.travelNeeds,
        speaker.dietaryRestrictions,
        speaker.topics.join("; "),
        speaker.linkedinUrl,
        speaker.websiteUrl,
        flags.join("; "),
      ];
    });

    return toCsv(headers, rows as string[][]);
  } catch (error) {
    throw asExportError(error, "Failed to export speakers");
  }
}

export async function exportSpeakerAssignmentsCsv(
  eventId: string,
  user: RequestUserContext,
): Promise<string> {
  try {
    await assertEventAccessForUser(eventId, user, "read");

    const assignments = await getPrisma().sessionSpeakerAssignment.findMany({
      where: {
        session: { eventId },
        speaker: { eventId },
      },
      select: {
        speaker: { select: { name: true, email: true, status: true } },
        session: {
          select: {
            sessionName: true,
            roomName: true,
            dayDate: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    const headers = ["Speaker", "Email", "Speaker Status", "Session", "Room", "Date", "Start", "End"];

    const rows = assignments
      .map(({ speaker, session }) => [
        speaker.name,
        speaker.email ?? "",
        speaker.status,
        session.sessionName ?? "",
        session.roomName ?? "",
        session.dayDate.toISOString().slice(0, 10),
        session.startTime?.toISOString().slice(11, 16) ?? "",
        session.endTime?.toISOString().slice(11, 16) ?? "",
      ])
      .sort((a, b) => `${a[5]}${a[6]}${a[0]}`.localeCompare(`${b[5]}${b[6]}${b[0]}`));

    return toCsv(headers, rows);
  } catch (error) {
    throw asExportError(error, "Failed to export speaker assignments");
  }
}
