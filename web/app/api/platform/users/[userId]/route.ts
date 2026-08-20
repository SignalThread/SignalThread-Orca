import { NextRequest, NextResponse } from "next/server";
import { PlatformAdminAuthError, requirePlatformAdmin } from "@/src/server/auth/platform-admin";
import { getPlatformUserDetail, PlatformAdminServiceError, updatePlatformUserRole } from "@/src/server/services/platform-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof PlatformAdminAuthError) return NextResponse.json({ message: error.message, reason: error.reason }, { status: error.status });
  if (error instanceof PlatformAdminServiceError) return NextResponse.json({ message: error.message, reason: error.reason }, { status: error.status });
  console.error("/api/platform/users/[userId] failed", error);
  return NextResponse.json({ message: "Internal server error", reason: "PLATFORM_USER_ERROR" }, { status: 500 });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try { await requirePlatformAdmin(_request); return NextResponse.json({ user: await getPlatformUserDetail((await params).userId) }); } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const actor = await requirePlatformAdmin(request);
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ message: "Request body must be a JSON object", reason: "INVALID_BODY" }, { status: 400 });
    return NextResponse.json({ user: await updatePlatformUserRole(actor.id, (await params).userId, body as Record<string, unknown>) });
  } catch (error) { return errorResponse(error); }
}
