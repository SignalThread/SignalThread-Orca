import { Prisma, UserRole } from "@prisma/client";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";
import {
  createDocumentDraft,
  finalizeDocumentUpload,
  listDocumentCategoriesForEvent,
} from "@/src/server/services/documents";
import {
  finalizePortalSpeakerFile,
} from "@/src/server/services/speaker-files";
import { resolveSpeakerPortalToken } from "@/src/server/services/speaker-portal-tokens";
import { logSpeakerActivity } from "@/src/server/services/speaker-comms";

export class SpeakerDocumentError extends Error {
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
 * Status is always derived, never stored:
 * - Docs Hub Document.status stays the source of truth once a request is linked.
 * - Before linking, the submitted SpeakerFile review status drives it.
 * - With no submission, the request is simply assigned.
 */
export type SpeakerDocumentStatus =
  | "ASSIGNED"
  | "SUBMITTED"
  | "IN_REVIEW"
  | "APPROVED"
  | "REJECTED";

const requestSelect = {
  id: true,
  eventId: true,
  speakerId: true,
  title: true,
  instructions: true,
  requiresSignature: true,
  submittedAt: true,
  createdAt: true,
  documentId: true,
  document: { select: { id: true, title: true, status: true } },
  speakerFile: {
    select: {
      id: true,
      filename: true,
      fileSizeBytes: true,
      createdAt: true,
      reviewStatus: true,
      reviewFeedback: true,
    },
  },
} satisfies Prisma.SpeakerDocumentRequestSelect;

type RequestRow = Prisma.SpeakerDocumentRequestGetPayload<{ select: typeof requestSelect }>;

function deriveSpeakerDocumentStatus(row: RequestRow): SpeakerDocumentStatus {
  if (row.document) {
    switch (row.document.status) {
      case "IN_REVIEW":
        return "IN_REVIEW";
      case "APPROVED":
        return "APPROVED";
      case "REJECTED":
        return "REJECTED";
      default:
        return "SUBMITTED";
    }
  }

  if (row.speakerFile) {
    switch (row.speakerFile.reviewStatus) {
      case "NEEDS_CHANGES":
        return "REJECTED";
      case "APPROVED":
      case "FINAL":
        return "APPROVED";
      default:
        return "SUBMITTED";
    }
  }

  return "ASSIGNED";
}

export type SpeakerDocumentRequestAdminRecord = {
  id: string;
  title: string;
  instructions: string | null;
  requiresSignature: boolean;
  status: SpeakerDocumentStatus;
  submittedAt: Date | null;
  createdAt: Date;
  documentId: string | null;
  documentStatus: string | null;
  speakerFile: {
    id: string;
    filename: string;
    fileSizeBytes: number;
    createdAt: Date;
    reviewFeedback: string | null;
  } | null;
};

export type SpeakerDocumentRequestPortalRecord = {
  id: string;
  title: string;
  instructions: string | null;
  requiresSignature: boolean;
  status: SpeakerDocumentStatus;
  submittedAt: Date | null;
  submittedFilename: string | null;
  feedback: string | null;
};

function toAdminRecord(row: RequestRow): SpeakerDocumentRequestAdminRecord {
  return {
    id: row.id,
    title: row.title,
    instructions: row.instructions,
    requiresSignature: row.requiresSignature,
    status: deriveSpeakerDocumentStatus(row),
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    documentId: row.document?.id ?? null,
    documentStatus: row.document?.status ?? null,
    speakerFile: row.speakerFile
      ? {
          id: row.speakerFile.id,
          filename: row.speakerFile.filename,
          fileSizeBytes: row.speakerFile.fileSizeBytes,
          createdAt: row.speakerFile.createdAt,
          reviewFeedback: row.speakerFile.reviewFeedback,
        }
      : null,
  };
}

/** Portal payloads never expose Docs Hub internals — only the derived status. */
function toPortalRecord(row: RequestRow): SpeakerDocumentRequestPortalRecord {
  return {
    id: row.id,
    title: row.title,
    instructions: row.instructions,
    requiresSignature: row.requiresSignature,
    status: deriveSpeakerDocumentStatus(row),
    submittedAt: row.submittedAt,
    submittedFilename: row.speakerFile?.filename ?? null,
    feedback: row.speakerFile?.reviewFeedback ?? null,
  };
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new SpeakerDocumentError(`${field} is required`, 400);
  }
  return value.trim();
}

function asDocumentError(error: unknown, fallbackMessage: string): SpeakerDocumentError {
  if (error instanceof SpeakerDocumentError) return error;
  if (error instanceof EventAccessError) {
    return new SpeakerDocumentError(error.message, error.status, error.reason);
  }
  return new SpeakerDocumentError(fallbackMessage, 500);
}

async function assertSpeakerInEvent(eventId: string, speakerId: string): Promise<{ name: string }> {
  const speaker = await getPrisma().speaker.findFirst({
    where: { id: speakerId, eventId },
    select: { name: true },
  });

  if (!speaker) {
    throw new SpeakerDocumentError("Speaker not found", 404);
  }

  return speaker;
}

export async function listSpeakerDocumentRequests(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
): Promise<SpeakerDocumentRequestAdminRecord[]> {
  try {
    await assertEventAccessForUser(eventId, user, "read");
    await assertSpeakerInEvent(eventId, speakerId);

    const rows = await getPrisma().speakerDocumentRequest.findMany({
      where: { eventId, speakerId },
      orderBy: { createdAt: "desc" },
      select: requestSelect,
    });

    return rows.map(toAdminRecord);
  } catch (error) {
    throw asDocumentError(error, "Failed to list speaker documents");
  }
}

