import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteAccountForSessionUser } from "@/lib/server/account-self-delete";

function parseBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

/**
 * POST /api/account/delete
 * Mobile contract: Authorization: Bearer <supabase access token>, body {}
 * Success: { ok: true }
 */
export async function POST(request: Request) {
  try {
    const token = parseBearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json(
        { error: "Missing Authorization header. Expected: Authorization: Bearer <access token>." },
        { status: 401 }
      );
    }

    const supabase = createAdminClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(token);

    if (authError || !user?.id) {
      return NextResponse.json(
        { error: authError?.message ?? "Invalid or expired session." },
        { status: 401 }
      );
    }

    try {
      const raw = await request.text();
      if (raw.trim()) {
        JSON.parse(raw);
      }
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const result = await deleteAccountForSessionUser(user.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/account/delete]", error);
    const message = error instanceof Error ? error.message : "Unexpected error while deleting account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
