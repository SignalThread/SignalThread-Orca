import { NextRequest, NextResponse } from "next/server";
import { EventMemberRole, UserRole } from "@prisma/client";
import { deleteEvent, EventUpdateValidationError, getEventById, updateEvent } from "@/lib/events";
import { parseEventDateOnly } from "@/lib/event-date-only";
import { isSupportedTimezone } from "@/lib/timezones";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { setRequestUserId } from "@/lib/observability/request-context";
import { resolveRequestUser } from "@/lib/request-user";
import { getPrisma } from "@/lib/prisma";
import { requireEventRouteAccess } from "./_lib/event-route-auth";

async function getEventRoute(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const nextRequest = request as NextRequest;
  const { eventId } = await params;

  try {
    const auth = await requireEventRouteAccess(nextRequest, eventId, "read");
    if ("response" in auth) return auth.response;
    setRequestUserId(auth.user.id);

    const event = await getEventById(eventId);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    return NextResponse.json(event);
  } catch (error) {
    observeHandledRouteError(error);
    console.error("GET /api/events/:eventId failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function updateEventRoute(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const nextRequest = request as NextRequest;
  const { eventId } = await params;

  let actorUserId: string | undefined;
  try {
    const auth = await requireEventRouteAccess(nextRequest, eventId, "write");
    if ("response" in auth) return auth.response;
    setRequestUserId(auth.user.id);
    actorUserId = auth.user.id;
  } catch (error) {
    observeHandledRouteError(error);
    console.error("PATCH /api/events/:eventId auth failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await nextRequest.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, startDate, endDate, status, timezone, venueName, city, state, clientId, budgetApprovalsEnabled, documentApprovalsEnabled } = body;
  const data: {
    name?: string;
    startDate?: Date;
    endDate?: Date | null;
    status?: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELED";
    timezone?: string;
    budgetApprovalsEnabled?: boolean;
    documentApprovalsEnabled?: boolean;
    venueName?: string | null;
    city?: string | null;
    state?: string | null;
    clientId?: string | null;
  } = {};

  if (typeof name !== "undefined") data.name = String(name);
  if (typeof status !== "undefined") {
    if (!(["DRAFT", "ACTIVE", "COMPLETED", "CANCELED"] as const).includes(status as "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELED")) {
      return NextResponse.json({ error: "status must be a supported event status" }, { status: 400 });
    }
    data.status = status as "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELED";
  }
  if (typeof timezone !== "undefined") {
    if (typeof timezone !== "string" || !isSupportedTimezone(timezone)) {
      return NextResponse.json({ error: "timezone must be a supported IANA timezone" }, { status: 400 });
    }
    data.timezone = timezone;
  }
  if (typeof venueName !== "undefined") data.venueName = venueName === null ? null : String(venueName);
  if (typeof city !== "undefined") data.city = city === null ? null : String(city);
  if (typeof state !== "undefined") data.state = state === null ? null : String(state);
  if (typeof clientId !== "undefined") data.clientId = clientId === null || clientId === "" ? null : String(clientId);
  if (typeof budgetApprovalsEnabled !== "undefined") {
    if (typeof budgetApprovalsEnabled !== "boolean") return NextResponse.json({ error: "budgetApprovalsEnabled must be a boolean" }, { status: 400 });
    data.budgetApprovalsEnabled = budgetApprovalsEnabled;
  }
  if (typeof documentApprovalsEnabled !== "undefined") {
    if (typeof documentApprovalsEnabled !== "boolean") return NextResponse.json({ error: "documentApprovalsEnabled must be a boolean" }, { status: 400 });
    data.documentApprovalsEnabled = documentApprovalsEnabled;
  }

  if (typeof startDate !== "undefined") {
    const parsedStartDate = parseEventDateOnly(startDate);
    if (!parsedStartDate) {
      return NextResponse.json({ error: "startDate must be a valid YYYY-MM-DD date" }, { status: 400 });
    }
    data.startDate = parsedStartDate;
  }

  if (typeof endDate !== "undefined") {
    if (endDate === null) {
      data.endDate = null;
    } else {
      const parsedEndDate = parseEventDateOnly(endDate);
      if (!parsedEndDate) {
        return NextResponse.json({ error: "endDate must be a valid YYYY-MM-DD date" }, { status: 400 });
      }
      data.endDate = parsedEndDate;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "At least one updatable field is required" }, { status: 400 });
  }

  try {
    const event = await updateEvent(eventId, data, actorUserId ? { id: actorUserId } : undefined);
    return NextResponse.json(event);
  } catch (error) {
    if (error instanceof EventUpdateValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    observeHandledRouteError(error);
    console.error("PATCH /api/events/:eventId failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function deleteEventRoute(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const nextRequest = request as NextRequest;
  const { eventId } = await params;

  try {
    const currentUserResult = await resolveRequestUser(nextRequest);
    if ("error" in currentUserResult) {
      return NextResponse.json(
        { error: `Unauthorized: ${currentUserResult.error.reason}` },
        { status: currentUserResult.error.status },
      );
    }

    const currentUser = currentUserResult.user;
    setRequestUserId(currentUser.id);
    const event = await getEventById(eventId);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!currentUser.orgId || currentUser.orgId !== event.orgId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (currentUser.role !== UserRole.SUPER_ADMIN) {
      const eventMember = await getPrisma().eventMember.findUnique({
        where: {
          eventId_userId: {
            eventId,
            userId: currentUser.id,
          },
        },
        select: {
          eventRole: true,
        },
      });

      if (!eventMember || eventMember.eventRole !== EventMemberRole.EVENT_ADMIN) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const deleted = await deleteEvent(eventId);
    return NextResponse.json(deleted);
  } catch (error) {
    observeHandledRouteError(error);
    console.error("DELETE /api/events/:eventId failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId", getEventRoute);
export const PATCH = withApiRequestLogging("PATCH /api/events/:eventId", updateEventRoute);
export const DELETE = withApiRequestLogging("DELETE /api/events/:eventId", deleteEventRoute);
