import { UserRole } from "@prisma/client";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { logSpeakerActivity } from "@/src/server/services/speaker-comms";
import {
  listSpeakerDocumentRequests,
} from "@/src/server/services/speaker-documents";
import { listSpeakerFiles } from "@/src/server/services/speaker-files";
import { listSpeakerMessages } from "@/src/server/services/speaker-comms";
import {
  getSpeakerPortalViewForAdminPreview,
  type SpeakerPortalView,
} from "@/src/server/services/speaker-portal";

export class SpeakerPortalPreviewError extends Error {
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

/** Speaker-eye shapes only — planner identities and internal data stripped. */
export type SpeakerPortalPreviewData = {
  view: SpeakerPortalView;
  files: Array<{
    id: string;
    filename: string;
    kind: string;
    sessionId: string | null;
    fileSizeBytes: number;
    version: number;
    reviewStatus: string;
    reviewFeedback: string | null;
    createdAt: Date;
  }>;
  documents: Array<{
    id: string;
    title: string;
    instructions: string | null;
    requiresSignature: boolean;
    status: string;
    submittedAt: Date | null;
    submittedFilename: string | null;
    feedback: string | null;
  }>;
  messages: Array<{
    id: string;
    senderType: "PLANNER" | "SPEAKER";
    body: string;
    createdAt: Date;
  }>;
};

/**
 * Read-only planner preview of the speaker portal.
 *
 * - Authenticates as the planner (event access), never via speaker tokens.
 * - Never mints, reads, or extends portal tokens.
 * - Returns display data only; there is no preview write path anywhere.
 * - Every preview open is audited.
 */
export async function getSpeakerPortalPreview(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
): Promise<SpeakerPortalPreviewData> {
  try {
    await assertEventAccessForUser(eventId, user, "read");

    const view = await getSpeakerPortalViewForAdminPreview(eventId, speakerId).catch(() => {
      throw new SpeakerPortalPreviewError("Speaker not found for this event", 404);
    });

    const [files, documents, messages] = await Promise.all([
      listSpeakerFiles(eventId, speakerId, user),
      listSpeakerDocumentRequests(eventId, speakerId, user),
      listSpeakerMessages(eventId, speakerId, user),
    ]);

    await logSpeakerActivity(eventId, user.id, `Speaker portal preview opened for ${view.speaker.name}`);

    return {
      view,
      files: files.map((file) => ({
        id: file.id,
        filename: file.filename,
        kind: file.kind,
        sessionId: file.sessionId,
        fileSizeBytes: file.fileSizeBytes,
        version: file.version,
        reviewStatus: file.reviewStatus,
        reviewFeedback: file.reviewFeedback,
        createdAt: file.createdAt,
      })),
      documents: documents.map((request) => ({
        id: request.id,
        title: request.title,
        instructions: request.instructions,
        requiresSignature: request.requiresSignature,
        status: request.status,
        submittedAt: request.submittedAt,
        submittedFilename: request.speakerFile?.filename ?? null,
        feedback: request.speakerFile?.reviewFeedback ?? null,
      })),
      // Speaker-eye view: planner names are not shown to speakers, so the
      // preview strips them too.
      messages: messages.map((message) => ({
        id: message.id,
        senderType: message.senderType,
        body: message.body,
        createdAt: message.createdAt,
      })),
    };
  } catch (error) {
    if (error instanceof SpeakerPortalPreviewError) throw error;
    if (error instanceof EventAccessError) {
      throw new SpeakerPortalPreviewError(error.message, error.status, error.reason);
    }
    throw new SpeakerPortalPreviewError("Failed to load portal preview", 500);
  }
}
