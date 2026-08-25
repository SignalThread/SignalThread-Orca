import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { PlatformAdminAuthError, requirePlatformAdmin } from "@/src/server/auth/platform-admin";
import { listPlatformUsers, PlatformAdminServiceError } from "@/src/server/services/platform-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin(request);
    const params = request.nextUrl.searchParams;
    const role = params.get("role");
    return NextResponse.json(await listPlatformUsers({
      search: params.get("search"),
      role: Object.values(UserRole).includes(role as UserRole) ? role as UserRole : null,
      accountId: params.get("accountId"),
      hasEventAccess: params.get("hasEventAccess") === "true" ? true : params.get("hasEventAccess") === "false" ? false : null,
      sort: ["name", "email", "createdAt", "role"].includes(params.get("sort") ?? "") ? params.get("sort") as "name" | "email" | "createdAt" | "role" : undefined,
      direction: params.get("direction") === "asc" ? "asc" : params.get("direction") === "desc" ? "desc" : undefined,
      page: Number(params.get("page")), pageSize: Number(params.get("pageSize")),
    }));
  } catch (error) {
    if (error instanceof PlatformAdminAuthError) return NextResponse.json({ message: error.message, reason: error.reason }, { status: error.status });
    if (error instanceof PlatformAdminServiceError) return NextResponse.json({ message: error.message, reason: error.reason }, { status: error.status });
    console.error("GET /api/platform/users failed", error);
    return NextResponse.json({ message: "Internal server error", reason: "PLATFORM_USERS_ERROR" }, { status: 500 });
  }
}
