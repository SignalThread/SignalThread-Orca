import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { canReadExhibitorLeadsInContext } from "@/lib/server/exhibitor-permission-aggregates";

type LeadSearchRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company_text: string | null;
  job_title: string | null;
};

export async function GET(request: Request) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = String(sessionUser.role ?? "").trim().toLowerCase();
    const canRead = await canReadExhibitorLeadsInContext({
      userId: sessionUser.id,
      companyId: String(sessionUser.company_id ?? ""),
      role,
      isBearer: false,
      activePlatformAdminCompanyId: sessionUser.active_company_id
    });
    if (!canRead) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const companyId = String(sessionUser.company_id ?? "").trim();
    if (!companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const query = String(searchParams.get("q") ?? "").trim();
    if (!query) {
      return NextResponse.json({ leads: [] });
    }

    const escaped = query.replace(/[%_]/g, "\\$&");
    const likeValue = `%${escaped}%`;

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from("leads")
      .select("id, full_name, email, phone, company_text, job_title")
      .eq("company_id", companyId)
      .or(
        `full_name.ilike.${likeValue},email.ilike.${likeValue},phone.ilike.${likeValue},company_text.ilike.${likeValue}`
      )
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(8);

    if (error) {
      return NextResponse.json({ error: error.message ?? "Failed to search leads." }, { status: 500 });
    }

    return NextResponse.json({
      leads: ((data ?? []) as LeadSearchRow[]).map((row) => ({
        id: row.id,
        full_name: row.full_name ?? "",
        email: row.email ?? "",
        phone: row.phone ?? "",
        company_text: row.company_text ?? "",
        job_title: row.job_title ?? ""
      }))
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
