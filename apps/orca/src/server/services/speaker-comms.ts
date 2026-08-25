import { Prisma, UserRole, type EventActivityAction } from "@prisma/client";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";
import { recordEventActivity, type ActivityDbClient } from "@/src/server/services/event-activity";
import { resolveSpeakerPortalToken } from "@/src/server/services/speaker-portal-tokens";

export class SpeakerCommsError extends Error {
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

export type SpeakerActivityOptions = {
  /** Pass a transaction client to keep the audit write atomic with the mutation. */
  tx?: ActivityDbClient;
  action?: EventActivityAction;
  entityType?: string;
  entityId?: string | null;
  entityLabel?: string;
  source?: { type: string; id: string };
};

/**
 * Records a speaker-related entry in the canonical event Activity audit feed.
 *
 * This delegates to the canonical event-activity service (module SPEAKERS) and
 * no longer swallows failures — a failed audit write must surface, not silently
 * leave a mutation unrecorded. Callers that can supply a transaction client via
 * `options.tx` keep the business mutation and audit entry atomic.
 */
export async function logSpeakerActivity(
  eventId: string,
  actorUserId: string,
  message: string,
  options?: SpeakerActivityOptions,
): Promise<void> {
  await recordEventActivity(options?.tx ?? getPrisma(), {
    eventId,
    actor: { kind: "USER", userId: actorUserId },
    module: "SPEAKERS",
    action: options?.action ?? "UPDATED",
    entityType: options?.entityType ?? "Speaker",
    entityId: options?.entityId ?? null,
    entityLabel: options?.entityLabel ?? "Speaker",
    message,
    source: options?.source,
  });
}

export type SpeakerReminderResult = {
  speakerId: string;
  reminderSentAt: string;
};

/**
 * Marks a profile-update reminder as sent. There is no email infrastructure;
 * planners copy the portal link manually, and this records when they nudged.
 */
export async function markSpeakerReminderSent(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
): Promise<SpeakerReminderResult> {
  try {
    await assertEventAccessForUser(eventId, user, "write");

    const speaker = await getPrisma().speaker.findFirst({
      where: { id: speakerId, eventId },
      select: { id: true, name: true, intakeTokenSentAt: true },
    });

    if (!speaker) {
      throw new SpeakerCommsError("Speaker not found", 404);
    }

    if (!speaker.intakeTokenSentAt) {
      throw new SpeakerCommsError("Generate a portal link before sending reminders", 400);
    }

    const now = new Date();
    await getPrisma().$transaction(async (tx) => {
      await tx.speaker.update({
        where: { id: speaker.id },
        data: { reminderSentAt: now },
      });
      await logSpeakerActivity(eventId, user.id, `Profile update reminder marked sent for ${speaker.name}`, {
        tx,
        action: "SENT",
        entityId: speaker.id,
        entityLabel: speaker.name,
      });
    });

    return {
      speakerId: speaker.id,
      reminderSentAt: now.toISOString(),
    };
  } catch (error) {
    if (error instanceof SpeakerCommsError) throw error;
    if (error instanceof EventAccessError) {
      throw new SpeakerCommsError(error.message, error.status, error.reason);
    }
    throw new SpeakerCommsError("Failed to record reminder", 500);
  }
}

// --- Speaker-facing messages + internal planner notes ---

function asCommsError(error: unknown, fallbackMessage: string): SpeakerCommsError {
  if (error instanceof SpeakerCommsError) return error;
  if (error instanceof EventAccessError) {
    return new SpeakerCommsError(error.message, error.status, error.reason);
  }
  return new SpeakerCommsError(fallbackMessage, 500);
}

async function assertSpeakerInEvent(eventId: string, speakerId: string): Promise<void> {
  const speaker = await getPrisma().speaker.findFirst({
    where: { id: speakerId, eventId },
    select: { id: true },
  });

  if (!speaker) {
    throw new SpeakerCommsError("Speaker not found", 404);
  }
}

function requireBody(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new SpeakerCommsError("body is required", 400);
  }
  const body = value.trim();
  if (body.length > 5000) {
    throw new SpeakerCommsError("body must be 5000 characters or fewer", 400);
  }
  return body;
}

