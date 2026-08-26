import type { NextRequest } from "next/server";
import { updatePlatformSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updatePlatformSession(request);
}

export const config = {
  // Everything except static assets and image optimisation output.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
