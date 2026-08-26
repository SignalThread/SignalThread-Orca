import { NextResponse, type NextRequest } from "next/server";
import { createPlatformServerClient } from "@/lib/supabase/server";
import { resolveAppOrigin } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

/**
 * Auth callback for code-exchange flows (email confirmation, recovery, and any
 * provider added later). Password sign-in does not pass through here, but the
 * route must exist for confirmation links to complete a session.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const origin = resolveAppOrigin(request.url);

  // Only same-origin relative paths are honoured, so a crafted ?next= cannot
  // turn the callback into an open redirect.
  const requestedNext = searchParams.get("next");
  const next =
    requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/home";

  if (!code) {
    return NextResponse.redirect(`${origin}/signin?error=missing_code`);
  }

  const supabase = await createPlatformServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/signin?error=exchange_failed`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