/** Optional attachments must stay inside the speaker's own event scope. */
async function normalizeAttachments(
  eventId: string,
  speakerId: string,
  input: { sessionId?: unknown; speakerFileId?: unknown },
): Promise<{ sessionId: string | null; speakerFileId: string | null }> {
  let sessionId: string | null = null;
  if (typeof input.sessionId === "string" && input.sessionId.trim()) {
    const session = await getPrisma().matrixRow.findFirst({
      where: { id: input.sessionId.trim(), eventId },
      select: { id: true },
    });
    if (!session) {
      throw new SpeakerCommsError("Session not found for this event", 404);
    }
    sessionId = session.id;
  }

  let speakerFileId: string | null = null;
  if (typeof input.speakerFileId === "string" && input.speakerFileId.trim()) {
    const file = await getPrisma().speakerFile.findFirst({
      where: { id: input.speakerFileId.trim(), eventId, speakerId },
      select: { id: true },
    });
    if (!file) {
      throw new SpeakerCommsError("File not found for this speaker", 404);
    }
    speakerFileId = file.id;
  }

  return { sessionId, speakerFileId };
}

const messageSelect = {
  id: true,
  speakerId: true,
  eventId: true,
  sessionId: true,
  speakerFileId: true,
  senderType: true,
  body: true,
  createdAt: true,
  senderUser: { select: { name: true } },
} satisfies Prisma.SpeakerMessageSelect;

type MessageRow = Prisma.SpeakerMessageGetPayload<{ select: typeof messageSelect }>;

export type SpeakerMessageAdminRecord = {
  id: string;
  sessionId: string | null;
  speakerFileId: string | null;
  senderType: "PLANNER" | "SPEAKER";
  senderName: string | null;
  body: string;
  createdAt: Date;
};

/** Portal payloads never include planner identities — just the side of the thread. */
export type SpeakerMessagePortalRecord = {
  id: string;
  senderType: "PLANNER" | "SPEAKER";
  body: string;
  createdAt: Date;
};

function toAdminMessageRecord(row: MessageRow): SpeakerMessageAdminRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    speakerFileId: row.speakerFileId,
    senderType: row.senderType,
    senderName: row.senderUser?.name ?? null,
    body: row.body,
    createdAt: row.createdAt,
  };
}

function toPortalMessageRecord(row: MessageRow): SpeakerMessagePortalRecord {
  return {
    id: row.id,
    senderType: row.senderType,
    body: row.body,
    createdAt: row.createdAt,
  };
}

export async function listSpeakerMessages(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
): Promise<SpeakerMessageAdminRecord[]> {
  try {
    await assertEventAccessForUser(eventId, user, "read");
    await assertSpeakerInEvent(eventId, speakerId);

    const rows = await getPrisma().speakerMessage.findMany({
      where: { eventId, speakerId },
      orderBy: { createdAt: "asc" },
      select: messageSelect,
    });

    return rows.map(toAdminMessageRecord);
  } catch (error) {
    throw asCommsError(error, "Failed to list speaker messages");
  }
}

export async function createSpeakerMessage(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
  input: { body: unknown; sessionId?: unknown; speakerFileId?: unknown },
): Promise<SpeakerMessageAdminRecord> {
  try {
    await assertEventAccessForUser(eventId, user, "write");
    await assertSpeakerInEvent(eventId, speakerId);

    const body = requireBody(input.body);
    const attachments = await normalizeAttachments(eventId, speakerId, input);

    const row = await getPrisma().$transaction(async (tx) => {
      const created = await tx.speakerMessage.create({
        data: {
          eventId,
          speakerId,
          senderType: "PLANNER",
          senderUserId: user.id,
          body,
          ...attachments,
        },
        select: messageSelect,
      });
      // Audit records that a message was sent — never the message body.
      await logSpeakerActivity(eventId, user.id, "Message sent to speaker", {
        tx,
        action: "SENT",
        entityId: speakerId,
        entityLabel: "Speaker message",
      });
      return created;
    });

    return toAdminMessageRecord(row);
  } catch (error) {
    throw asCommsError(error, "Failed to send speaker message");
  }
}

