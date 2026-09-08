import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type PipedriveLeadSyncState = "unsent" | "syncing" | "synced" | "failed";

export type PipedriveLeadSyncSummary = {
  state: PipedriveLeadSyncState;
  lastError: string | null;
  syncedAt: string | null;
};

function toState(status: string | null | undefined): PipedriveLeadSyncState {
  if (status === "synced") return "synced";
  if (status === "failed") return "failed";
  if (status === "queued" || status === "syncing") return "syncing";
  return "unsent";
}

const UNSENT: PipedriveLeadSyncSummary = { state: "unsent", lastError: null, syncedAt: null };

export async function getPipedriveLeadSyncState(companyId: string, leadId: string): Promise<PipedriveLeadSyncSummary> {
  const { data, error } = await (createAdminClient() as any)
    .from("pipedrive_lead_syncs")
    .select("status, last_error, synced_at")
    .eq("company_id", companyId)
    .eq("lead_id", leadId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load the Pipedrive sync state.");
  if (!data) return UNSENT;
  return { state: toState(data.status), lastError: data.last_error ?? null, syncedAt: data.synced_at ?? null };
}

export async function getPipedriveLeadSyncStatesForLeads(
  companyId: string,
  leadIds: string[]
): Promise<Map<string, PipedriveLeadSyncSummary>> {
  const map = new Map<string, PipedriveLeadSyncSummary>();
  const uniqueIds = Array.from(new Set(leadIds.filter(Boolean)));
  if (uniqueIds.length === 0) return map;

  const { data, error } = await (createAdminClient() as any)
    .from("pipedrive_lead_syncs")
    .select("lead_id, status, last_error, synced_at")
    .eq("company_id", companyId)
    .in("lead_id", uniqueIds);
  if (error) throw new Error(error.message ?? "Failed to load Pipedrive sync states.");

  for (const row of (data ?? []) as Array<{ lead_id: string; status: string; last_error: string | null; synced_at: string | null }>) {
    map.set(row.lead_id, { state: toState(row.status), lastError: row.last_error ?? null, syncedAt: row.synced_at ?? null });
  }
  return map;
}

export type PipedriveUnsentLeadOption = { id: string; fullName: string | null; email: string | null };

/** Short list of the company's most-recent leads that have never been sent to Pipedrive, for the setup-page test picker. */
export async function listUnsentPipedriveLeadsForCompany(
  companyId: string,
  limit = 20
): Promise<PipedriveUnsentLeadOption[]> {
  const { data, error } = await (createAdminClient() as any)
    .from("leads")
    .select("id, full_name, email")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message ?? "Failed to load leads.");

  const rows = (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
  if (rows.length === 0) return [];

  const states = await getPipedriveLeadSyncStatesForLeads(
    companyId,
    rows.map((row) => row.id)
  );
  const unsent = rows.filter((row) => (states.get(row.id)?.state ?? "unsent") === "unsent");
  return unsent.slice(0, limit).map((row) => ({ id: row.id, fullName: row.full_name, email: row.email }));
}
