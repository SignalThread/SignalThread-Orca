import { NextRequest, NextResponse } from "next/server";
import { PlatformAdminAuthError, requirePlatformAdmin } from "@/src/server/auth/platform-admin";
import { searchPlatformAdmin } from "@/src/server/services/platform-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin(request);
    return NextResponse.json(await searchPlatformAdmin(request.nextUrl.searchParams.get("q")));
  } catch (error) {
    if (error instanceof PlatformAdminAuthError) return NextResponse.json({ message: error.message, reason: error.reason }, { status: error.status });
    console.error("GET /api/platform/search failed", error);
    return NextResponse.json({ message: "Internal server error", reason: "PLATFORM_SEARCH_ERROR" }, { status: 500 });
  }
}
