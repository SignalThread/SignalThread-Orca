import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { setRequestUserId } from "@/lib/observability/request-context";
import { PlatformAdminAuthError, requirePlatformAdmin } from "@/src/server/auth/platform-admin";
import {
  listPlatformAccountEvents,
  PlatformAdminServiceError,
} from "@/src/server/services/platform-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authErrorResponse(error: PlatformAdminAuthError): NextResponse {
  return NextResponse.json(
    {
      message: error.status === 401 ? "Unauthorized" : "Forbidden",
      reason: error.reason,
      hint: error.hint,
    },
    { status: error.status },
  );
}

function serviceErrorResponse(error: PlatformAdminServiceError): NextResponse {
  return NextResponse.json(
    {
      message: error.message,
      reason: error.reason,
    },
    { status: error.status },
  );
}

function invalidUuidResponse(field: string): NextResponse {
  return NextResponse.json(
    {
      message: "Bad Request",
      reason: "INVALID_UUID",
      hint: `${field} must be a valid UUID.`,
    },
    { status: 400 },
  );
}

function unknownErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);
  console.error(`${context} failed`, error);
  return NextResponse.json(
    {
      message: "Internal server error",
      reason: "PLATFORM_ACCOUNT_EVENTS_ERROR",
    },
    { status: 500 },
  );
}

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const user = await requirePlatformAdmin(request);
    setRequestUserId(user.id);

    const { orgId } = await params;
    if (!UUID_REGEX.test(orgId)) return invalidUuidResponse("orgId");

    const events = await listPlatformAccountEvents(orgId);
    return NextResponse.json({ events });
  } catch (error) {
    if (error instanceof PlatformAdminAuthError) {
      return authErrorResponse(error);
    }
    if (error instanceof PlatformAdminServiceError) {
      return serviceErrorResponse(error);
    }
    return unknownErrorResponse(error, "GET /api/platform/accounts/[orgId]/events");
  }
}

export const GET = withApiRequestLogging("GET /api/platform/accounts/[orgId]/events", getHandler);
