import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { createAdminClient } from "@/lib/supabase/admin";

type LeadLookupRow = {
  id: string;
};

export async function GET(request: Request) {
  try {
    const sessionUser = await resolveApiSession(request);
    const role = String(sessionUser.role ?? "").trim().toLowerCase();

    if (role !== "exhibitor_admin" && role !== "platform_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = createAdminClient();
    let query = (supabase as any)
      .from("leads")
      .select("id, created_at, updated_at")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (role === "exhibitor_admin") {
      const companyId = String(sessionUser.companyId ?? "").trim();
      if (!companyId) {
        return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
      }
      query = query.eq("company_id", companyId);
    }

    const { data: row, error } = (await query.maybeSingle()) as {
      data: LeadLookupRow | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      return NextResponse.json(
        { error: `Failed to resolve load-test lead: ${error.message}` },
        { status: 500 }
      );
    }

    if (!row?.id) {
      return NextResponse.json({ error: "No accessible lead found for this auth context." }, { status: 404 });
    }

    return NextResponse.json({ leadId: String(row.id) });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
