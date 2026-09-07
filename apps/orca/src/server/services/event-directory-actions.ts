import type { EventAccessUser } from "@/lib/event-access";
import { assertEventAccessForUser } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";
import { cancelEventAttendee } from "@/src/server/services/event-attendee";

export class DirectoryActionError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "DIRECTORY_ACTION_ERROR") { super(message); }
}

async function personForEvent(eventId: string, personId: string) {
  const person = await getPrisma().eventDirectoryPerson.findFirst({
    where: { id: personId, eventId, deletedAt: null },
    include: {
      attendee: { include: { registrationRecords: { orderBy: { updatedAt: "desc" } } } },
      moduleLinks: { where: { module: "SPEAKER" } },
    },
  });
  if (!person) throw new DirectoryActionError("Directory person not found", 404, "DIRECTORY_PERSON_NOT_FOUND");
  return person;
}

export async function getEventDirectoryActionContext(args: { eventId: string; personId: string; user: EventAccessUser }) {
  await assertEventAccessForUser(args.eventId, args.user, "read");
  const person = await personForEvent(args.eventId, args.personId);
  const speakerId = person.moduleLinks[0]?.moduleRecordId ?? null;
  const speaker = speakerId ? await getPrisma().speaker.findFirst({
    where: { id: speakerId, eventId: args.eventId },
    select: {
      id: true, name: true, email: true, bio: true, headshotUrl: true, intakeTokenSentAt: true,
      sessionAssignments: { select: { session: { select: { id: true, sessionName: true, dayDate: true, startTime: true, endTime: true, roomName: true } } }, orderBy: { createdAt: "asc" } },
    },
  }) : null;
  const attendee = person.attendee;
  return {
    personId: person.id,
    attendee: attendee ? {
      id: attendee.id,
      registrationStatus: attendee.registrationStatus,
      registrationType: attendee.registrationType,
      badgeType: attendee.badgeType,
      ticketType: attendee.ticketType,
      registeredAt: attendee.registeredAt?.toISOString() ?? null,
      housingHotelName: attendee.housingHotelName,
      housingRoomNumber: attendee.housingRoomNumber,
      registrationRecords: attendee.registrationRecords.map((record) => ({
        id: record.id,
        provider: record.provider,
        externalRegistrationId: record.externalRegistrationId,
        registrationStatus: record.registrationStatus,
        lastSyncedAt: record.lastSyncedAt?.toISOString() ?? null,
      })),
      actions: {
        cancel: { available: attendee.registrationStatus !== "CANCELLED", regBacked: true, reason: attendee.registrationStatus === "CANCELLED" ? "Registration is already cancelled." : null },
        transfer: { available: false, regBacked: true, reason: "No write-capable Registration transfer adapter is connected." },
        resendConfirmation: { available: false, regBacked: true, reason: "No Registration confirmation email provider is connected." },
        assignRoom: { available: true, regBacked: true, reason: null },
      },
    } : null,
    speaker: speaker ? {
      id: speaker.id,
      name: speaker.name,
      email: speaker.email,
      bio: speaker.bio,
      headshotUrl: speaker.headshotUrl,
      sessions: speaker.sessionAssignments.map(({ session }) => ({
        id: session.id,
        title: session.sessionName?.trim() || "Untitled Session",
        date: session.dayDate.toISOString().slice(0, 10),
        startTime: session.startTime?.toISOString().slice(11, 16) ?? null,
        endTime: session.endTime?.toISOString().slice(11, 16) ?? null,
        roomName: session.roomName,
      })),
      portalAccess: {
        available: false,
        regBacked: true,
        reason: speaker.intakeTokenSentAt
          ? "Portal access exists, but no email provider is connected to resend it. Copy the portal link from Speakers."
          : "Generate portal access in Speakers before resending it.",
      },
    } : null,
  };
}

export async function runEventDirectoryAction(args: {
  eventId: string;
  personId: string;
  user: EventAccessUser;
  action: unknown;
  hotelName?: unknown;
  roomNumber?: unknown;
}) {
  await assertEventAccessForUser(args.eventId, args.user, "write");
  const person = await personForEvent(args.eventId, args.personId);
  const action = typeof args.action === "string" ? args.action : "";
  if (action === "cancel-registration") {
    if (!person.attendee) throw new DirectoryActionError("This person has no attendee registration.", 409, "ACTION_UNAVAILABLE");
    if (person.attendee.registrationStatus === "CANCELLED") throw new DirectoryActionError("Registration is already cancelled.", 409, "ALREADY_CANCELLED");
    await cancelEventAttendee({ eventId: args.eventId, attendeeId: person.attendee.id, user: args.user });
    return { action, status: "completed" as const };
  }
  if (action === "assign-room") {
    if (!person.attendee) throw new DirectoryActionError("This person has no attendee registration.", 409, "ACTION_UNAVAILABLE");
    const hotelName = typeof args.hotelName === "string" ? args.hotelName.trim() : "";
    const roomNumber = typeof args.roomNumber === "string" ? args.roomNumber.trim() : "";
    if (!hotelName && !roomNumber) throw new DirectoryActionError("Hotel or room number is required.", 400, "HOUSING_VALIDATION");
    await getPrisma().eventAttendee.update({
      where: { id: person.attendee.id },
      data: { housingHotelName: hotelName || null, housingRoomNumber: roomNumber || null, syncedByUserId: args.user.id },
    });
    return { action, status: "completed" as const };
  }
  if (["transfer-registration", "resend-confirmation", "resend-speaker-portal"].includes(action)) {
    throw new DirectoryActionError("This Reg-backed action is unavailable because no supporting provider adapter is connected.", 409, "ACTION_UNAVAILABLE");
  }
  throw new DirectoryActionError("Unsupported directory action", 400, "UNSUPPORTED_ACTION");
}
