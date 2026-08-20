import {
  Prisma,
  type EventAttendeeSessionEnrollment,
  type EventAttendeeSessionEnrollmentSource,
  type EventAttendeeSessionEnrollmentStatus,
} from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export type EnrollmentErrorCode =
  | "ENROLLMENT_NOT_FOUND"
  | "ENROLLMENT_VALIDATION"
  | "ENROLLMENT_EVENT_MISMATCH"
  | "EXTERNAL_ENROLLMENT_DUPLICATE";

export class EventAttendeeSessionEnrollmentError extends Error {
  status: number;
  code: EnrollmentErrorCode;

  constructor(code: EnrollmentErrorCode, message: string, status = 400) {
    super(message);
    this.name = "EventAttendeeSessionEnrollmentError";
    this.code = code;
    this.status = status;
  }
}

const ENROLLMENT_STATUSES = new Set<EventAttendeeSessionEnrollmentStatus>([
  "REGISTERED",
  "SELECTED",
  "WAITLISTED",
  "CANCELLED",
  "CHECKED_IN",
  "NO_SHOW",
]);

const ENROLLMENT_SOURCES = new Set<EventAttendeeSessionEnrollmentSource>([
  "REGISTRATION_INTEGRATION",
  "CSV_IMPORT",
  "MANUAL",
  "PORTAL",
  "SYSTEM",
]);

const INACTIVE_ENROLLMENT_STATUSES = new Set<EventAttendeeSessionEnrollmentStatus>(["CANCELLED", "NO_SHOW"]);

export type EnrollmentListOptions = {
  includeInactive?: boolean;
};

export type AddAttendeeToSessionInput = {
  enrollmentStatus?: EventAttendeeSessionEnrollmentStatus | string | null;
  source?: EventAttendeeSessionEnrollmentSource | string | null;
  externalSessionRegistrationId?: string | null;
  integrationConnectionId?: string | null;
  registrationRecordId?: string | null;
  actorUserId?: string | null;
};

export type CancelAttendeeSessionEnrollmentInput = {
  enrollmentId?: string | null;
  attendeeId?: string | null;
  matrixRowId?: string | null;
  actorUserId?: string | null;
};

export type RegistrationImportEnrollmentInput = AddAttendeeToSessionInput & {
  attendeeId: string;
  matrixRowId: string;
};

export type CsvImportEnrollmentInput = {
  attendeeId: string;
  matrixRowId: string;
  enrollmentStatus?: EventAttendeeSessionEnrollmentStatus | string | null;
  externalSessionRegistrationId?: string | null;
};

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function coerceEnrollmentStatus(value: unknown): EventAttendeeSessionEnrollmentStatus | null {
  return typeof value === "string" && ENROLLMENT_STATUSES.has(value as EventAttendeeSessionEnrollmentStatus)
    ? (value as EventAttendeeSessionEnrollmentStatus)
    : null;
}

export function coerceEnrollmentSource(value: unknown): EventAttendeeSessionEnrollmentSource | null {
  return typeof value === "string" && ENROLLMENT_SOURCES.has(value as EventAttendeeSessionEnrollmentSource)
    ? (value as EventAttendeeSessionEnrollmentSource)
    : null;
}

export function isInactiveEnrollmentStatus(status: EventAttendeeSessionEnrollmentStatus): boolean {
  return INACTIVE_ENROLLMENT_STATUSES.has(status);
}

function activeStatusWhere(includeInactive?: boolean): Prisma.EventAttendeeSessionEnrollmentWhereInput {
  return includeInactive ? {} : { enrollmentStatus: { notIn: Array.from(INACTIVE_ENROLLMENT_STATUSES) } };
}

function lifecycleData(
  status: EventAttendeeSessionEnrollmentStatus,
  actorUserId: string | null,
): Prisma.EventAttendeeSessionEnrollmentUncheckedUpdateInput {
  const now = new Date();
  const data: Prisma.EventAttendeeSessionEnrollmentUncheckedUpdateInput = {
    enrollmentStatus: status,
    updatedByUserId: actorUserId,
  };
  if (status === "WAITLISTED") data.waitlistedAt = now;
  if (status === "CANCELLED") data.cancelledAt = now;
  if (status === "CHECKED_IN") data.checkedInAt = now;
  if (!isInactiveEnrollmentStatus(status)) data.cancelledAt = null;
  return data;
}

