import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return String(error);
  }

  const maybe = error as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  };

  return {
    message: maybe.message ?? null,
    details: maybe.details ?? null,
    hint: maybe.hint ?? null,
    code: maybe.code ?? null
  };
}

async function requirePlatformAdmin() {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  if (sessionUser.role !== "platform_admin") {
    return NextResponse.json({ message: "Only platform admins can manage events." }, { status: 403 });
  }

  return null;
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ eventId: string }> }
) {
  try {
    const authError = await requirePlatformAdmin();
    if (authError) return authError;

    const { eventId } = await context.params;
    const supabase = await createSupabaseServerClient();

    const { error } = await (supabase as any)
      .from("events")
      .delete()
      .eq("id", eventId);

    if (error) {
      console.error("deleteEvent failed", {
        eventId,
        error: getErrorDetails(error),
        rawError: error
      });
      return NextResponse.json({ message: error.message ?? "Failed deleting event." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("deleteEvent unexpected error", getErrorDetails(error));
    return NextResponse.json({ message: "Unexpected server error while deleting event." }, { status: 500 });
  }
}
