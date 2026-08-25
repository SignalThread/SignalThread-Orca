import { NextRequest, NextResponse } from "next/server";
import { createEvent, listEventsForUser, resolveEventVisibility } from "@/lib/events";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { getRequestContext, setRequestUserId } from "@/lib/observability/request-context";
import {
  ACTIVE_ORG_COOKIE_NAME,
  ORGANIZATION_CONTEXT_COOKIE_MAX_AGE_SECONDS,
  ORGANIZATION_SELECTION_COOKIE_NAME,
  resolveRequestUser,
} from "@/lib/request-user";
import { shouldQuietE2ERoutineLogs } from "@/lib/logging/log-policy";
import { PLATFORM_CONTEXT_COOKIE_NAME } from "@/src/server/services/platform-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENT_STATUSES = new Set(["DRAFT", "ACTIVE", "COMPLETED", "CANCELED"]);

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function applyActiveOrgCookie(response: NextResponse, activeOrgId: string | undefined) {
  if (!activeOrgId) return;

  response.cookies.set({
    name: ACTIVE_ORG_COOKIE_NAME,
    value: activeOrgId,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: ORGANIZATION_CONTEXT_COOKIE_MAX_AGE_SECONDS,
  });
}

function applyOrganizationSelectionCookie(response: NextResponse, activeOrgId: string | undefined) {
  if (!activeOrgId) return;

  response.cookies.set({
    name: ORGANIZATION_SELECTION_COOKIE_NAME,
    value: activeOrgId,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: ORGANIZATION_CONTEXT_COOKIE_MAX_AGE_SECONDS,
  });
}

function applyEventListCacheHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
}

function badRequest(reason: string, hint: string, status = 400): NextResponse {
  return NextResponse.json(
    {
      message: "Bad Request",
      reason,
      hint,
    },
    { status },
  );
}

function unauthorized(reason: string, hint: string, status = 401): NextResponse {
  return NextResponse.json(
    {
      message: status === 403 ? "Forbidden" : "Unauthorized",
      reason,
      hint,
    },
    { status },
  );
}

async function getEventsRoute(request: Request) {
  const nextRequest = request as NextRequest;
  let activeOrgIdForLog: string | null = null;
  let userIdForLog: string | null = null;
  let roleForLog: string | null = null;
  try {
    const currentUserResult = await resolveRequestUser(nextRequest);
    if ("error" in currentUserResult) {
      const { reason, hint, status } = currentUserResult.error;
      return unauthorized(reason, hint, status);
    }

    const user = currentUserResult.user;
    setRequestUserId(user.id);
    activeOrgIdForLog = user.orgId ?? null;
    userIdForLog = user.id;
    roleForLog = user.role;
    const platformContextOrgId =
      nextRequest.cookies.get(PLATFORM_CONTEXT_COOKIE_NAME)?.value?.trim() || null;
    const visibility = resolveEventVisibility({
      userId: user.id,
      role: user.role,
      orgId: user.orgId,
    });

    const events = await listEventsForUser({
      userId: user.id,
      role: user.role,
      orgId: user.orgId,
    });
    if (!shouldQuietE2ERoutineLogs()) {
      console.info("event.list.resolved", {
        route: "GET /api/events",
        requestId: getRequestContext()?.requestId ?? null,
        userId: user.id,
        activeOrgId: user.orgId,
        platformContextOrgId,
        effectiveRole: user.role,
        visibilityMode: visibility.mode,
        returnedEventCount: events.length,
        cacheStatus: "dynamic-no-store",
      });
    }

    const response = NextResponse.json(events);
    applyEventListCacheHeaders(response);
    applyActiveOrgCookie(response, user.activeOrgIdCookieToSet);
    applyOrganizationSelectionCookie(response, user.organizationSelectionCookieToSet);
    return response;
  } catch (error) {
    observeHandledRouteError(error);
    if (error instanceof Error) {
      console.error("GET /api/events prisma error", {
        userId: userIdForLog,
        activeOrgId: activeOrgIdForLog,
        role: roleForLog,
        message: error.message,
        stack: error.stack,
      });
    } else {
      console.error("GET /api/events prisma error", {
        userId: userIdForLog,
        activeOrgId: activeOrgIdForLog,
        role: roleForLog,
        error,
      });
    }

    return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
  }
}

async function createEventRoute(request: Request) {
  const nextRequest = request as NextRequest;
  let body: Record<string, unknown>;

  try {
    body = (await nextRequest.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const currentUserResult = await resolveRequestUser(nextRequest);
    if ("error" in currentUserResult) {
      const { reason, hint, status } = currentUserResult.error;
      return status === 401 || status === 403
        ? unauthorized(reason, hint, status)
        : badRequest(reason, hint, status);
    }

    const user = currentUserResult.user;
    setRequestUserId(user.id);
    if (!user.orgId) {
      return badRequest(
        "ACTIVE_ORG_REQUIRED",
        "Set activeOrgId cookie to a valid organization context before creating events.",
        400,
      );
    }

    const { name, startDate, endDate, status, timezone, venueName, city, state } = body;

    if (!name || !startDate || !status) {
      return badRequest("MISSING_REQUIRED_FIELDS", "name, startDate, and status are required.");
    }

    if (typeof status !== "string" || !EVENT_STATUSES.has(status)) {
      return badRequest(
        "INVALID_STATUS",
        "status must be one of DRAFT, ACTIVE, COMPLETED, CANCELED.",
      );
    }

    const parsedStartDate = parseDate(startDate);
    if (!parsedStartDate) {
      return badRequest("INVALID_START_DATE", "startDate must be a valid date.");
    }

    let parsedEndDate: Date | null = null;
    if (typeof endDate !== "undefined" && endDate !== null) {
      parsedEndDate = parseDate(endDate);
      if (!parsedEndDate) {
        return badRequest("INVALID_END_DATE", "endDate must be a valid date.");
      }
    }

    if (!shouldQuietE2ERoutineLogs()) {
      console.info("POST /api/events create", {
        userId: user.id,
        orgId: user.orgId,
        name: String(name),
      });
    }

    const event = await createEvent({
      name: String(name),
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      status: status as "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELED",
      timezone: typeof timezone === "string" ? timezone : undefined,
      venueName: typeof venueName === "string" ? venueName : null,
      city: typeof city === "string" ? city : null,
      state: typeof state === "string" ? state : null,
    }, {
      orgId: user.orgId,
      createdByUserId: user.id,
    });

    const response = NextResponse.json(event, { status: 201 });
    applyActiveOrgCookie(response, user.activeOrgIdCookieToSet);
    applyOrganizationSelectionCookie(response, user.organizationSelectionCookieToSet);
    return response;
  } catch (error) {
    observeHandledRouteError(error);
    console.error("POST /api/events failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const getWithLogging = withApiRequestLogging("GET /api/events", getEventsRoute);
const postWithLogging = withApiRequestLogging("POST /api/events", createEventRoute);

export async function GET(request: Request) {
  return getWithLogging(request, undefined);
}

export async function POST(request: Request) {
  return postWithLogging(request, undefined);
}
