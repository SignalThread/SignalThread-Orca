import { Prisma, SpeakerStatus, UserRole } from "@prisma/client";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";
import { logSpeakerActivity } from "@/src/server/services/speaker-comms";
import {
  createSpeakerHeadshotPresignedUpload,
  validateSpeakerHeadshotUpload,
} from "@/src/server/storage/speakers";

export class SpeakerServiceError extends Error {
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const speakerSelect = {
  id: true,
  eventId: true,
  name: true,
  email: true,
  phone: true,
  title: true,
  company: true,
  bio: true,
  headshotUrl: true,
  status: true,
  notes: true,
  avNeeds: true,
  travelNeeds: true,
  dietaryRestrictions: true,
  topics: true,
  linkedinUrl: true,
  websiteUrl: true,
  intakeTokenSentAt: true,
  intakeSubmittedAt: true,
  reminderSentAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SpeakerSelect;

// Directory/list select: the same shape minus the heavy free-text/array fields
// (bio, notes, avNeeds, travelNeeds, dietaryRestrictions, topics) that the
// directory grid never renders. Detail/create/update paths still use the full
// speakerSelect. Keeps the list payload light without hiding any speaker.
const speakerListSelect = {
  id: true,
  eventId: true,
  name: true,
  email: true,
  phone: true,
  title: true,
  company: true,
  headshotUrl: true,
  status: true,
  linkedinUrl: true,
  websiteUrl: true,
  intakeTokenSentAt: true,
  intakeSubmittedAt: true,
  reminderSentAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SpeakerSelect;

export type SpeakerRecord = Prisma.SpeakerGetPayload<{
  select: typeof speakerSelect;
}>;

export type SpeakerListRecord = Prisma.SpeakerGetPayload<{
  select: typeof speakerListSelect;
}>;

export type PublicSpeakerIntakeRecord = SpeakerRecord & {
  event: {
    name: string;
  };
};

type SpeakerCreateData = Omit<Prisma.SpeakerUncheckedCreateInput, "eventId">;

export type SpeakerCsvImportRow = {
  rowNumber: number;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  title?: unknown;
  company?: unknown;
  phone?: unknown;
  status?: unknown;
  bio?: unknown;
  topics?: unknown;
  avNeeds?: unknown;
  travelNeeds?: unknown;
  dietaryRestrictions?: unknown;
  linkedinUrl?: unknown;
  websiteUrl?: unknown;
};

export type SpeakerCsvImportSummary = {
  imported: number;
  skipped: number;
  duplicates: number;
  failed: number;
  errors: Array<{
    row: number;
    message: string;
  }>;
};

function isSpeakerStatus(value: unknown): value is SpeakerStatus {
  return typeof value === "string" && Object.values(SpeakerStatus).includes(value as SpeakerStatus);
}

function normalizeRequiredText(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new SpeakerServiceError(`${field} must be a string`, 400);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new SpeakerServiceError(`${field} is required`, 400);
  }

  return trimmed;
}

function normalizeOptionalText(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value === "undefined") return null;
  if (typeof value !== "string") {
    throw new SpeakerServiceError(`${field} must be a string`, 400);
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalEmail(value: unknown): string | null {
  const email = normalizeOptionalText(value, "email");
  return email ? email.toLowerCase() : null;
}

function normalizeSpeakerStatus(value: unknown): SpeakerStatus {
  if (!isSpeakerStatus(value)) {
    throw new SpeakerServiceError("status must be one of: NEEDS_INFO, INVITED, CONFIRMED, CANCELLED", 400);
  }
  return value;
}

function normalizeCsvStatus(value: string): SpeakerStatus {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return SpeakerStatus.NEEDS_INFO;
  if (normalized === "NEEDS INFO") return SpeakerStatus.NEEDS_INFO;
  return normalizeSpeakerStatus(normalized);
}

function speakerNameKey(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, " ").toLowerCase();
}

function normalizeCsvTextValue(value: unknown, field: string): string | null {
  if (typeof value === "undefined" || value === null) return null;
  if (typeof value !== "string") {
    throw new SpeakerServiceError(`${field} must be a string`, 400);
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function rowNumberFromInput(value: unknown): number {
  const rowNumber = Number(value);
  return Number.isInteger(rowNumber) && rowNumber > 0 ? rowNumber : 0;
}

async function assertEventAccess(
  eventId: string,
  user: RequestUserContext,
  accessType: "read" | "write",
): Promise<void> {
  await assertEventAccessForUser(eventId, user, accessType);
}

async function assertDuplicateEmailAbsent(eventId: string, email: string | null, speakerId?: string): Promise<void> {
  if (!email) return;

  const duplicate = await getPrisma().speaker.findFirst({
    where: {
      eventId,
      email,
      ...(speakerId ? { id: { not: speakerId } } : {}),
    },
    select: { id: true },
  });

  if (duplicate) {
    throw new SpeakerServiceError("A speaker with that email already exists for this event", 409);
  }
}

async function getSpeakerOrThrow(eventId: string, speakerId: string): Promise<{ id: string; name: string }> {
  if (!UUID_REGEX.test(speakerId)) {
    throw new SpeakerServiceError("speakerId must be a valid UUID", 400);
  }

  const speaker = await getPrisma().speaker.findFirst({
    where: {
      id: speakerId,
      eventId,
    },
    select: { id: true, name: true },
  });

  if (!speaker) {
    throw new SpeakerServiceError("Speaker not found", 404);
  }

  return speaker;
}

function toSpeakerPayload(input: Record<string, unknown>): SpeakerCreateData {
  return {
    name: normalizeRequiredText(input.name, "name"),
    email: normalizeOptionalEmail(input.email),
    phone: normalizeOptionalText(input.phone, "phone"),
    title: normalizeOptionalText(input.title, "title"),
    company: normalizeOptionalText(input.company, "company"),
    bio: normalizeOptionalText(input.bio, "bio"),
    headshotUrl: normalizeOptionalText(input.headshotUrl, "headshotUrl"),
    notes: normalizeOptionalText(input.notes, "notes"),
    status: typeof input.status === "undefined" ? SpeakerStatus.NEEDS_INFO : normalizeSpeakerStatus(input.status),
  };
}

function toSpeakerUpdatePayload(input: Record<string, unknown>): Prisma.SpeakerUpdateInput {
  const data: Prisma.SpeakerUpdateInput = {};

  if (typeof input.name !== "undefined") data.name = normalizeRequiredText(input.name, "name");
  if (typeof input.email !== "undefined") data.email = normalizeOptionalEmail(input.email);
  if (typeof input.phone !== "undefined") data.phone = normalizeOptionalText(input.phone, "phone");
  if (typeof input.title !== "undefined") data.title = normalizeOptionalText(input.title, "title");
  if (typeof input.company !== "undefined") data.company = normalizeOptionalText(input.company, "company");
  if (typeof input.bio !== "undefined") data.bio = normalizeOptionalText(input.bio, "bio");
  if (typeof input.headshotUrl !== "undefined") data.headshotUrl = normalizeOptionalText(input.headshotUrl, "headshotUrl");
  if (typeof input.notes !== "undefined") data.notes = normalizeOptionalText(input.notes, "notes");
  if (typeof input.status !== "undefined") data.status = normalizeSpeakerStatus(input.status);

  if (Object.keys(data).length === 0) {
    throw new SpeakerServiceError("At least one updatable field is required", 400);
  }

  return data;
}

function resolveStatusAfterPublicIntake(currentStatus: SpeakerStatus, nextSpeaker: {
  name: string | null;
  email: string | null;
  bio: string | null;
  title: string | null;
  company: string | null;
}): SpeakerStatus {
  const isMissingRequiredProfileFields = !nextSpeaker.name?.trim()
    || !nextSpeaker.email?.trim()
    || !nextSpeaker.bio?.trim()
    || !nextSpeaker.title?.trim()
    || !nextSpeaker.company?.trim();

  if (isMissingRequiredProfileFields && currentStatus === SpeakerStatus.NEEDS_INFO) {
    return SpeakerStatus.NEEDS_INFO;
  }

  return currentStatus;
}

function toPublicSpeakerIntakeUpdatePayload(
  currentSpeaker: SpeakerRecord,
  input: Record<string, unknown>,
): Prisma.SpeakerUpdateInput {
  const data: Prisma.SpeakerUpdateInput = {};

  if (typeof input.name !== "undefined") data.name = normalizeRequiredText(input.name, "name");
  if (typeof input.phone !== "undefined") data.phone = normalizeOptionalText(input.phone, "phone");
  if (typeof input.title !== "undefined") data.title = normalizeOptionalText(input.title, "title");
  if (typeof input.company !== "undefined") data.company = normalizeOptionalText(input.company, "company");
  if (typeof input.bio !== "undefined") data.bio = normalizeOptionalText(input.bio, "bio");
  if (typeof input.headshotUrl !== "undefined") data.headshotUrl = normalizeOptionalText(input.headshotUrl, "headshotUrl");

  if (Object.keys(data).length === 0) {
    throw new SpeakerServiceError("At least one updatable field is required", 400);
  }

  const nextSpeakerState = {
    name: typeof data.name === "string" ? data.name : currentSpeaker.name,
    email: currentSpeaker.email,
    bio: typeof data.bio === "string" || data.bio === null ? data.bio : currentSpeaker.bio,
    title: typeof data.title === "string" || data.title === null ? data.title : currentSpeaker.title,
    company: typeof data.company === "string" || data.company === null ? data.company : currentSpeaker.company,
  };

  data.status = resolveStatusAfterPublicIntake(currentSpeaker.status, nextSpeakerState);
  return data;
}

function asSpeakerServiceError(error: unknown, fallbackMessage: string): SpeakerServiceError {
  if (error instanceof SpeakerServiceError) {
    return error;
  }

  if (error instanceof EventAccessError) {
    return new SpeakerServiceError(error.message, error.status, error.reason);
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return new SpeakerServiceError("A speaker with that email already exists for this event", 409);
  }

  return new SpeakerServiceError(fallbackMessage, 500);
}

export async function listSpeakers(eventId: string, user: RequestUserContext): Promise<SpeakerListRecord[]> {
  try {
    await assertEventAccess(eventId, user, "read");
    return await getPrisma().speaker.findMany({
      where: { eventId },
      orderBy: [
        { name: "asc" },
        { createdAt: "desc" },
      ],
      select: speakerListSelect,
    });
  } catch (error) {
    throw asSpeakerServiceError(error, "Failed to list speakers");
  }
}

export async function createSpeaker(
  eventId: string,
  user: RequestUserContext,
  input: Record<string, unknown>,
): Promise<SpeakerRecord> {
  try {
    await assertEventAccess(eventId, user, "write");

    const payload = toSpeakerPayload(input);
    await assertDuplicateEmailAbsent(eventId, payload.email ?? null);

    const created = await getPrisma().speaker.create({
      data: {
        ...payload,
        eventId,
      },
      select: speakerSelect,
    });

    await logSpeakerActivity(eventId, user.id, `Speaker created: ${created.name}`);

    return created;
  } catch (error) {
    throw asSpeakerServiceError(error, "Failed to create speaker");
  }
}

export async function getSpeaker(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
): Promise<SpeakerRecord> {
  try {
    await assertEventAccess(eventId, user, "read");
    await getSpeakerOrThrow(eventId, speakerId);

    return await getPrisma().speaker.findUniqueOrThrow({
      where: { id: speakerId },
      select: speakerSelect,
    });
  } catch (error) {
    throw asSpeakerServiceError(error, "Failed to load speaker");
  }
}

export async function updateSpeaker(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
  input: Record<string, unknown>,
): Promise<SpeakerRecord> {
  try {
    await assertEventAccess(eventId, user, "write");
    await getSpeakerOrThrow(eventId, speakerId);

    const data = toSpeakerUpdatePayload(input);
    const nextEmail = typeof input.email !== "undefined" ? normalizeOptionalEmail(input.email) : undefined;
    if (typeof nextEmail !== "undefined") {
      await assertDuplicateEmailAbsent(eventId, nextEmail, speakerId);
    }

    const updated = await getPrisma().speaker.update({
      where: { id: speakerId },
      data,
      select: speakerSelect,
    });

    await logSpeakerActivity(eventId, user.id, `Speaker updated: ${updated.name}`);

    return updated;
  } catch (error) {
    throw asSpeakerServiceError(error, "Failed to update speaker");
  }
}

export async function deleteSpeaker(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
): Promise<{ id: string }> {
  try {
    await assertEventAccess(eventId, user, "write");
    const existing = await getSpeakerOrThrow(eventId, speakerId);

    await getPrisma().speaker.delete({
      where: { id: speakerId },
    });

    await logSpeakerActivity(eventId, user.id, `Speaker deleted: ${existing.name}`);

    return { id: speakerId };
  } catch (error) {
    throw asSpeakerServiceError(error, "Failed to delete speaker");
  }
}

export async function importSpeakersFromMappedRows(
  eventId: string,
  user: RequestUserContext,
  rows: SpeakerCsvImportRow[],
): Promise<SpeakerCsvImportSummary> {
  try {
    await assertEventAccess(eventId, user, "write");

    if (!Array.isArray(rows)) {
      throw new SpeakerServiceError("rows must be an array", 400);
    }

    const existingSpeakers = await getPrisma().speaker.findMany({
      where: { eventId },
      select: {
        name: true,
        email: true,
      },
    });

    const seenEmails = new Set(
      existingSpeakers
        .map((speaker) => speaker.email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email)),
    );
    const seenNames = new Set(
      existingSpeakers.map((speaker) => speaker.name.trim().replace(/\s+/g, " ").toLowerCase()),
    );
    const summary: SpeakerCsvImportSummary = {
      imported: 0,
      skipped: 0,
      duplicates: 0,
      failed: 0,
      errors: [],
    };

    for (const row of rows) {
      const rowNumber = rowNumberFromInput(row.rowNumber);
      const firstName = normalizeCsvTextValue(row.firstName, "firstName");
      const lastName = normalizeCsvTextValue(row.lastName, "lastName");
      const email = normalizeOptionalEmail(row.email);
      const title = normalizeCsvTextValue(row.title, "title");
      const company = normalizeCsvTextValue(row.company, "company");
      const phone = normalizeCsvTextValue(row.phone, "phone");
      const statusValue = normalizeCsvTextValue(row.status, "status");
      const bio = normalizeCsvTextValue(row.bio, "bio");
      const topicsValue = normalizeCsvTextValue(row.topics, "topics");
      const avNeeds = normalizeCsvTextValue(row.avNeeds, "avNeeds");
      const travelNeeds = normalizeCsvTextValue(row.travelNeeds, "travelNeeds");
      const dietaryRestrictions = normalizeCsvTextValue(row.dietaryRestrictions, "dietaryRestrictions");
      const linkedinUrl = normalizeCsvTextValue(row.linkedinUrl, "linkedinUrl");
      const websiteUrl = normalizeCsvTextValue(row.websiteUrl, "websiteUrl");

      const hasEnrichedValue = Boolean(
        topicsValue || avNeeds || travelNeeds || dietaryRestrictions || linkedinUrl || websiteUrl,
      );

      if (!firstName && !lastName && !email && !title && !company && !phone && !statusValue && !bio && !hasEnrichedValue) {
        summary.skipped += 1;
        continue;
      }

      if (!firstName || !lastName) {
        summary.failed += 1;
        summary.errors.push({ row: rowNumber, message: "firstName and lastName are required" });
        continue;
      }

      const name = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
      const nameKey = speakerNameKey(firstName, lastName);

      if ((email && seenEmails.has(email)) || seenNames.has(nameKey)) {
        summary.duplicates += 1;
        summary.skipped += 1;
        continue;
      }

      try {
        const status = normalizeCsvStatus(statusValue ?? "");
        const topics = topicsValue
          ? topicsValue
              .split(/[;,]/)
              .map((topic) => topic.trim())
              .filter(Boolean)
              .slice(0, 25)
          : [];

        await getPrisma().speaker.create({
          data: {
            eventId,
            name,
            email,
            phone,
            title,
            company,
            bio,
            status,
            topics,
            avNeeds,
            travelNeeds,
            dietaryRestrictions,
            linkedinUrl,
            websiteUrl,
          },
        });

        summary.imported += 1;
        if (email) seenEmails.add(email);
        seenNames.add(nameKey);
      } catch (error) {
        const handled = asSpeakerServiceError(error, "Failed to import speaker row");
        if (handled.status === 409) {
          summary.duplicates += 1;
          summary.skipped += 1;
          if (email) seenEmails.add(email);
          seenNames.add(nameKey);
        } else {
          summary.failed += 1;
          summary.errors.push({ row: rowNumber, message: handled.message });
        }
      }
    }

    if (summary.imported > 0) {
      await logSpeakerActivity(eventId, user.id, `Speakers imported from CSV: ${summary.imported}`);
    }

    return summary;
  } catch (error) {
    throw asSpeakerServiceError(error, "Failed to import speakers");
  }
}

export async function getSpeakerForPublicIntake(
  eventId: string,
  speakerId: string,
): Promise<PublicSpeakerIntakeRecord> {
  try {
    if (!UUID_REGEX.test(eventId)) {
      throw new SpeakerServiceError("eventId must be a valid UUID", 400);
    }

    if (!UUID_REGEX.test(speakerId)) {
      throw new SpeakerServiceError("speakerId must be a valid UUID", 400);
    }

    const speaker = await getPrisma().speaker.findFirst({
      where: {
        id: speakerId,
        eventId,
      },
      select: {
        ...speakerSelect,
        event: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!speaker) {
      throw new SpeakerServiceError("Speaker not found", 404);
    }

    return speaker;
  } catch (error) {
    throw asSpeakerServiceError(error, "Failed to load speaker intake");
  }
}

export async function submitSpeakerPublicIntake(
  eventId: string,
  speakerId: string,
  input: Record<string, unknown>,
): Promise<SpeakerRecord> {
  try {
    const currentSpeaker = await getSpeakerForPublicIntake(eventId, speakerId);
    const data = toPublicSpeakerIntakeUpdatePayload(currentSpeaker, input);

    return await getPrisma().speaker.update({
      where: { id: speakerId },
      data,
      select: speakerSelect,
    });
  } catch (error) {
    throw asSpeakerServiceError(error, "Failed to submit speaker intake");
  }
}

export async function createAdminSpeakerHeadshotPresign(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
  input: {
    filename: string;
    contentType: string;
    fileSizeBytes: number;
  },
): Promise<Awaited<ReturnType<typeof createSpeakerHeadshotPresignedUpload>>> {
  try {
    await assertEventAccess(eventId, user, "write");
    await getSpeakerOrThrow(eventId, speakerId);

    const filename = normalizeRequiredText(input.filename, "filename");
    const contentType = normalizeRequiredText(input.contentType, "contentType").toLowerCase();

    try {
      validateSpeakerHeadshotUpload(contentType, input.fileSizeBytes);
    } catch (validationError) {
      throw new SpeakerServiceError(
        validationError instanceof Error ? validationError.message : "Invalid headshot upload",
        400,
      );
    }

    return await createSpeakerHeadshotPresignedUpload({
      eventId,
      speakerId,
      filename,
      contentType,
      fileSizeBytes: input.fileSizeBytes,
    });
  } catch (error) {
    throw asSpeakerServiceError(error, "Failed to create headshot upload");
  }
}
