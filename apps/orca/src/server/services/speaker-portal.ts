import { getPrisma } from "@/lib/prisma";
import {
  markSpeakerPortalTokenSubmitted,
  resolveSpeakerPortalToken,
  SpeakerPortalTokenError,
} from "@/src/server/services/speaker-portal-tokens";

export class SpeakerPortalError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Speaker-facing profile shape. Deliberately excludes internal `notes`
 * and any admin-only data — never widen this without a security review.
 */
export type SpeakerPortalProfile = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  company: string | null;
  bio: string | null;
  headshotUrl: string | null;
  status: string;
  avNeeds: string | null;
  travelNeeds: string | null;
  dietaryRestrictions: string | null;
  topics: string[];
  linkedinUrl: string | null;
  websiteUrl: string | null;
};

export type SpeakerPortalSession = {
  id: string;
  sessionName: string | null;
  roomName: string | null;
  dayDate: string;
  startTime: string | null;
  endTime: string | null;
};

export type SpeakerPortalPendingSubmission = {
  id: string;
  submittedAt: string;
  status: string;
};

/** Event-level onsite instructions shown to every speaker for the event. */
export type SpeakerPortalOnsite = {
  greenRoomLocation: string | null;
  arrivalInstructions: string | null;
  badgePickupInfo: string | null;
  onsiteContact: string | null;
  avRehearsalInfo: string | null;
};

export type SpeakerPortalView = {
  eventName: string;
  speaker: SpeakerPortalProfile;
  sessions: SpeakerPortalSession[];
  pendingSubmission: SpeakerPortalPendingSubmission | null;
  onsite: SpeakerPortalOnsite | null;
};

export type SpeakerPortalSubmissionInput = {
  name?: unknown;
  title?: unknown;
  company?: unknown;
  bio?: unknown;
  phone?: unknown;
  headshotUrl?: unknown;
  avNeeds?: unknown;
  travelNeeds?: unknown;
  dietaryRestrictions?: unknown;
  topics?: unknown;
  linkedinUrl?: unknown;
  websiteUrl?: unknown;
  noteToPlanner?: unknown;
};

function optionalText(value: unknown, field: string, maxLength = 5000): string | null | undefined {
  if (typeof value === "undefined") return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new SpeakerPortalError(`${field} must be a string`, 400);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new SpeakerPortalError(`${field} is too long`, 400);
  }
  return trimmed || null;
}

function optionalTopics(value: unknown): string[] | undefined {
  if (typeof value === "undefined") return undefined;
  if (!Array.isArray(value)) {
    throw new SpeakerPortalError("topics must be an array of strings", 400);
  }
  const topics = value
    .map((entry) => {
      if (typeof entry !== "string") {
        throw new SpeakerPortalError("topics must be an array of strings", 400);
      }
      return entry.trim();
    })
    .filter(Boolean)
    .slice(0, 25);
  return topics;
}

/**
 * Shared portal view builder. Access must already be established by the
 * caller: a resolved portal token (speaker path) or planner event access
 * (read-only admin preview path). Loads exactly one speaker, scoped to the
 * given event, with the speaker-safe select only.
 */
