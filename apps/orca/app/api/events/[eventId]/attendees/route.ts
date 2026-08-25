import { NextRequest, NextResponse } from "next/server";
import type {
  EventAttendeeAttendanceStatus,
  EventAttendeeRegistrationStatus,
  EventAttendeeSource,
} from "@prisma/client";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  createEventAttendee,
  getEventAttendeeSummary,
  listEventAttendees,
  type AttendeeProfileInput,
  type AttendeeParticipationInput,
  type AttendeeRegistrationInput,
} from "@/src/server/services/event-attendee";
import { readJsonBody, resolveAttendeeUser, toAttendeeErrorResponse } from "./_lib/route-helpers";

export const runtime = "nodejs";

async function getHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const auth = await resolveAttendeeUser(request);
  if ("response" in auth) return auth.response;

  const sp = request.nextUrl.searchParams;
  const limitParam = Number(sp.get("limit"));
  try {
    const [list, summary] = await Promise.all([
      listEventAttendees({
        eventId,
        user: auth.user,
        filters: {
          search: sp.get("search"),
          registrationStatus: (sp.get("registrationStatus") as EventAttendeeRegistrationStatus | null) || null,
          attendanceStatus: (sp.get("attendanceStatus") as EventAttendeeAttendanceStatus | null) || null,
          source: (sp.get("source") as EventAttendeeSource | null) || null,
          role: sp.get("role"),
          registrationType: sp.get("registrationType"),
          needsReview: sp.get("needsReview") === "1",
          limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
          cursor: sp.get("cursor"),
        },
      }),
      getEventAttendeeSummary({ eventId, user: auth.user }),
    ]);
    return NextResponse.json({ attendees: list.attendees, nextCursor: list.nextCursor, summary });
  } catch (error) {
    return toAttendeeErrorResponse(error, "GET /api/events/:eventId/attendees");
  }
}

async function postHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const auth = await resolveAttendeeUser(request);
  if ("response" in auth) return auth.response;
  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const b = parsed.body;

  try {
    const result = await createEventAttendee({
      eventId,
      user: auth.user,
      input: {
        directoryPersonId: (b.directoryPersonId as string | null) ?? null,
        profile: (b.profile as AttendeeProfileInput) ?? undefined,
        participation: (b.participation as AttendeeParticipationInput) ?? undefined,
        registration: (b.registration as AttendeeRegistrationInput) ?? undefined,
        sourceLabel: (b.sourceLabel as string | null) ?? null,
      },
    });
    return NextResponse.json(result, { status: result.createdAttendee ? 201 : 200 });
  } catch (error) {
    return toAttendeeErrorResponse(error, "POST /api/events/:eventId/attendees");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/attendees", getHandler);
export const POST = withApiRequestLogging("POST /api/events/:eventId/attendees", postHandler);
