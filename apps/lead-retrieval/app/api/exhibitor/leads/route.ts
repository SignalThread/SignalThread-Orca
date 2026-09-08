import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { createAdminClient } from "@/lib/supabase/admin";
import { canReadExhibitorLeadsInContext } from "@/lib/server/exhibitor-permission-aggregates";
import { POST as createLeadPOST } from "@/app/api/exhibitor/leads/create/route";
import { GET as listLeadsGET } from "@/app/api/exhibitor/leads/list/route";
import { attemptLeadCapturedWorkflowEmit } from "@/lib/workflows/emit/non-fatal-lead-captured-emit";

type LeadsListResponse = {
  leads?: Array<{
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    job_title: string | null;
    temperature: "hot" | "warm" | "cold" | null;
    priority_score: number;
    rating: number;
    follow_up_date: string | null;
    updated_at: string;
    created_at: string;
  }>;
};

function isDevBypassRequest(request: Request) {
  if (process.env.NODE_ENV !== "development") return false;
  return String(request.headers.get("x-dev-bypass") ?? "").trim().toLowerCase() === "true";
}

export async function GET(request: Request) {
  const listResponse = await listLeadsGET(request);

  if (!isDevBypassRequest(request)) {
    return listResponse;
  }

  if (listResponse.status !== 200) {
    return listResponse;
  }

  const payload = (await listResponse.clone().json().catch(() => null)) as LeadsListResponse | null;
  const leads = Array.isArray(payload?.leads) ? payload!.leads! : [];
  if (leads.length > 0) {
    return listResponse;
  }

  try {
    const sessionUser = await resolveApiSession(request);
    const r = String(sessionUser.role ?? "").trim().toLowerCase();
    const canRead = await canReadExhibitorLeadsInContext({
      userId: String(sessionUser.userId),
      companyId: String(sessionUser.companyId),
      role: r,
      isBearer: false,
      activePlatformAdminCompanyId: sessionUser.activeCompanyId
    });
    if (!canRead) {
      return listResponse;
    }

    const companyId = String(sessionUser.companyId ?? "").trim();
    if (!companyId) {
      return listResponse;
    }

    const now = new Date();
    const timestamp = now.getTime();
    const followUpDate = now.toISOString().slice(0, 10);
    const supabase = createAdminClient();

    const { data: insertedLead, error: insertError } = await (supabase as any)
      .from("leads")
      .insert({
        company_id: companyId,
        full_name: `Load Test Voice Lead ${timestamp}`,
        email: `loadtest+${timestamp}@leadintel.dev`,
        job_title: "Load Test Contact",
        temperature: null,
        priority_score: 0,
        rating: 0,
        status: "new",
        follow_up_date: followUpDate
      })
      .select(
        "id, full_name, email, phone, job_title, temperature, priority_score, rating, follow_up_date, updated_at, created_at"
      )
      .single();

    if (insertError || !insertedLead?.id) {
      console.error("[exhibitor/leads] failed auto-creating dev-bypass lead", {
        message: insertError?.message ?? "Insert returned no lead id"
      });
      return listResponse;
    }

    const workflowEmitResult = await attemptLeadCapturedWorkflowEmit({
      leadId: String(insertedLead.id),
      companyId,
      eventId: null,
      source: "dev_bypass_lead_seed",
      logContext: "app/api/exhibitor/leads:dev_bypass"
    });

    console.info("[lead-create] inserted lead row", {
      route: "app/api/exhibitor/leads:dev_bypass",
      leadId: String(insertedLead.id),
      companyId,
      eventId: null,
      source: "dev_bypass_lead_seed",
      workflowEmitAttempted: true,
      workflowEmitStatus: workflowEmitResult?.status ?? null
    });

    return NextResponse.json({
      leads: [insertedLead],
      leadId: String(insertedLead.id),
      autoCreatedForDevBypass: true
    });
  } catch (error) {
    console.error("[exhibitor/leads] dev-bypass fallback failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    return listResponse;
  }
}

export async function POST(request: Request) {
  console.info("[lead-create] legacy POST delegated to canonical create route", {
    route: "app/api/exhibitor/leads",
    delegatedTo: "app/api/exhibitor/leads/create"
  });
  return createLeadPOST(request);
}
