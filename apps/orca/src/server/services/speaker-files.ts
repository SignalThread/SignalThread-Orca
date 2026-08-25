import { Prisma, SpeakerFileKind, UserRole } from "@prisma/client";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";
import {
  createSpeakerFilePresignedUpload,
  getSpeakerFileDownloadUrl,
  validateSpeakerFileUpload,
} from "@/src/server/storage/speakers";
import {
  resolveSpeakerPortalToken,
} from "@/src/server/services/speaker-portal-tokens";
import { logSpeakerActivity } from "@/src/server/services/speaker-comms";

export class SpeakerFileError extends Error {
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

const fileSelect = {
  id: true,
  speakerId: true,
  eventId: true,
  sessionId: true,
  kind: true,
  filename: true,
  contentType: true,
  fileSizeBytes: true,
  version: true,
  reviewStatus: true,
  reviewFeedback: true,
  reviewedAt: true,
  uploadedViaPortal: true,
  createdAt: true,
} satisfies Prisma.SpeakerFileSelect;

export type SpeakerFileRecord = Prisma.SpeakerFileGetPayload<{ select: typeof fileSelect }>;

function isSpeakerFileKind(value: unknown): value is SpeakerFileKind {
  return typeof value === "string" && Object.values(SpeakerFileKind).includes(value as SpeakerFileKind);
}

function normalizeKind(value: unknown): SpeakerFileKind {
  if (!isSpeakerFileKind(value)) {
    throw new SpeakerFileError("kind must be one of: SLIDES, AGREEMENT, OTHER", 400);
  }
  return value;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new SpeakerFileError(`${field} is required`, 400);
  }
  return value.trim();
}

function asFileError(error: unknown, fallbackMessage: string): SpeakerFileError {
  if (error instanceof SpeakerFileError) return error;
  if (error instanceof EventAccessError) {
    return new SpeakerFileError(error.message, error.status, error.reason);
  }
  return new SpeakerFileError(fallbackMessage, 500);
}

async function assertSpeakerInEvent(eventId: string, speakerId: string): Promise<void> {
  const speaker = await getPrisma().speaker.findFirst({
    where: { id: speakerId, eventId },
    select: { id: true },
  });

  if (!speaker) {
    throw new SpeakerFileError("Speaker not found", 404);
  }
}

