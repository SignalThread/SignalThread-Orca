import { NextRequest, NextResponse } from "next/server";
import { PlatformAdminAuthError, requirePlatformAdmin } from "@/src/server/auth/platform-admin";
import {
  createPlatformAccount,
  listPlatformAccountsPage,
  PlatformAdminServiceError,
} from "@/src/server/services/platform-admin";
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
      reason: "PLATFORM_ACCOUNTS_ERROR",
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

    const searchParams = request.nextUrl.searchParams;
    const primaryAdmin = searchParams.get("primaryAdmin");
    const sort = searchParams.get("sort");
    const direction = searchParams.get("direction");
    const accounts = await listPlatformAccountsPage({
      search: searchParams.get("search"),
      primaryAdmin: primaryAdmin === "present" || primaryAdmin === "missing" ? primaryAdmin : null,
      zeroUsers: searchParams.get("zeroUsers") === "true",
      zeroEvents: searchParams.get("zeroEvents") === "true",
      sort: ["name", "createdAt", "updatedAt", "userCount", "eventCount", "primaryAdmin"].includes(sort ?? "")
        ? (sort as "name" | "createdAt" | "updatedAt" | "userCount" | "eventCount" | "primaryAdmin")
        : undefined,
      direction: direction === "desc" ? "desc" : direction === "asc" ? "asc" : undefined,
      page: Number(searchParams.get("page")),
      pageSize: Number(searchParams.get("pageSize")),
    });
    return NextResponse.json(accounts);
  } catch (error) {
    if (error instanceof PlatformAdminAuthError) {
      return authErrorResponse(error);
    }
    if (error instanceof PlatformAdminServiceError) {
      return serviceErrorResponse(error);
    }
    return unknownErrorResponse(error, "GET /api/platform/accounts");
  }
}

async function postHandler(request: NextRequest) {
  let body: Record<string, unknown> | NextResponse;
  try {
    const user = await requirePlatformAdmin(request);
    setRequestUserId(user.id);

    body = await parseJsonObject(request);
    if (body instanceof NextResponse) return body;

    const account = await createPlatformAccount(body);
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    if (error instanceof PlatformAdminAuthError) {
      return authErrorResponse(error);
    }
    if (error instanceof PlatformAdminServiceError) {
      return serviceErrorResponse(error);
    }
    return unknownErrorResponse(error, "POST /api/platform/accounts");
  }
}

const getWithLogging = withApiRequestLogging("GET /api/platform/accounts", getHandler);
const postWithLogging = withApiRequestLogging("POST /api/platform/accounts", postHandler);

export async function GET(request: NextRequest) {
  return getWithLogging(request, undefined);
}

export async function POST(request: NextRequest) {
  return postWithLogging(request, undefined);
}
