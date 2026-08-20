import { NextRequest, NextResponse } from "next/server";
import { PlatformAdminAuthError, requirePlatformAdmin } from "@/src/server/auth/platform-admin";
import { deletePlatformAccount, getActivePlatformOrgContext, getPlatformAccountById, PlatformAdminServiceError } from "@/src/server/services/platform-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    await requirePlatformAdmin(request);
    return NextResponse.json({ account: await getPlatformAccountById((await params).orgId) });
  } catch (error) {
    if (error instanceof PlatformAdminAuthError) return NextResponse.json({ message: error.message, reason: error.reason }, { status: error.status });
    if (error instanceof PlatformAdminServiceError) return NextResponse.json({ message: error.message, reason: error.reason }, { status: error.status });
    console.error("GET platform account failed", error);
    return NextResponse.json({ message: "Internal server error", reason: "PLATFORM_ACCOUNT_ERROR" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    await requirePlatformAdmin(request);
    const body = await request.json();
    const active = await getActivePlatformOrgContext(request);
    return NextResponse.json(await deletePlatformAccount((await params).orgId, body?.confirmation, active?.orgId ?? null));
  } catch (error) {
    if (error instanceof PlatformAdminAuthError) return NextResponse.json({ message: error.message, reason: error.reason }, { status: error.status });
    if (error instanceof PlatformAdminServiceError) return NextResponse.json({ message: error.message, reason: error.reason }, { status: error.status });
    console.error("DELETE platform account failed", error);
    return NextResponse.json({ message: "Internal server error", reason: "ACCOUNT_DELETE_ERROR" }, { status: 500 });
  }
}
