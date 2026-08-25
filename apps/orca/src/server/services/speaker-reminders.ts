import { SpeakerReminderKind, UserRole } from "@prisma/client";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";
import { getEmailProvider } from "@/src/server/email/provider";
import { logSpeakerActivity } from "@/src/server/services/speaker-comms";

export class SpeakerReminderError extends Error {
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

/**
 * Reminder rules are fixed, derived selections — there is no scheduler or
 * background worker in this app, so reminders only ever go out when a
 * planner explicitly previews and sends them.
 */
export const SPEAKER_REMINDER_RULES: Array<{
  kind: SpeakerReminderKind;
  label: string;
  description: string;
}> = [
  {
    kind: "INCOMPLETE_PROFILE",
    label: "Incomplete profile",
    description: "Speakers missing bio, headshot, or title/company",
  },
  {
    kind: "MISSING_DECK",
    label: "Missing deck",
    description: "Speakers who have not uploaded any presentation",
  },
  {
    kind: "MISSING_DOCUMENT",
    label: "Missing required document",
    description: "Speakers with assigned documents not yet submitted",
  },
];

const REMINDER_KINDS = SPEAKER_REMINDER_RULES.map((rule) => rule.kind);

export type SpeakerReminderCandidate = {
  speakerId: string;
  name: string;
  email: string | null;
  reasons: string[];
};

function normalizeKind(value: unknown): SpeakerReminderKind {
  if (typeof value !== "string" || !REMINDER_KINDS.includes(value as SpeakerReminderKind)) {
    throw new SpeakerReminderError(
      `kind must be one of: ${REMINDER_KINDS.join(", ")}`,
      400,
    );
  }
  return value as SpeakerReminderKind;
}

function asReminderError(error: unknown, fallbackMessage: string): SpeakerReminderError {
  if (error instanceof SpeakerReminderError) return error;
  if (error instanceof EventAccessError) {
    return new SpeakerReminderError(error.message, error.status, error.reason);
  }
  return new SpeakerReminderError(fallbackMessage, 500);
}

/** Computes which speakers a rule selects, with human-readable reasons. */
async function computeReminderCandidates(
  eventId: string,
  kind: SpeakerReminderKind,
): Promise<SpeakerReminderCandidate[]> {
  const speakers = await getPrisma().speaker.findMany({
    where: { eventId, status: { not: "CANCELLED" } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      bio: true,
      headshotUrl: true,
      title: true,
      company: true,
      files: { where: { kind: "SLIDES" }, select: { id: true }, take: 1 },
      documentRequests: {
        where: { speakerFileId: null },
        select: { title: true },
      },
    },
  });

  const candidates: SpeakerReminderCandidate[] = [];

  for (const speaker of speakers) {
    const reasons: string[] = [];

    if (kind === "INCOMPLETE_PROFILE") {
      if (!speaker.bio?.trim()) reasons.push("Missing bio");
      if (!speaker.headshotUrl?.trim()) reasons.push("Missing headshot");
      if (!speaker.title?.trim() || !speaker.company?.trim()) reasons.push("Missing title/company");
    } else if (kind === "MISSING_DECK") {
      if (speaker.files.length === 0) reasons.push("No presentation uploaded");
    } else if (kind === "MISSING_DOCUMENT") {
      for (const request of speaker.documentRequests) {
        reasons.push(`Document not submitted: ${request.title}`);
      }
    }

    if (reasons.length > 0) {
      candidates.push({
        speakerId: speaker.id,
        name: speaker.name,
        email: speaker.email,
        reasons,
      });
    }
  }

  return candidates;
}

export async function previewSpeakerReminders(
  eventId: string,
  user: RequestUserContext,
  kindInput: unknown,
): Promise<{ kind: SpeakerReminderKind; candidates: SpeakerReminderCandidate[] }> {
  try {
    await assertEventAccessForUser(eventId, user, "read");
    const kind = normalizeKind(kindInput);
    const candidates = await computeReminderCandidates(eventId, kind);
    return { kind, candidates };
  } catch (error) {
    throw asReminderError(error, "Failed to preview reminders");
  }
}

export type SpeakerReminderSendResult = {
  kind: SpeakerReminderKind;
  attempted: number;
  sent: number;
  failed: number;
  skippedNoProvider: number;
  skippedNoEmail: number;
};

/**
 * Composes the reminder email. Never includes portal tokens, OTPs, or links
 * with embedded secrets — speakers use the portal link they already received.
 */
function composeReminder(
  eventName: string,
  speakerName: string,
  reasons: string[],
): { subject: string; body: string } {
  const subject = `Reminder: action needed for ${eventName}`;
  const body = [
    `Hi ${speakerName},`,
    "",
    `The ${eventName} team needs the following from you:`,
    ...reasons.map((reason) => `- ${reason}`),
    "",
    "Please use the speaker portal link you received to complete these items.",
  ].join("\n");
  return { subject, body };
}

export async function sendSpeakerReminders(
  eventId: string,
  user: RequestUserContext,
  input: { kind: unknown; speakerIds?: unknown },
): Promise<SpeakerReminderSendResult> {
  try {
    await assertEventAccessForUser(eventId, user, "write");
    const kind = normalizeKind(input.kind);

    const event = await getPrisma().event.findUnique({
      where: { id: eventId },
      select: { name: true },
    });
    if (!event) {
      throw new SpeakerReminderError("Event not found", 404);
    }

    let selectedIds: Set<string> | null = null;
    if (typeof input.speakerIds !== "undefined") {
      if (!Array.isArray(input.speakerIds) || input.speakerIds.some((id) => typeof id !== "string")) {
        throw new SpeakerReminderError("speakerIds must be an array of ids", 400);
      }
      selectedIds = new Set(input.speakerIds as string[]);
    }

    // Re-derive candidates server-side; client selections can only narrow,
    // never add speakers the rule did not select.
    const candidates = (await computeReminderCandidates(eventId, kind)).filter(
      (candidate) => !selectedIds || selectedIds.has(candidate.speakerId),
    );

    const provider = getEmailProvider();
    const result: SpeakerReminderSendResult = {
      kind,
      attempted: candidates.length,
      sent: 0,
      failed: 0,
      skippedNoProvider: 0,
      skippedNoEmail: 0,
    };

    for (const candidate of candidates) {
      if (!candidate.email?.trim()) {
        result.skippedNoEmail += 1;
        continue;
      }

      const { subject, body } = composeReminder(event.name, candidate.name, candidate.reasons);
      const sendResult = await provider.send({ to: candidate.email, subject, body });

      if (sendResult.status === "SENT") result.sent += 1;
      else if (sendResult.status === "FAILED") result.failed += 1;
      else result.skippedNoProvider += 1;

      await getPrisma().speakerEmailLog.create({
        data: {
          eventId,
          speakerId: candidate.speakerId,
          kind,
          toEmail: candidate.email,
          subject,
          body,
          reason: candidate.reasons.join("; "),
          status: sendResult.status,
          provider: provider.name,
          error: sendResult.status === "FAILED" ? sendResult.detail ?? "Send failed" : null,
          triggeredByUserId: user.id,
          sentAt: sendResult.status === "SENT" ? new Date() : null,
        },
      });
    }

    await logSpeakerActivity(
      eventId,
      user.id,
      `Speaker reminders triggered (${kind.toLowerCase().replaceAll("_", " ")}): ${result.attempted} selected, ${result.sent} sent, ${result.skippedNoProvider} pending provider`,
    );

    return result;
  } catch (error) {
    throw asReminderError(error, "Failed to send reminders");
  }
}

export type SpeakerEmailLogRecord = {
  id: string;
  speakerId: string;
  kind: SpeakerReminderKind;
  toEmail: string;
  subject: string;
  reason: string;
  status: "SENT" | "FAILED" | "SKIPPED_NO_PROVIDER";
  provider: string;
  error: string | null;
  sentAt: Date | null;
  createdAt: Date;
};

export async function listSpeakerEmailLogs(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
): Promise<SpeakerEmailLogRecord[]> {
  try {
    await assertEventAccessForUser(eventId, user, "read");

    const speaker = await getPrisma().speaker.findFirst({
      where: { id: speakerId, eventId },
      select: { id: true },
    });
    if (!speaker) {
      throw new SpeakerReminderError("Speaker not found", 404);
    }

    return await getPrisma().speakerEmailLog.findMany({
      where: { eventId, speakerId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        speakerId: true,
        kind: true,
        toEmail: true,
        subject: true,
        reason: true,
        status: true,
        provider: true,
        error: true,
        sentAt: true,
        createdAt: true,
      },
    });
  } catch (error) {
    throw asReminderError(error, "Failed to list email history");
  }
}