async function buildSpeakerPortalViewData(speakerId: string, eventId: string): Promise<SpeakerPortalView> {
  const speaker = await getPrisma().speaker.findFirst({
    where: { id: speakerId, eventId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      title: true,
      company: true,
      bio: true,
      headshotUrl: true,
      status: true,
      avNeeds: true,
      travelNeeds: true,
      dietaryRestrictions: true,
      topics: true,
      linkedinUrl: true,
      websiteUrl: true,
      event: { select: { name: true } },
      sessionAssignments: {
        select: {
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
      },
      profileSubmissions: {
        where: { status: "PENDING" },
        orderBy: { submittedAt: "desc" },
        take: 1,
        select: { id: true, submittedAt: true, status: true },
      },
    },
  });

  if (!speaker) {
    throw new SpeakerPortalTokenError("Invalid portal link.", 401);
  }

  const pending = speaker.profileSubmissions[0] ?? null;

  const onsite = await getPrisma().speakerOnsiteInfo.findUnique({
    where: { eventId },
    select: {
      greenRoomLocation: true,
      arrivalInstructions: true,
      badgePickupInfo: true,
      onsiteContact: true,
      avRehearsalInfo: true,
    },
  });

  return {
    eventName: speaker.event.name,
    speaker: {
      id: speaker.id,
      name: speaker.name,
      email: speaker.email,
      phone: speaker.phone,
      title: speaker.title,
      company: speaker.company,
      bio: speaker.bio,
      headshotUrl: speaker.headshotUrl,
      status: speaker.status,
      avNeeds: speaker.avNeeds,
      travelNeeds: speaker.travelNeeds,
      dietaryRestrictions: speaker.dietaryRestrictions,
      topics: speaker.topics,
      linkedinUrl: speaker.linkedinUrl,
      websiteUrl: speaker.websiteUrl,
    },
    sessions: speaker.sessionAssignments
      .map(({ session }) => ({
        id: session.id,
        sessionName: session.sessionName,
        roomName: session.roomName,
        dayDate: session.dayDate.toISOString().slice(0, 10),
        startTime: session.startTime?.toISOString().slice(11, 16) ?? null,
        endTime: session.endTime?.toISOString().slice(11, 16) ?? null,
      }))
      .sort((a, b) => `${a.dayDate}${a.startTime ?? ""}`.localeCompare(`${b.dayDate}${b.startTime ?? ""}`)),
    pendingSubmission: pending
      ? {
          id: pending.id,
          submittedAt: pending.submittedAt.toISOString(),
          status: pending.status,
        }
      : null,
    onsite,
  };
}

export async function getSpeakerPortalView(rawToken: string): Promise<SpeakerPortalView> {
  const resolved = await resolveSpeakerPortalToken(rawToken);
  return buildSpeakerPortalViewData(resolved.speakerId, resolved.eventId);
}

/**
 * Read-only admin preview path. Callers MUST enforce planner event access
 * before calling this — it intentionally bypasses portal token resolution
 * so planner preview never mints or reuses speaker tokens.
 */
export async function getSpeakerPortalViewForAdminPreview(
  eventId: string,
  speakerId: string,
): Promise<SpeakerPortalView> {
  return buildSpeakerPortalViewData(speakerId, eventId);
}

export async function submitSpeakerPortalProfile(
  rawToken: string,
  input: SpeakerPortalSubmissionInput,
): Promise<SpeakerPortalPendingSubmission> {
  const resolved = await resolveSpeakerPortalToken(rawToken);

  const name = optionalText(input.name, "name", 300);
  if (name === null) {
    throw new SpeakerPortalError("name cannot be empty", 400);
  }

  const data = {
    name,
    title: optionalText(input.title, "title", 300),
    company: optionalText(input.company, "company", 300),
    bio: optionalText(input.bio, "bio", 10000),
    phone: optionalText(input.phone, "phone", 50),
    headshotUrl: optionalText(input.headshotUrl, "headshotUrl", 1000),
    avNeeds: optionalText(input.avNeeds, "avNeeds"),
    travelNeeds: optionalText(input.travelNeeds, "travelNeeds"),
    dietaryRestrictions: optionalText(input.dietaryRestrictions, "dietaryRestrictions"),
    topics: optionalTopics(input.topics),
    linkedinUrl: optionalText(input.linkedinUrl, "linkedinUrl", 500),
    websiteUrl: optionalText(input.websiteUrl, "websiteUrl", 500),
    noteToPlanner: optionalText(input.noteToPlanner, "noteToPlanner"),
  };

  const hasAnyField = Object.values(data).some((value) => typeof value !== "undefined" && value !== null);
  if (!hasAnyField) {
    throw new SpeakerPortalError("Submission must include at least one field", 400);
  }

  // Pending draft only — canonical Speaker is updated exclusively by admin approval.
  const submission = await getPrisma().speakerProfileSubmission.create({
    data: {
      speakerId: resolved.speakerId,
      eventId: resolved.eventId,
      tokenId: resolved.tokenId,
      status: "PENDING",
      ...Object.fromEntries(
        Object.entries(data).filter(([, value]) => typeof value !== "undefined"),
      ),
    },
    select: { id: true, submittedAt: true, status: true },
  });

  await markSpeakerPortalTokenSubmitted(resolved.tokenId);

  return {
    id: submission.id,
    submittedAt: submission.submittedAt.toISOString(),
    status: submission.status,
  };
}
