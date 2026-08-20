import { UserRole } from "@prisma/client";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";

export class SpeakerReadinessError extends Error {
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

export const SPEAKER_READINESS_FLAGS = [
  { key: "missing_bio", label: "Missing bio" },
  { key: "missing_headshot", label: "Missing headshot" },
  { key: "missing_title_company", label: "Missing title/company" },
  { key: "missing_av_needs", label: "Missing AV needs" },
  { key: "missing_travel_needs", label: "Missing travel needs" },
  { key: "missing_dietary", label: "Missing dietary" },
  { key: "missing_deck", label: "Missing deck" },
  { key: "deck_not_approved", label: "Deck not approved" },
  { key: "docs_incomplete", label: "Docs incomplete" },
  { key: "request_not_sent", label: "Request not sent" },
  { key: "request_pending", label: "Request pending" },
  { key: "submitted_pending_review", label: "Pending review" },
  { key: "complete", label: "Complete" },
] as const;

export type SpeakerReadinessFlag = (typeof SPEAKER_READINESS_FLAGS)[number]["key"];

export type SpeakerReadinessEntry = {
  speakerId: string;
  flags: SpeakerReadinessFlag[];
};

export type SpeakerReadinessOverview = {
  total: number;
  counts: Record<SpeakerReadinessFlag, number>;
  speakers: SpeakerReadinessEntry[];
};

type ReadinessSpeakerRow = {
  id: string;
  bio: string | null;
  headshotUrl: string | null;
  title: string | null;
  company: string | null;
  avNeeds: string | null;
  travelNeeds: string | null;
  dietaryRestrictions: string | null;
  intakeTokens: Array<{ submittedAt: Date | null; revokedAt: Date | null; expiresAt: Date }>;
  profileSubmissions: Array<{ id: string }>;
  /** Latest SLIDES file only — readiness derives from canonical SpeakerFile review state. */
  files: Array<{ reviewStatus: string }>;
  /** Open document requests with linked Docs Hub / submission review state. */
  documentRequests: Array<{
    speakerFileId: string | null;
    speakerFile: { reviewStatus: string } | null;
    document: { status: string } | null;
  }>;
};

/** Deterministic, server-side readiness flags computed from canonical Speaker state. */
export function computeSpeakerReadinessFlags(speaker: ReadinessSpeakerRow, asOf = new Date()): SpeakerReadinessFlag[] {
  const flags: SpeakerReadinessFlag[] = [];

  if (!speaker.bio?.trim()) flags.push("missing_bio");
  if (!speaker.headshotUrl?.trim()) flags.push("missing_headshot");
  if (!speaker.title?.trim() || !speaker.company?.trim()) flags.push("missing_title_company");
  if (!speaker.avNeeds?.trim()) flags.push("missing_av_needs");
  if (!speaker.travelNeeds?.trim()) flags.push("missing_travel_needs");
  if (!speaker.dietaryRestrictions?.trim()) flags.push("missing_dietary");

  // Deck readiness derives from the latest SLIDES version's review status.
  const latestDeck = speaker.files[0] ?? null;
  if (!latestDeck) {
    flags.push("missing_deck");
  } else if (latestDeck.reviewStatus !== "APPROVED" && latestDeck.reviewStatus !== "FINAL") {
    flags.push("deck_not_approved");
  }

  // Document readiness: every assigned document must be submitted and approved
  // (Docs Hub status wins once linked; otherwise the file review status).
  const hasIncompleteDocs = speaker.documentRequests.some((request) => {
    if (request.document) return request.document.status !== "APPROVED";
    if (request.speakerFile) {
      return request.speakerFile.reviewStatus !== "APPROVED" && request.speakerFile.reviewStatus !== "FINAL";
    }
    return request.speakerFileId === null;
  });
  if (hasIncompleteDocs) {
    flags.push("docs_incomplete");
  }

  const hasPendingReview = speaker.profileSubmissions.length > 0;
  if (hasPendingReview) {
    flags.push("submitted_pending_review");
  }

  if (speaker.intakeTokens.length === 0) {
    flags.push("request_not_sent");
  } else if (!hasPendingReview) {
    const latest = speaker.intakeTokens[0];
    const isActive = !latest.revokedAt && latest.expiresAt.getTime() >= asOf.getTime();
    if (isActive && !latest.submittedAt) {
      flags.push("request_pending");
    }
  }

  if (flags.length === 0) {
    flags.push("complete");
  }

  return flags;
}

export async function getSpeakerReadinessOverview(
  eventId: string,
  user: RequestUserContext,
): Promise<SpeakerReadinessOverview> {
  try {
    await assertEventAccessForUser(eventId, user, "read");

    const speakers = await getPrisma().speaker.findMany({
      where: { eventId },
      select: {
        id: true,
        bio: true,
        headshotUrl: true,
        title: true,
        company: true,
        avNeeds: true,
        travelNeeds: true,
        dietaryRestrictions: true,
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

    const counts = Object.fromEntries(
      SPEAKER_READINESS_FLAGS.map(({ key }) => [key, 0]),
    ) as Record<SpeakerReadinessFlag, number>;

    const entries: SpeakerReadinessEntry[] = speakers.map((speaker) => {
      const flags = computeSpeakerReadinessFlags(speaker);
      for (const flag of flags) {
        counts[flag] += 1;
      }
      return { speakerId: speaker.id, flags };
    });

    return {
      total: speakers.length,
      counts,
      speakers: entries,
    };
  } catch (error) {
    if (error instanceof EventAccessError) {
      throw new SpeakerReadinessError(error.message, error.status, error.reason);
    }
    if (error instanceof SpeakerReadinessError) {
      throw error;
    }
    throw new SpeakerReadinessError("Failed to load speaker readiness", 500);
  }
}
