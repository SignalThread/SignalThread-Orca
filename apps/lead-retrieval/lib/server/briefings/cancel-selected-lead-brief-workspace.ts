import "server-only";

import { assertEventIdAccessibleForUser } from "@/lib/server/company-event-access";
import { createAdminClient } from "@/lib/supabase/admin";

type BatchRow = {
  id: string;
  company_id: string | null;
  status: string | null;
  source_kind: string | null;
  source_selected_lead_ids: string[] | null;
};

type LeadScopeRow = {
  id: string;
  company_id: string | null;
  event_id: string | null;
};

function normalizeIdList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of values) {
    const id = String(value ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export type CancelSelectedLeadBriefWorkspaceInput = {
  userId: string;
  role: string;
  companyId: string;
  batchId: string;
};

export type CancelSelectedLeadBriefWorkspaceResult = {
  previousStatus: "draft";
  selectedLeadCount: number;
};

export async function cancelSelectedLeadBriefWorkspace(
  input: CancelSelectedLeadBriefWorkspaceInput
): Promise<CancelSelectedLeadBriefWorkspaceResult> {
  const role = String(input.role ?? "").trim().toLowerCase();
  if (role !== "exhibitor_admin") {
    throw new Error("forbidden");
  }

  const userId = String(input.userId ?? "").trim();
  const companyId = String(input.companyId ?? "").trim();
  const batchId = String(input.batchId ?? "").trim();
  if (!userId || !companyId || !batchId) {
    throw new Error("missing_scope");
  }

  const supabase = createAdminClient();
  const { data: batch, error: batchErr } = await (supabase as any)
    .from("import_batches")
    .select("id, company_id, status, source_kind, source_selected_lead_ids")
    .eq("id", batchId)
    .eq("company_id", companyId)
    .maybeSingle();

  const batchRow = batch as BatchRow | null;
  if (batchErr || !batchRow) {
    throw new Error("batch_not_found");
  }
  if (batchRow.source_kind !== "selected_leads") {
    throw new Error("selected_lead_workspace_only");
  }
  if (batchRow.status !== "draft") {
    throw new Error("batch_not_draft");
  }

  const leadIds = normalizeIdList(batchRow.source_selected_lead_ids);
  if (leadIds.length === 0) {
    throw new Error("selected_lead_workspace_incomplete");
  }

  const { data: leads, error: leadsErr } = await (supabase as any)
    .from("leads")
    .select("id, company_id, event_id")
    .eq("company_id", companyId)
    .in("id", leadIds);
  if (leadsErr) {
    throw new Error(leadsErr.message ?? "selected_lead_workspace_lookup_failed");
  }

  const scopedLeads = (leads ?? []) as LeadScopeRow[];
  if (scopedLeads.length !== leadIds.length) {
    throw new Error("selected_lead_workspace_incomplete");
  }

  const eventIds = new Set<string>();
  for (const lead of scopedLeads) {
    if (String(lead.company_id ?? "").trim() !== companyId) {
      throw new Error("selected_lead_workspace_incomplete");
    }
    const eventId = String(lead.event_id ?? "").trim();
    if (!eventId) {
      throw new Error("selected_lead_workspace_incomplete");
    }
    eventIds.add(eventId);
  }

  for (const eventId of eventIds) {
    await assertEventIdAccessibleForUser(userId, eventId);
  }

  const { error: updateErr } = await (supabase as any)
    .from("import_batches")
    .update({ status: "discarded", discarded_at: new Date().toISOString(), published_at: null })
    .eq("id", batchId)
    .eq("company_id", companyId)
    .eq("status", "draft")
    .eq("source_kind", "selected_leads");

  if (updateErr) {
    throw new Error(updateErr.message ?? "selected_lead_workspace_cancel_failed");
  }

  return { previousStatus: "draft", selectedLeadCount: leadIds.length };
}