async function validateEnrollmentLinks(args: {
  eventId: string;
  attendeeId: string;
  matrixRowId: string;
  registrationRecordId?: string | null;
  integrationConnectionId?: string | null;
}): Promise<void> {
  const prisma = getPrisma();
  const [attendee, session, registrationRecord, integrationConnection] = await Promise.all([
    prisma.eventAttendee.findFirst({ where: { id: args.attendeeId, eventId: args.eventId }, select: { id: true } }),
    prisma.matrixRow.findFirst({ where: { id: args.matrixRowId, eventId: args.eventId }, select: { id: true } }),
    args.registrationRecordId
      ? prisma.eventRegistrationRecord.findFirst({
          where: { id: args.registrationRecordId, eventId: args.eventId },
          select: { id: true, attendeeId: true },
        })
      : Promise.resolve(null),
    args.integrationConnectionId
      ? prisma.eventIntegrationConnection.findFirst({
          where: { id: args.integrationConnectionId, eventId: args.eventId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (!attendee) {
    throw new EventAttendeeSessionEnrollmentError(
      "ENROLLMENT_EVENT_MISMATCH",
      "Attendee is not available for this event",
      404,
    );
  }
  if (!session) {
    throw new EventAttendeeSessionEnrollmentError(
      "ENROLLMENT_EVENT_MISMATCH",
      "Session is not available for this event",
      404,
    );
  }
  if (args.registrationRecordId && !registrationRecord) {
    throw new EventAttendeeSessionEnrollmentError(
      "ENROLLMENT_EVENT_MISMATCH",
      "Registration record is not available for this event",
      404,
    );
  }
  if (registrationRecord && registrationRecord.attendeeId !== args.attendeeId) {
    throw new EventAttendeeSessionEnrollmentError(
      "ENROLLMENT_EVENT_MISMATCH",
      "Registration record belongs to a different attendee",
      400,
    );
  }
  if (args.integrationConnectionId && !integrationConnection) {
    throw new EventAttendeeSessionEnrollmentError(
      "ENROLLMENT_EVENT_MISMATCH",
      "Integration connection is not available for this event",
      404,
    );
  }
}

async function assertExternalEnrollmentNotClaimed(args: {
  eventId: string;
  integrationConnectionId: string | null;
  externalSessionRegistrationId: string | null;
  ignoreEnrollmentId?: string | null;
}): Promise<void> {
  if (!args.integrationConnectionId || !args.externalSessionRegistrationId) return;
  const existing = await getPrisma().eventAttendeeSessionEnrollment.findFirst({
    where: {
      eventId: args.eventId,
      integrationConnectionId: args.integrationConnectionId,
      externalSessionRegistrationId: args.externalSessionRegistrationId,
      ...(args.ignoreEnrollmentId ? { NOT: { id: args.ignoreEnrollmentId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new EventAttendeeSessionEnrollmentError(
      "EXTERNAL_ENROLLMENT_DUPLICATE",
      "External session registration is already linked to another enrollment",
      409,
    );
  }
}

export async function listAttendeeAgenda(
  eventId: string,
  attendeeId: string,
  options: EnrollmentListOptions = {},
) {
  return getPrisma().eventAttendeeSessionEnrollment.findMany({
    where: {
      eventId,
      attendeeId,
      ...activeStatusWhere(options.includeInactive),
    },
    orderBy: [
      { matrixRow: { dayDate: "asc" } },
      { matrixRow: { startTime: "asc" } },
      { matrixRow: { sortOrder: "asc" } },
      { createdAt: "asc" },
    ],
    include: {
      matrixRow: true,
      registrationRecord: true,
      integrationConnection: true,
    },
  });
}

export async function listSessionRoster(
  eventId: string,
  matrixRowId: string,
  options: EnrollmentListOptions = {},
) {
  return getPrisma().eventAttendeeSessionEnrollment.findMany({
    where: {
      eventId,
      matrixRowId,
      ...activeStatusWhere(options.includeInactive),
    },
    orderBy: [
      { attendee: { person: { displayName: "asc" } } },
      { createdAt: "asc" },
    ],
    include: {
      attendee: { include: { person: true, registrationRecords: true } },
      registrationRecord: true,
      integrationConnection: true,
    },
  });
}

export async function addAttendeeToSession(
  eventId: string,
  attendeeId: string,
  matrixRowId: string,
  input: AddAttendeeToSessionInput = {},
): Promise<EventAttendeeSessionEnrollment> {
  const enrollmentStatus = coerceEnrollmentStatus(input.enrollmentStatus) ?? "REGISTERED";
  const source = coerceEnrollmentSource(input.source) ?? "MANUAL";
  const registrationRecordId = trimOrNull(input.registrationRecordId);
  const integrationConnectionId = trimOrNull(input.integrationConnectionId);
  const externalSessionRegistrationId = trimOrNull(input.externalSessionRegistrationId);
  const actorUserId = trimOrNull(input.actorUserId);

  await validateEnrollmentLinks({ eventId, attendeeId, matrixRowId, registrationRecordId, integrationConnectionId });

  const existing = await getPrisma().eventAttendeeSessionEnrollment.findUnique({
    where: { eventId_attendeeId_matrixRowId: { eventId, attendeeId, matrixRowId } },
    select: { id: true },
  });
  await assertExternalEnrollmentNotClaimed({
    eventId,
    integrationConnectionId,
    externalSessionRegistrationId,
    ignoreEnrollmentId: existing?.id ?? null,
  });

  const lifecycle = lifecycleData(enrollmentStatus, actorUserId);
  if (existing) {
    return getPrisma().eventAttendeeSessionEnrollment.update({
      where: { id: existing.id },
      data: {
        ...lifecycle,
        source,
        externalSessionRegistrationId,
        integrationConnectionId,
        registrationRecordId,
      },
    });
  }

  return getPrisma().eventAttendeeSessionEnrollment.create({
    data: {
      eventId,
      attendeeId,
      matrixRowId,
      enrollmentStatus,
      source,
      externalSessionRegistrationId,
      integrationConnectionId,
      registrationRecordId,
      waitlistedAt: enrollmentStatus === "WAITLISTED" ? new Date() : null,
      cancelledAt: enrollmentStatus === "CANCELLED" ? new Date() : null,
      checkedInAt: enrollmentStatus === "CHECKED_IN" ? new Date() : null,
      createdByUserId: actorUserId,
      updatedByUserId: actorUserId,
    },
  });
}

export async function cancelAttendeeSessionEnrollment(
  eventId: string,
  input: CancelAttendeeSessionEnrollmentInput,
): Promise<EventAttendeeSessionEnrollment> {
  const enrollmentId = trimOrNull(input.enrollmentId);
  const attendeeId = trimOrNull(input.attendeeId);
  const matrixRowId = trimOrNull(input.matrixRowId);
  const actorUserId = trimOrNull(input.actorUserId);

  const enrollment = enrollmentId
    ? await getPrisma().eventAttendeeSessionEnrollment.findFirst({
        where: { id: enrollmentId, eventId },
        select: { id: true },
      })
    : attendeeId && matrixRowId
      ? await getPrisma().eventAttendeeSessionEnrollment.findUnique({
          where: { eventId_attendeeId_matrixRowId: { eventId, attendeeId, matrixRowId } },
          select: { id: true },
        })
      : null;

  if (!enrollment) {
    throw new EventAttendeeSessionEnrollmentError(
      "ENROLLMENT_NOT_FOUND",
      "Session enrollment not found",
      404,
    );
  }

  return getPrisma().eventAttendeeSessionEnrollment.update({
    where: { id: enrollment.id },
    data: lifecycleData("CANCELLED", actorUserId),
  });
}

export async function upsertEnrollmentsFromRegistrationImport(args: {
  eventId: string;
  integrationConnectionId?: string | null;
  registrationRecordId?: string | null;
  actorUserId?: string | null;
  enrollments: RegistrationImportEnrollmentInput[];
}): Promise<{ upserted: number }> {
  let upserted = 0;
  for (const enrollment of args.enrollments) {
    await addAttendeeToSession(args.eventId, enrollment.attendeeId, enrollment.matrixRowId, {
      ...enrollment,
      source: "REGISTRATION_INTEGRATION",
      integrationConnectionId: enrollment.integrationConnectionId ?? args.integrationConnectionId ?? null,
      registrationRecordId: enrollment.registrationRecordId ?? args.registrationRecordId ?? null,
      actorUserId: enrollment.actorUserId ?? args.actorUserId ?? null,
    });
    upserted += 1;
  }
  return { upserted };
}

export async function upsertEnrollmentsFromCsvImport(args: {
  eventId: string;
  actorUserId?: string | null;
  enrollments: CsvImportEnrollmentInput[];
}): Promise<{ upserted: number }> {
  let upserted = 0;
  for (const enrollment of args.enrollments) {
    await addAttendeeToSession(args.eventId, enrollment.attendeeId, enrollment.matrixRowId, {
      enrollmentStatus: enrollment.enrollmentStatus ?? "REGISTERED",
      source: "CSV_IMPORT",
      externalSessionRegistrationId: enrollment.externalSessionRegistrationId ?? null,
      actorUserId: args.actorUserId ?? null,
    });
    upserted += 1;
  }
  return { upserted };
}