type FileUploadInput = {
  kind: unknown;
  filename: unknown;
  contentType: unknown;
  fileSizeBytes: unknown;
  sessionId?: unknown;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUploadInput(input: FileUploadInput): {
  kind: SpeakerFileKind;
  filename: string;
  contentType: string;
  fileSizeBytes: number;
  sessionId: string | null;
} {
  const kind = normalizeKind(input.kind);
  const filename = requireText(input.filename, "filename");
  const contentType = requireText(input.contentType, "contentType").toLowerCase();
  const fileSizeBytes = Number(input.fileSizeBytes);

  let sessionId: string | null = null;
  if (typeof input.sessionId !== "undefined" && input.sessionId !== null && input.sessionId !== "") {
    if (typeof input.sessionId !== "string" || !UUID_REGEX.test(input.sessionId)) {
      throw new SpeakerFileError("sessionId must be a valid UUID", 400);
    }
    sessionId = input.sessionId;
  }

  try {
    validateSpeakerFileUpload(contentType, fileSizeBytes);
  } catch (validationError) {
    throw new SpeakerFileError(
      validationError instanceof Error ? validationError.message : "Invalid file upload",
      400,
    );
  }

  return { kind, filename, contentType, fileSizeBytes, sessionId };
}

/** Sessions attach by Matrix ID only — the session row itself stays canonical in Matrix. */
async function assertSessionInEvent(eventId: string, sessionId: string): Promise<void> {
  const session = await getPrisma().matrixRow.findFirst({
    where: { id: sessionId, eventId },
    select: { id: true },
  });

  if (!session) {
    throw new SpeakerFileError("Session not found for this event", 404);
  }
}

/** Portal uploads may only attach to sessions the speaker is actually assigned to. */
async function assertSpeakerAssignedToSession(speakerId: string, sessionId: string): Promise<void> {
  const assignment = await getPrisma().sessionSpeakerAssignment.findUnique({
    where: { sessionId_speakerId: { sessionId, speakerId } },
    select: { sessionId: true },
  });

  if (!assignment) {
    throw new SpeakerFileError("You are not assigned to that session", 403);
  }
}

/**
 * Versions increment within a deck group (event + speaker + kind + session).
 * Old rows are never mutated — every upload is a new immutable version.
 */
async function nextFileVersion(
  tx: Prisma.TransactionClient,
  scope: { eventId: string; speakerId: string; kind: SpeakerFileKind; sessionId: string | null },
): Promise<number> {
  const latest = await tx.speakerFile.aggregate({
    where: {
      eventId: scope.eventId,
      speakerId: scope.speakerId,
      kind: scope.kind,
      sessionId: scope.sessionId,
    },
    _max: { version: true },
  });

  return (latest._max.version ?? 0) + 1;
}

export async function listSpeakerFiles(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
): Promise<SpeakerFileRecord[]> {
  try {
    await assertEventAccessForUser(eventId, user, "read");
    await assertSpeakerInEvent(eventId, speakerId);

    return await getPrisma().speakerFile.findMany({
      where: { eventId, speakerId },
      orderBy: { createdAt: "desc" },
      select: fileSelect,
    });
  } catch (error) {
    throw asFileError(error, "Failed to list speaker files");
  }
}

export async function createAdminSpeakerFilePresign(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
  input: FileUploadInput,
): Promise<Awaited<ReturnType<typeof createSpeakerFilePresignedUpload>>> {
  try {
    await assertEventAccessForUser(eventId, user, "write");
    await assertSpeakerInEvent(eventId, speakerId);

    const normalized = normalizeUploadInput(input);
    return await createSpeakerFilePresignedUpload({ eventId, speakerId, ...normalized });
  } catch (error) {
    throw asFileError(error, "Failed to prepare file upload");
  }
}

export async function finalizeAdminSpeakerFile(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
  input: FileUploadInput & { objectKey: unknown },
): Promise<SpeakerFileRecord> {
  try {
    await assertEventAccessForUser(eventId, user, "write");
    await assertSpeakerInEvent(eventId, speakerId);

    const normalized = normalizeUploadInput(input);
    const objectKey = requireText(input.objectKey, "objectKey");
    assertObjectKeyScope(objectKey, eventId, speakerId);

    if (normalized.sessionId) {
      await assertSessionInEvent(eventId, normalized.sessionId);
    }

    const file = await getPrisma().$transaction(async (tx) => {
      const version = await nextFileVersion(tx, {
        eventId,
        speakerId,
        kind: normalized.kind,
        sessionId: normalized.sessionId,
      });

      return tx.speakerFile.create({
        data: {
          eventId,
          speakerId,
          ...normalized,
          version,
          objectKey,
          uploadedViaPortal: false,
          uploadedByUserId: user.id,
        },
        select: fileSelect,
      });
    });

    await logSpeakerActivity(eventId, user.id, `Speaker file uploaded (${file.kind.toLowerCase()} v${file.version})`);

    return file;
  } catch (error) {
    throw asFileError(error, "Failed to save speaker file");
  }
}

export async function getAdminSpeakerFileDownload(
  eventId: string,
  speakerId: string,
  fileId: string,
  user: RequestUserContext,
): Promise<{ downloadUrl: string; filename: string }> {
  try {
    await assertEventAccessForUser(eventId, user, "read");

    const file = await getPrisma().speakerFile.findFirst({
      where: { id: fileId, eventId, speakerId },
      select: { objectKey: true, filename: true },
    });

    if (!file) {
      throw new SpeakerFileError("File not found", 404);
    }

    return {
      downloadUrl: await getSpeakerFileDownloadUrl(file.objectKey),
      filename: file.filename,
    };
  } catch (error) {
    throw asFileError(error, "Failed to prepare file download");
  }
}

const REVIEW_STATUSES = ["RECEIVED", "NEEDS_CHANGES", "APPROVED", "FINAL"] as const;
type SpeakerFileReviewStatusInput = (typeof REVIEW_STATUSES)[number];

function normalizeReviewStatus(value: unknown): SpeakerFileReviewStatusInput {
  if (typeof value !== "string" || !REVIEW_STATUSES.includes(value as SpeakerFileReviewStatusInput)) {
    throw new SpeakerFileError("reviewStatus must be one of: RECEIVED, NEEDS_CHANGES, APPROVED, FINAL", 400);
  }
  return value as SpeakerFileReviewStatusInput;
}

/**
 * Planner review of a speaker file version. Feedback is speaker-visible
 * by design — internal notes belong in the notes system, never here.
 */
export async function reviewSpeakerFile(
  eventId: string,
  speakerId: string,
  fileId: string,
  user: RequestUserContext,
  input: { reviewStatus: unknown; reviewFeedback?: unknown },
): Promise<SpeakerFileRecord> {
  try {
    await assertEventAccessForUser(eventId, user, "write");

    const reviewStatus = normalizeReviewStatus(input.reviewStatus);
    let reviewFeedback: string | null | undefined;
    if (typeof input.reviewFeedback !== "undefined") {
      if (input.reviewFeedback === null) {
        reviewFeedback = null;
      } else if (typeof input.reviewFeedback === "string") {
        reviewFeedback = input.reviewFeedback.trim() || null;
      } else {
        throw new SpeakerFileError("reviewFeedback must be a string", 400);
      }
    }

    const updated = await getPrisma().speakerFile.updateMany({
      where: { id: fileId, eventId, speakerId },
      data: {
        reviewStatus,
        ...(typeof reviewFeedback !== "undefined" ? { reviewFeedback } : {}),
        reviewedAt: new Date(),
        reviewedByUserId: user.id,
      },
    });

    if (updated.count !== 1) {
      throw new SpeakerFileError("File not found", 404);
    }

    await logSpeakerActivity(eventId, user.id, `Speaker file marked ${reviewStatus.toLowerCase().replace("_", " ")}`);

    const file = await getPrisma().speakerFile.findUniqueOrThrow({
      where: { id: fileId },
      select: fileSelect,
    });

    return file;
  } catch (error) {
    throw asFileError(error, "Failed to review speaker file");
  }
}

/** Object keys must stay inside the speaker's own storage prefix. */
function assertObjectKeyScope(objectKey: string, eventId: string, speakerId: string): void {
  const expectedPrefix = `events/${eventId}/speakers/${speakerId}/files/`;
  if (!objectKey.startsWith(expectedPrefix) || objectKey.includes("..")) {
    throw new SpeakerFileError("objectKey is outside the speaker's storage scope", 400);
  }
}

export async function createPortalSpeakerFilePresign(
  rawToken: string,
  input: FileUploadInput,
): Promise<Awaited<ReturnType<typeof createSpeakerFilePresignedUpload>>> {
  const resolved = await resolveSpeakerPortalToken(rawToken);
  const normalized = normalizeUploadInput(input);

  return createSpeakerFilePresignedUpload({
    eventId: resolved.eventId,
    speakerId: resolved.speakerId,
    ...normalized,
  });
}

export async function finalizePortalSpeakerFile(
  rawToken: string,
  input: FileUploadInput & { objectKey: unknown },
): Promise<SpeakerFileRecord> {
  const resolved = await resolveSpeakerPortalToken(rawToken);
  const normalized = normalizeUploadInput(input);
  const objectKey = requireText(input.objectKey, "objectKey");
  assertObjectKeyScope(objectKey, resolved.eventId, resolved.speakerId);

  if (normalized.sessionId) {
    await assertSessionInEvent(resolved.eventId, normalized.sessionId);
    await assertSpeakerAssignedToSession(resolved.speakerId, normalized.sessionId);
  }

  return getPrisma().$transaction(async (tx) => {
    const version = await nextFileVersion(tx, {
      eventId: resolved.eventId,
      speakerId: resolved.speakerId,
      kind: normalized.kind,
      sessionId: normalized.sessionId,
    });

    return tx.speakerFile.create({
      data: {
        eventId: resolved.eventId,
        speakerId: resolved.speakerId,
        ...normalized,
        version,
        objectKey,
        uploadedViaPortal: true,
        uploadedByUserId: null,
      },
      select: fileSelect,
    });
  });
}

export async function listPortalSpeakerFiles(rawToken: string): Promise<SpeakerFileRecord[]> {
  const resolved = await resolveSpeakerPortalToken(rawToken);

  return getPrisma().speakerFile.findMany({
    where: { eventId: resolved.eventId, speakerId: resolved.speakerId },
    orderBy: { createdAt: "desc" },
    select: fileSelect,
  });
}
