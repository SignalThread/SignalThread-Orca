import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { setRequestUserId } from "@/lib/observability/request-context";
import { PlatformAdminAuthError, requirePlatformAdmin } from "@/src/server/auth/platform-admin";
import {
  PlatformAdminServiceError,
  removeUserFromAccount,
  updatePlatformAccountUserRole,
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
      reason: "PLATFORM_ACCOUNT_USER_ERROR",
    },
    { status: 500 },
  );
}

async function parseJsonObject(request: NextRequest): Promise<Record<string, unknown> | NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        message: "Bad Request",
        reason: "INVALID_JSON",
        hint: "Request body must be valid JSON.",
      },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      {
        message: "Bad Request",
        reason: "INVALID_BODY",
        hint: "Request body must be a JSON object.",
      },
      { status: 400 },
    );
  }

  return body as Record<string, unknown>;
}

async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; userId: string }> },
) {
  let body: Record<string, unknown> | NextResponse;
  try {
    const user = await requirePlatformAdmin(request);
    setRequestUserId(user.id);

    const { orgId, userId } = await params;
    if (!UUID_REGEX.test(orgId)) return invalidUuidResponse("orgId");
    if (!UUID_REGEX.test(userId)) return invalidUuidResponse("userId");

    body = await parseJsonObject(request);
    if (body instanceof NextResponse) return body;

    const result = await updatePlatformAccountUserRole(orgId, userId, body);
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof PlatformAdminAuthError) {
      return authErrorResponse(error);
    }
    if (error instanceof PlatformAdminServiceError) {
      return serviceErrorResponse(error);
    }
    return unknownErrorResponse(error, "PATCH /api/platform/accounts/[orgId]/users/[userId]");
  }
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; userId: string }> },
) {
  try {
    const user = await requirePlatformAdmin(request);
    setRequestUserId(user.id);

    const { orgId, userId } = await params;
    if (!UUID_REGEX.test(orgId)) return invalidUuidResponse("orgId");
    if (!UUID_REGEX.test(userId)) return invalidUuidResponse("userId");

    const result = await removeUserFromAccount(orgId, userId);
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof PlatformAdminAuthError) {
      return authErrorResponse(error);
    }
    if (error instanceof PlatformAdminServiceError) {
      return serviceErrorResponse(error);
    }
    return unknownErrorResponse(error, "DELETE /api/platform/accounts/[orgId]/users/[userId]");
  }
}

export const PATCH = withApiRequestLogging("PATCH /api/platform/accounts/[orgId]/users/[userId]", patchHandler);
export const DELETE = withApiRequestLogging("DELETE /api/platform/accounts/[orgId]/users/[userId]", deleteHandler);
