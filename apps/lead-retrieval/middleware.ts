import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const isDevBypass = request.headers.get("x-dev-bypass") === "true";
  const isApiRequest = request.nextUrl.pathname.startsWith("/api/");

  if (isApiRequest && isDevBypass && process.env.NODE_ENV === "development") {
    return NextResponse.next();
  }

  if (
    process.env.NODE_ENV === "development" &&
    isDevBypass
  ) {
    return NextResponse.next();
  }

  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
