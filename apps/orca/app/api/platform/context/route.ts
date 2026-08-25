import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { setRequestUserId } from "@/lib/observability/request-context";
import { PlatformAdminAuthError, requirePlatformAdmin } from "@/src/server/auth/platform-admin";
import {
  clearActivePlatformOrgContext,
  getActivePlatformOrgContext,
  PLATFORM_CONTEXT_COOKIE_NAME,
  platformContextCookieOptions,
  PlatformAdminServiceError,
  setActivePlatformOrgContext,
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

function unknownErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);
  console.error(`${context} failed`, error);
  return NextResponse.json(
    {
      message: "Internal server error",
      reason: "PLATFORM_CONTEXT_ERROR",
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

async function getHandler(request: NextRequest) {
  try {
    const user = await requirePlatformAdmin(request);
    setRequestUserId(user.id);

    const context = await getActivePlatformOrgContext(request);
    return NextResponse.json({ context });
  } catch (error) {
    if (error instanceof PlatformAdminAuthError) {
      return authErrorResponse(error);
    }
    if (error instanceof PlatformAdminServiceError) {
      return serviceErrorResponse(error);
    }
    return unknownErrorResponse(error, "GET /api/platform/context");
  }
}

async function postHandler(request: NextRequest) {
  let body: Record<string, unknown> | NextResponse;
  try {
    const user = await requirePlatformAdmin(request);
    setRequestUserId(user.id);

    body = await parseJsonObject(request);
    if (body instanceof NextResponse) return body;

    const orgId = typeof body.orgId === "string" ? body.orgId.trim() : "";
    if (!UUID_REGEX.test(orgId)) {
      return NextResponse.json(
        {
          message: "Bad Request",
          reason: "INVALID_ORG_ID",
          hint: "orgId must be a valid UUID.",
        },
        { status: 400 },
      );
    }

    const context = await setActivePlatformOrgContext(request, orgId);
    const response = NextResponse.json({ context });
    response.cookies.set({
      ...platformContextCookieOptions(),
      value: context.orgId,
    });
    return response;
  } catch (error) {
    if (error instanceof PlatformAdminAuthError) {
      return authErrorResponse(error);
    }
    if (error instanceof PlatformAdminServiceError) {
      return serviceErrorResponse(error);
    }
    return unknownErrorResponse(error, "POST /api/platform/context");
  }
}

async function deleteHandler(request: NextRequest) {
  try {
    const user = await requirePlatformAdmin(request);
    setRequestUserId(user.id);

    await clearActivePlatformOrgContext(request);
    const response = NextResponse.json({ ok: true, context: null });
    response.cookies.set({
      name: PLATFORM_CONTEXT_COOKIE_NAME,
      value: "",
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    if (error instanceof PlatformAdminAuthError) {
      return authErrorResponse(error);
    }
    if (error instanceof PlatformAdminServiceError) {
      return serviceErrorResponse(error);
    }
    return unknownErrorResponse(error, "DELETE /api/platform/context");
  }
}

const getWithLogging = withApiRequestLogging("GET /api/platform/context", getHandler);
const postWithLogging = withApiRequestLogging("POST /api/platform/context", postHandler);
const deleteWithLogging = withApiRequestLogging("DELETE /api/platform/context", deleteHandler);

export async function GET(request: NextRequest) {
  return getWithLogging(request, undefined);
}

export async function POST(request: NextRequest) {
  return postWithLogging(request, undefined);
}

export async function DELETE(request: NextRequest) {
  return deleteWithLogging(request, undefined);
}
