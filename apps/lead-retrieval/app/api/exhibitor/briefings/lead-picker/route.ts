import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveValidatedActiveEventIdForUser } from "@/lib/server/company-event-access";

type LeadPickerRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  company_text: string | null;
  job_title: string | null;
};

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, "\\$&").replace(/,/g, " ");
}

export async function GET(request: Request) {
  try {
    const session = await resolveApiSession(request);
    if (String(session.role ?? "").trim().toLowerCase() !== "exhibitor_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const companyId = String(session.companyId ?? "").trim();
    if (!companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const requestedEventId = String(searchParams.get("eventId") ?? "").trim() || null;
    const { eventId } = await resolveValidatedActiveEventIdForUser(session.userId, requestedEventId);
    if (!eventId) {
      return NextResponse.json({ error: "Missing exhibitor event scope." }, { status: 400 });
    }

    const q = String(searchParams.get("q") ?? "").trim();
    const supabase = createAdminClient();
    let query = (supabase as any)
      .from("leads")
      .select("id, full_name, email, company_text, job_title")
      .eq("company_id", companyId)
      .eq("event_id", eventId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(20);

    if (q) {
      const likeValue = `%${escapeLike(q)}%`;
      query = query.or(`full_name.ilike.${likeValue},email.ilike.${likeValue},company_text.ilike.${likeValue}`);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message ?? "Failed to load leads." }, { status: 500 });
    }

    return NextResponse.json({
      eventId,
      leads: ((data ?? []) as LeadPickerRow[]).map((row) => ({
        id: row.id,
        full_name: row.full_name ?? "",
        email: row.email ?? "",
        company_text: row.company_text ?? "",
        job_title: row.job_title ?? "",
      })),
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
