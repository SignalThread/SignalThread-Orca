import { NextResponse, type NextRequest } from "next/server";
import { createPlatformServerClient } from "@/lib/supabase/server";
import { resolveAppOrigin } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

/**
 * End the Platform Core session.
 *
 * POST is the real entry point so a prefetch or a stray <img> cannot sign a user
 * out. GET is accepted too because a signed-out user landing here should still
 * end up somewhere sensible rather than seeing a 405.
 */
async function signOut(request: NextRequest) {
  const supabase = await createPlatformServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${resolveAppOrigin(request.url)}/signin`, { status: 303 });
}

export async function POST(request: NextRequest) {
  return signOut(request);
}

export async function GET(request: NextRequest) {
  return signOut(request);
}
