import { NextRequest, NextResponse } from "next/server";
import { PlatformAdminAuthError, requirePlatformAdmin } from "@/src/server/auth/platform-admin";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { setRequestUserId } from "@/lib/observability/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

async function getHandler(request: NextRequest) {
  try {
    const user = await requirePlatformAdmin(request);
    setRequestUserId(user.id);

    return NextResponse.json({
      user: {
        id: user.id,
        role: user.role,
      },
      capabilities: {
        canManagePlatformAccounts: true,
        canManagePlatformUsers: false,
        canImpersonate: false,
      },
    });
  } catch (error) {
    if (error instanceof PlatformAdminAuthError) {
      return authErrorResponse(error);
    }

    observeHandledRouteError(error);
    console.error("GET /api/platform/me failed", error);
    return NextResponse.json(
      {
        message: "Internal server error",
        reason: "PLATFORM_ME_ERROR",
      },
      { status: 500 },
    );
  }
}

const getWithLogging = withApiRequestLogging("GET /api/platform/me", getHandler);

export async function GET(request: NextRequest) {
  return getWithLogging(request, undefined);
}
