import { NextRequest, NextResponse } from "next/server";
import { PlatformAdminAuthError, requirePlatformAdmin } from "@/src/server/auth/platform-admin";
import { getActivePlatformOrgContext, getPlatformAccountDeletionPreflight, PlatformAdminServiceError } from "@/src/server/services/platform-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    await requirePlatformAdmin(request);
    const active = await getActivePlatformOrgContext(request);
    return NextResponse.json({ preflight: await getPlatformAccountDeletionPreflight((await params).orgId, active?.orgId ?? null) });
  } catch (error) {
    if (error instanceof PlatformAdminAuthError) return NextResponse.json({ message: error.message, reason: error.reason }, { status: error.status });
    if (error instanceof PlatformAdminServiceError) return NextResponse.json({ message: error.message, reason: error.reason }, { status: error.status });
    console.error("GET account deletion preflight failed", error);
    return NextResponse.json({ message: "Internal server error", reason: "ACCOUNT_DELETE_PREFLIGHT_ERROR" }, { status: 500 });
  }
}