export async function listPortalSpeakerMessages(rawToken: string): Promise<SpeakerMessagePortalRecord[]> {
  const resolved = await resolveSpeakerPortalToken(rawToken);

  const rows = await getPrisma().speakerMessage.findMany({
    where: { eventId: resolved.eventId, speakerId: resolved.speakerId },
    orderBy: { createdAt: "asc" },
    select: messageSelect,
  });

  return rows.map(toPortalMessageRecord);
}

export async function createPortalSpeakerMessage(
  rawToken: string,
  input: { body: unknown },
): Promise<SpeakerMessagePortalRecord> {
  const resolved = await resolveSpeakerPortalToken(rawToken);
  const body = requireBody(input.body);

  const row = await getPrisma().speakerMessage.create({
    data: {
      eventId: resolved.eventId,
      speakerId: resolved.speakerId,
      senderType: "SPEAKER",
      senderUserId: null,
      body,
    },
    select: messageSelect,
  });

  return toPortalMessageRecord(row);
}

const noteSelect = {
  id: true,
  sessionId: true,
  speakerFileId: true,
  body: true,
  createdAt: true,
  authorUser: { select: { name: true } },
} satisfies Prisma.SpeakerInternalNoteSelect;

type NoteRow = Prisma.SpeakerInternalNoteGetPayload<{ select: typeof noteSelect }>;

export type SpeakerInternalNoteRecord = {
  id: string;
  sessionId: string | null;
  speakerFileId: string | null;
  authorName: string | null;
  body: string;
  createdAt: Date;
};

function toNoteRecord(row: NoteRow): SpeakerInternalNoteRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    speakerFileId: row.speakerFileId,
    authorName: row.authorUser?.name ?? null,
    body: row.body,
    createdAt: row.createdAt,
  };
}

/**
 * Internal notes are planner-only. There is intentionally no portal-facing
 * read path for SpeakerInternalNote anywhere in the codebase.
 */
export async function listSpeakerInternalNotes(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
): Promise<SpeakerInternalNoteRecord[]> {
  try {
    await assertEventAccessForUser(eventId, user, "read");
    await assertSpeakerInEvent(eventId, speakerId);

    const rows = await getPrisma().speakerInternalNote.findMany({
      where: { eventId, speakerId },
      orderBy: { createdAt: "desc" },
      select: noteSelect,
    });

    return rows.map(toNoteRecord);
  } catch (error) {
    throw asCommsError(error, "Failed to list internal notes");
  }
}

export async function createSpeakerInternalNote(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
  input: { body: unknown; sessionId?: unknown; speakerFileId?: unknown },
): Promise<SpeakerInternalNoteRecord> {
  try {
    await assertEventAccessForUser(eventId, user, "write");
    await assertSpeakerInEvent(eventId, speakerId);

    const body = requireBody(input.body);
    const attachments = await normalizeAttachments(eventId, speakerId, input);

    const row = await getPrisma().$transaction(async (tx) => {
      const created = await tx.speakerInternalNote.create({
        data: {
          eventId,
          speakerId,
          authorUserId: user.id,
          body,
          ...attachments,
        },
        select: noteSelect,
      });
      // Audit records that an internal note was added — never the note body.
      await logSpeakerActivity(eventId, user.id, "Internal note added for speaker", {
        tx,
        action: "CREATED",
        entityType: "SpeakerInternalNote",
        entityId: speakerId,
        entityLabel: "Internal note",
      });
      return created;
    });

    return toNoteRecord(row);
  } catch (error) {
    throw asCommsError(error, "Failed to add internal note");
  }
}