export async function createSpeakerDocumentRequest(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
  input: { title: unknown; instructions?: unknown; requiresSignature?: unknown },
): Promise<SpeakerDocumentRequestAdminRecord> {
  try {
    await assertEventAccessForUser(eventId, user, "write");
    await assertSpeakerInEvent(eventId, speakerId);

    const title = requireText(input.title, "title");
    let instructions: string | null = null;
    if (typeof input.instructions !== "undefined" && input.instructions !== null && input.instructions !== "") {
      if (typeof input.instructions !== "string") {
        throw new SpeakerDocumentError("instructions must be a string", 400);
      }
      instructions = input.instructions.trim() || null;
    }

    const row = await getPrisma().speakerDocumentRequest.create({
      data: {
        eventId,
        speakerId,
        title,
        instructions,
        requiresSignature: Boolean(input.requiresSignature),
        createdByUserId: user.id,
      },
      select: requestSelect,
    });

    await logSpeakerActivity(eventId, user.id, `Speaker document assigned: ${title}`);

    return toAdminRecord(row);
  } catch (error) {
    throw asDocumentError(error, "Failed to assign speaker document");
  }
}

/**
 * Promotes a submitted speaker document into Docs Hub through the canonical
 * Docs Hub service path (draft + version + submit for review). No approval
 * logic is duplicated here — Docs Hub owns review from this point on.
 */
export async function linkSpeakerDocumentToDocsHub(
  eventId: string,
  speakerId: string,
  requestId: string,
  user: RequestUserContext,
  input: { categoryId?: unknown } = {},
): Promise<SpeakerDocumentRequestAdminRecord> {
  try {
    await assertEventAccessForUser(eventId, user, "write");
    const speaker = await assertSpeakerInEvent(eventId, speakerId);

    const request = await getPrisma().speakerDocumentRequest.findFirst({
      where: { id: requestId, eventId, speakerId },
      select: {
        id: true,
        title: true,
        documentId: true,
        speakerFile: {
          select: {
            objectKey: true,
            contentType: true,
            fileSizeBytes: true,
            filename: true,
          },
        },
      },
    });

    if (!request) {
      throw new SpeakerDocumentError("Document request not found", 404);
    }
    if (request.documentId) {
      throw new SpeakerDocumentError("This document is already linked to Docs Hub", 409);
    }
    if (!request.speakerFile) {
      throw new SpeakerDocumentError("No submitted file to send to Docs Hub yet", 409);
    }

    let categoryId: string;
    if (typeof input.categoryId === "string" && input.categoryId.trim()) {
      categoryId = input.categoryId.trim();
    } else {
      const categories = await listDocumentCategoriesForEvent(eventId);
      const fallback =
        categories.find((category) => category.slug === "contracts") ?? categories[0];
      if (!fallback) {
        throw new SpeakerDocumentError("No Docs Hub categories exist for this event", 409);
      }
      categoryId = fallback.id;
    }

    const document = await createDocumentDraft(eventId, {
      title: `${speaker.name} — ${request.title}`,
      categoryId,
      visibility: "INTERNAL_ONLY",
      links: [{ linkType: "SPEAKER", linkedId: speakerId }],
    });

    await finalizeDocumentUpload(
      eventId,
      document.id,
      {
        objectKey: request.speakerFile.objectKey,
        mimeType: request.speakerFile.contentType,
        fileSizeBytes: request.speakerFile.fileSizeBytes,
        originalFilename: request.speakerFile.filename,
        submitForReview: true,
      },
      user.id,
    );

    const row = await getPrisma().speakerDocumentRequest.update({
      where: { id: request.id },
      data: { documentId: document.id },
      select: requestSelect,
    });

    await logSpeakerActivity(eventId, user.id, `Speaker document sent to Docs Hub: ${request.title}`);

    return toAdminRecord(row);
  } catch (error) {
    throw asDocumentError(error, "Failed to link speaker document to Docs Hub");
  }
}

export async function listPortalSpeakerDocumentRequests(
  rawToken: string,
): Promise<SpeakerDocumentRequestPortalRecord[]> {
  const resolved = await resolveSpeakerPortalToken(rawToken);

  const rows = await getPrisma().speakerDocumentRequest.findMany({
    where: { eventId: resolved.eventId, speakerId: resolved.speakerId },
    orderBy: { createdAt: "desc" },
    select: requestSelect,
  });

  return rows.map(toPortalRecord);
}

export async function submitPortalSpeakerDocument(
  rawToken: string,
  requestId: string,
  input: {
    filename: unknown;
    contentType: unknown;
    fileSizeBytes: unknown;
    objectKey: unknown;
  },
): Promise<SpeakerDocumentRequestPortalRecord> {
  const resolved = await resolveSpeakerPortalToken(rawToken);

  const request = await getPrisma().speakerDocumentRequest.findFirst({
    where: { id: requestId, eventId: resolved.eventId, speakerId: resolved.speakerId },
    select: { id: true },
  });

  if (!request) {
    throw new SpeakerDocumentError("Document request not found", 404);
  }

  // Reuse the canonical portal file path: token re-validation, type/size
  // checks, object key scoping, and immutable versioning all live there.
  const file = await finalizePortalSpeakerFile(rawToken, {
    kind: "AGREEMENT",
    filename: input.filename,
    contentType: input.contentType,
    fileSizeBytes: input.fileSizeBytes,
    objectKey: input.objectKey,
  });

  const row = await getPrisma().speakerDocumentRequest.update({
    where: { id: request.id },
    data: { speakerFileId: file.id, submittedAt: new Date() },
    select: requestSelect,
  });

  return toPortalRecord(row);
}
