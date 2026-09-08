import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildBrowserFacingUrl } from "@/lib/http/browser-facing-url";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(buildBrowserFacingUrl(request, "/login"));
}
