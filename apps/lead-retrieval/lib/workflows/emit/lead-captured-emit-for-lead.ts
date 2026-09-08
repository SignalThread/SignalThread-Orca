import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { attemptLeadCapturedWorkflowEmit } from "./non-fatal-lead-captured-emit";

type LeadEmitScopeRow = {
  id: string;
  company_id: string | null;
  event_id: string | null;
};

export async function attemptLeadCapturedWorkflowEmitForLeadId(input: {
  leadId: string;
  source: string;
  logContext: string;
}): Promise<{ attempted: boolean; status: string | null; reason?: string }> {
  const leadId = String(input.leadId ?? "").trim();
  if (!leadId) {
    return { attempted: false, status: null, reason: "missing_lead_id" };
  }

  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("leads")
    .select("id, company_id, event_id")
    .eq("id", leadId)
    .maybeSingle();

  if (error || !data) {
    console.warn("[workflows/emit] lead_captured emit scope lookup failed", {
      leadId,
      context: input.logContext,
      message: error?.message ?? "lead_not_found"
    });
    return { attempted: false, status: null, reason: error?.message ?? "lead_not_found" };
  }

  const lead = data as LeadEmitScopeRow;
  const companyId = String(lead.company_id ?? "").trim();
  if (!companyId) {
    return { attempted: false, status: null, reason: "missing_company_id" };
  }

  const result = await attemptLeadCapturedWorkflowEmit({
    leadId,
    companyId,
    eventId: lead.event_id ? String(lead.event_id) : null,
    source: input.source,
    logContext: input.logContext
  });

  return { attempted: true, status: result?.status ?? null };
}
