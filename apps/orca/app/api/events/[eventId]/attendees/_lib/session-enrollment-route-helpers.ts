import { NextRequest, NextResponse } from "next/server";
import {
  EventAttendeeSessionEnrollmentSource,
  EventAttendeeSessionEnrollmentStatus,
  type EventAttendeeSessionEnrollment,
} from "@prisma/client";
import { z, ZodError } from "zod";
import { assertEventAccessForUser, EventAccessError, type EventAccessUser } from "@/lib/event-access";
import { observeHandledRouteError } from "@/lib/observability/api-route";
import { resolveRequestUser, type RequestUserResult } from "@/lib/request-user";
import { EventAttendeeSessionEnrollmentError } from "@/src/server/services/event-attendee-session-enrollment";

type RouteUser = Extract<RequestUserResult, { user: unknown }>["user"];

export const uuidSchema = z.string().uuid();

export const enrollmentListQuerySchema = z.object({
  includeInactive: z.string().optional(),
});

export const addAgendaSessionBodySchema = z.object({
  matrixRowId: uuidSchema,
  enrollmentStatus: z.nativeEnum(EventAttendeeSessionEnrollmentStatus).optional(),
  source: z.nativeEnum(EventAttendeeSessionEnrollmentSource).optional(),
});

export const addRosterAttendeeBodySchema = z.object({
  attendeeId: uuidSchema,
  enrollmentStatus: z.nativeEnum(EventAttendeeSessionEnrollmentStatus).optional(),
  source: z.nativeEnum(EventAttendeeSessionEnrollmentSource).optional(),
});

export async function requireEnrollmentRouteUser(request: NextRequest): Promise<{ user: RouteUser } | { response: NextResponse }> {
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return {
      response: NextResponse.json(
        {
          error: authResult.error.status === 403 ? "Forbidden" : "Unauthorized",
          reason: authResult.error.reason,
          hint: authResult.error.hint,
        },
        { status: authResult.error.status },
      ),
    };
  }

  return { user: authResult.user };
}

export async function assertEnrollmentEventAccess(
  eventId: string,
  user: EventAccessUser,
  accessType: "read" | "write",
): Promise<void> {
  await assertEventAccessForUser(eventId, user, accessType);
}

export async function parseEnrollmentJsonBody(request: NextRequest): Promise<unknown> {
  try {
    const rawBody = await request.text();
    return rawBody.trim() ? JSON.parse(rawBody) : {};
  } catch {
    throw new EventAttendeeSessionEnrollmentError("ENROLLMENT_VALIDATION", "Invalid JSON body", 400);
  }
}

export function parseIncludeInactive(request: NextRequest): boolean {
  const parsed = enrollmentListQuerySchema.parse({
    includeInactive: request.nextUrl.searchParams.get("includeInactive") ?? undefined,
  });
  return parsed.includeInactive === "1" || parsed.includeInactive === "true";
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function dateOnly(value: Date | string | null | undefined): string | null {
  const iso = isoOrNull(value);
  return iso ? iso.slice(0, 10) : null;
}

function timeOnly(value: Date | string | null | undefined): string | null {
  const iso = isoOrNull(value);
  if (!iso) return null;
  const timeMatch = iso.match(/T(\d{2}:\d{2})/);
  if (timeMatch) return timeMatch[1];
  return iso.slice(0, 5);
}

export function serializeEnrollment(enrollment: EventAttendeeSessionEnrollment) {
  return {
    id: enrollment.id,
    eventId: enrollment.eventId,
    attendeeId: enrollment.attendeeId,
    matrixRowId: enrollment.matrixRowId,
    enrollmentStatus: enrollment.enrollmentStatus,
    source: enrollment.source,
    registrationRecordId: enrollment.registrationRecordId,
    integrationConnectionId: enrollment.integrationConnectionId,
    externalSessionRegistrationId: enrollment.externalSessionRegistrationId,
    waitlistedAt: isoOrNull(enrollment.waitlistedAt),
    cancelledAt: isoOrNull(enrollment.cancelledAt),
    checkedInAt: isoOrNull(enrollment.checkedInAt),
    createdAt: isoOrNull(enrollment.createdAt),
    updatedAt: isoOrNull(enrollment.updatedAt),
  };
}

export function serializeAgendaEnrollment(
  enrollment: EventAttendeeSessionEnrollment & {
    matrixRow?: {
      id: string;
      dayDate: Date | string;
      startTime: Date | string | null;
      endTime: Date | string | null;
      roomName: string | null;
      sessionName: string | null;
    };
  },
) {
  return {
    ...serializeEnrollment(enrollment),
    session: enrollment.matrixRow
      ? {
          id: enrollment.matrixRow.id,
          matrixRowId: enrollment.matrixRow.id,
          title: enrollment.matrixRow.sessionName ?? "Untitled session",
          date: dateOnly(enrollment.matrixRow.dayDate),
          startTime: timeOnly(enrollment.matrixRow.startTime),
          endTime: timeOnly(enrollment.matrixRow.endTime),
          roomName: enrollment.matrixRow.roomName,
        }
      : null,
  };
}

export function serializeRosterEnrollment(
  enrollment: EventAttendeeSessionEnrollment & {
    attendee?: {
      id: string;
      registrationStatus?: string;
      person: {
        id: string;
        displayName: string;
        email: string | null;
        company: string | null;
      };
    };
  },
) {
  return {
    ...serializeEnrollment(enrollment),
    attendee: enrollment.attendee
      ? {
          id: enrollment.attendee.id,
          directoryPersonId: enrollment.attendee.person.id,
          displayName: enrollment.attendee.person.displayName,
          email: enrollment.attendee.person.email,
          company: enrollment.attendee.person.company,
          registrationStatus: enrollment.attendee.registrationStatus ?? null,
        }
      : null,
  };
}

export function toEnrollmentRouteErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Validation failed", code: "ENROLLMENT_VALIDATION", issues: error.issues }, { status: 400 });
  }

  if (error instanceof EventAccessError) {
    return NextResponse.json({ error: error.message, code: error.reason }, { status: error.status });
  }

  if (error instanceof EventAttendeeSessionEnrollmentError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error", code: "INTERNAL" }, { status: 500 });
}
