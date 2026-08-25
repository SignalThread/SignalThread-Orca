import { UserRole } from "@prisma/client";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";
import { logSpeakerActivity } from "@/src/server/services/speaker-comms";

export class SpeakerOnsiteError extends Error {
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

export type SpeakerOnsiteInfoRecord = {
  greenRoomLocation: string | null;
  arrivalInstructions: string | null;
  badgePickupInfo: string | null;
  onsiteContact: string | null;
  avRehearsalInfo: string | null;
  updatedAt: Date | null;
};

const ONSITE_FIELDS = [
  "greenRoomLocation",
  "arrivalInstructions",
  "badgePickupInfo",
  "onsiteContact",
  "avRehearsalInfo",
] as const;

type OnsiteField = (typeof ONSITE_FIELDS)[number];

function optionalText(value: unknown, field: string): string | null {
  if (typeof value === "undefined" || value === null) return null;
  if (typeof value !== "string") {
    throw new SpeakerOnsiteError(`${field} must be a string`, 400);
  }
  const trimmed = value.trim();
  if (trimmed.length > 5000) {
    throw new SpeakerOnsiteError(`${field} is too long`, 400);
  }
  return trimmed || null;
}

function asOnsiteError(error: unknown, fallbackMessage: string): SpeakerOnsiteError {
  if (error instanceof SpeakerOnsiteError) return error;
  if (error instanceof EventAccessError) {
    return new SpeakerOnsiteError(error.message, error.status, error.reason);
  }
  return new SpeakerOnsiteError(fallbackMessage, 500);
}

export async function getSpeakerOnsiteInfo(
  eventId: string,
  user: RequestUserContext,
): Promise<SpeakerOnsiteInfoRecord> {
  try {
    await assertEventAccessForUser(eventId, user, "read");

    const info = await getPrisma().speakerOnsiteInfo.findUnique({
      where: { eventId },
      select: {
        greenRoomLocation: true,
        arrivalInstructions: true,
        badgePickupInfo: true,
        onsiteContact: true,
        avRehearsalInfo: true,
        updatedAt: true,
      },
    });

    return (
      info ?? {
        greenRoomLocation: null,
        arrivalInstructions: null,
        badgePickupInfo: null,
        onsiteContact: null,
        avRehearsalInfo: null,
        updatedAt: null,
      }
    );
  } catch (error) {
    throw asOnsiteError(error, "Failed to load onsite info");
  }
}

export async function upsertSpeakerOnsiteInfo(
  eventId: string,
  user: RequestUserContext,
  input: Partial<Record<OnsiteField, unknown>>,
): Promise<SpeakerOnsiteInfoRecord> {
  try {
    await assertEventAccessForUser(eventId, user, "write");

    const data: Record<string, string | null> = {};
    for (const field of ONSITE_FIELDS) {
      data[field] = optionalText(input[field], field);
    }

    const info = await getPrisma().speakerOnsiteInfo.upsert({
      where: { eventId },
      create: { eventId, ...data, updatedByUserId: user.id },
      update: { ...data, updatedByUserId: user.id },
      select: {
        greenRoomLocation: true,
        arrivalInstructions: true,
        badgePickupInfo: true,
        onsiteContact: true,
        avRehearsalInfo: true,
        updatedAt: true,
      },
    });

    await logSpeakerActivity(eventId, user.id, "Speaker onsite instructions updated");

    return info;
  } catch (error) {
    throw asOnsiteError(error, "Failed to save onsite info");
  }
}
