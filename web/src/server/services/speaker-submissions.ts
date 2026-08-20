import { Prisma, UserRole } from "@prisma/client";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";
import { logSpeakerActivity } from "@/src/server/services/speaker-comms";

export class SpeakerSubmissionError extends Error {
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

const submissionSelect = {
  id: true,
  speakerId: true,
  eventId: true,
  status: true,
  name: true,
  title: true,
  company: true,
  bio: true,
  phone: true,
  headshotUrl: true,
  avNeeds: true,
  travelNeeds: true,
  dietaryRestrictions: true,
  topics: true,
  linkedinUrl: true,
  websiteUrl: true,
  noteToPlanner: true,
  submittedAt: true,
  reviewedAt: true,
  reviewedByUserId: true,
  speaker: {
    select: { id: true, name: true, email: true },
  },
} satisfies Prisma.SpeakerProfileSubmissionSelect;

export type SpeakerSubmissionRecord = Prisma.SpeakerProfileSubmissionGetPayload<{
  select: typeof submissionSelect;
}>;

function asSubmissionError(error: unknown, fallbackMessage: string): SpeakerSubmissionError {
  if (error instanceof SpeakerSubmissionError) {
    return error;
  }

  if (error instanceof EventAccessError) {
    return new SpeakerSubmissionError(error.message, error.status, error.reason);
  }

  return new SpeakerSubmissionError(fallbackMessage, 500);
}

async function getSubmissionInEventOrThrow(
  eventId: string,
  submissionId: string,
): Promise<SpeakerSubmissionRecord> {
  const submission = await getPrisma().speakerProfileSubmission.findFirst({
    where: { id: submissionId, eventId },
    select: submissionSelect,
  });

  if (!submission) {
    throw new SpeakerSubmissionError("Submission not found", 404);
  }

  return submission;
}

export async function listPendingSpeakerSubmissions(
  eventId: string,
  user: RequestUserContext,
): Promise<SpeakerSubmissionRecord[]> {
  try {
    await assertEventAccessForUser(eventId, user, "read");

    return await getPrisma().speakerProfileSubmission.findMany({
      where: { eventId, status: "PENDING" },
      orderBy: { submittedAt: "desc" },
      select: submissionSelect,
    });
  } catch (error) {
    throw asSubmissionError(error, "Failed to list pending submissions");
  }
}

export async function getSpeakerPendingSubmission(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
): Promise<SpeakerSubmissionRecord | null> {
  try {
    await assertEventAccessForUser(eventId, user, "read");

    return await getPrisma().speakerProfileSubmission.findFirst({
      where: { eventId, speakerId, status: "PENDING" },
      orderBy: { submittedAt: "desc" },
      select: submissionSelect,
    });
  } catch (error) {
    throw asSubmissionError(error, "Failed to load pending submission");
  }
}

/**
 * Applies an approved submission to the canonical Speaker.
 * Only non-null submitted values are applied — a submission can never
 * clear canonical data, and internal `notes` is never touched.
 */
function toApprovedSpeakerData(submission: SpeakerSubmissionRecord): Prisma.SpeakerUncheckedUpdateInput {
  const data: Prisma.SpeakerUncheckedUpdateInput = {};

  if (submission.name !== null) data.name = submission.name;
  if (submission.title !== null) data.title = submission.title;
  if (submission.company !== null) data.company = submission.company;
  if (submission.bio !== null) data.bio = submission.bio;
  if (submission.phone !== null) data.phone = submission.phone;
  if (submission.headshotUrl !== null) data.headshotUrl = submission.headshotUrl;
  if (submission.avNeeds !== null) data.avNeeds = submission.avNeeds;
  if (submission.travelNeeds !== null) data.travelNeeds = submission.travelNeeds;
  if (submission.dietaryRestrictions !== null) data.dietaryRestrictions = submission.dietaryRestrictions;
  if (submission.topics.length > 0) data.topics = submission.topics;
  if (submission.linkedinUrl !== null) data.linkedinUrl = submission.linkedinUrl;
  if (submission.websiteUrl !== null) data.websiteUrl = submission.websiteUrl;

  return data;
}

export async function approveSpeakerSubmission(
  eventId: string,
  submissionId: string,
  user: RequestUserContext,
): Promise<SpeakerSubmissionRecord> {
  try {
    await assertEventAccessForUser(eventId, user, "write");

    const submission = await getSubmissionInEventOrThrow(eventId, submissionId);

    if (submission.status !== "PENDING") {
      throw new SpeakerSubmissionError(
        `Submission was already ${submission.status.toLowerCase()}`,
        409,
      );
    }

    const now = new Date();

    const approved = await getPrisma().$transaction(async (tx) => {
      const speakerUpdate = await tx.speaker.updateMany({
        where: { id: submission.speakerId, eventId },
        data: toApprovedSpeakerData(submission),
      });
      if (speakerUpdate.count !== 1) {
        throw new SpeakerSubmissionError("Submission not found", 404);
      }

      return tx.speakerProfileSubmission.update({
        where: { id: submissionId },
        data: {
          status: "APPROVED",
          reviewedAt: now,
          reviewedByUserId: user.id,
        },
        select: submissionSelect,
      });
    });

    await logSpeakerActivity(eventId, user.id, "Speaker portal submission approved");

    return approved;
  } catch (error) {
    throw asSubmissionError(error, "Failed to approve submission");
  }
}

export async function rejectSpeakerSubmission(
  eventId: string,
  submissionId: string,
  user: RequestUserContext,
): Promise<SpeakerSubmissionRecord> {
  try {
    await assertEventAccessForUser(eventId, user, "write");

    const submission = await getSubmissionInEventOrThrow(eventId, submissionId);

    if (submission.status !== "PENDING") {
      throw new SpeakerSubmissionError(
        `Submission was already ${submission.status.toLowerCase()}`,
        409,
      );
    }

    // Rejection never touches the canonical Speaker.
    const rejected = await getPrisma().speakerProfileSubmission.update({
      where: { id: submissionId },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewedByUserId: user.id,
      },
      select: submissionSelect,
    });

    await logSpeakerActivity(eventId, user.id, "Speaker portal submission rejected");

    return rejected;
  } catch (error) {
    throw asSubmissionError(error, "Failed to reject submission");
  }
}
