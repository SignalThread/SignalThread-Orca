import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { chunkLeadIds, partitionLeadIdsForExhibitorDelete } from "@/lib/leads/exhibitorLeadDeletePartition";

type LeadScopeRow = {
  id: string;
  company_id: string;
  event_id: string | null;
};

export type ExhibitorLeadDeleteSingleResult =
  | { outcome: "deleted"; leadId: string }
  | { outcome: "missing"; leadId: string }
  | { outcome: "forbidden"; leadId: string; reason: string }
  | { outcome: "error"; message: string };

export type ExhibitorLeadDeleteBulkResult =
  | {
      outcome: "completed";
      deleted: string[];
      missing: string[];
      forbidden: { leadId: string; reason: string }[];
    }
  | { outcome: "error"; message: string; requested?: number; deleted?: string[]; failed?: string[] };

/**
 * Canonical server-owned delete for one lead: select (authz) → delete → verify returned row.
 * Uses service role only; never rely on client-side RLS for exhibitors.
 */
export async function deleteExhibitorLeadForCompany(params: {
  leadId: string;
  companyId: string;
}): Promise<ExhibitorLeadDeleteSingleResult> {
  const leadId = String(params.leadId ?? "").trim();
  const companyId = String(params.companyId ?? "").trim();
  if (!leadId) {
    return { outcome: "error", message: "Missing lead id." };
  }
  if (!companyId) {
    return { outcome: "error", message: "Missing company scope." };
  }

  const supabase = createAdminClient();

  const { data: row, error: selectError } = await (supabase as any)
    .from("leads")
    .select("id, company_id")
    .eq("id", leadId)
    .maybeSingle();

  if (selectError) {
    return { outcome: "error", message: selectError.message ?? "Failed to resolve lead." };
  }
  if (!row) {
    return { outcome: "missing", leadId };
  }
  if (String(row.company_id) !== companyId) {
    return { outcome: "forbidden", leadId, reason: "Lead belongs to another company." };
  }

  const { data: deletedRows, error: deleteError } = await (supabase as any)
    .from("leads")
    .delete()
    .eq("id", leadId)
    .eq("company_id", companyId)
    .select("id");

  if (deleteError) {
    return { outcome: "error", message: deleteError.message ?? "Failed deleting lead." };
  }
  const deleted = (deletedRows ?? []) as { id: string }[];
  if (deleted.length !== 1) {
    return {
      outcome: "error",
      message: "Delete did not remove exactly one row."
    };
  }

  return { outcome: "deleted", leadId };
}

/**
 * Bulk delete with the same authz rules: fetch scope rows → partition → delete in one statement → verify count.
 */
export async function deleteExhibitorLeadsBulkForCompany(params: {
  leadIds: string[];
  companyId: string;
  eventId: string;
}): Promise<ExhibitorLeadDeleteBulkResult> {
  const companyId = String(params.companyId ?? "").trim();
  const eventId = String(params.eventId ?? "").trim();
  if (!companyId) {
    return { outcome: "error", message: "Missing company scope." };
  }
  if (!eventId) return { outcome: "error", message: "Missing event scope." };

  const raw = params.leadIds ?? [];
  const requested = [...new Set(raw.map((id) => String(id).trim()).filter(Boolean))];
  if (requested.length === 0) {
    return { outcome: "error", message: "No valid lead IDs provided." };
  }

  const supabase = createAdminClient();

  const rows: LeadScopeRow[] = [];
  for (const ids of chunkLeadIds(requested)) {
    const { data, error } = (await (supabase as any)
      .from("leads")
      .select("id, company_id, event_id")
      .in("id", ids)) as { data: LeadScopeRow[] | null; error: { message: string } | null };
    if (error) return { outcome: "error", message: error.message ?? "Failed to resolve leads." };
    rows.push(...(data ?? []));
  }

  const { deletable, missing, forbidden } = partitionLeadIdsForExhibitorDelete(
    requested,
    rows,
    companyId,
    eventId
  );

  if (deletable.length === 0) {
    return { outcome: "completed", deleted: [], missing, forbidden };
  }

  const deletedIds = new Set<string>();
  for (const ids of chunkLeadIds(deletable)) {
    const { data: deletedRows, error: deleteError } = await (supabase as any)
      .from("leads")
      .delete()
      .in("id", ids)
      .eq("company_id", companyId)
      .eq("event_id", eventId)
      .select("id");
    if (deleteError) {
      return {
        outcome: "error",
        message: `Deleted ${deletedIds.size} of ${deletable.length} scoped rows: ${deleteError.message ?? "delete failed"}.`,
        requested: requested.length,
        deleted: [...deletedIds],
        failed: ids
      };
    }
    for (const row of (deletedRows ?? []) as { id: string }[]) deletedIds.add(row.id);
  }
  if (deletedIds.size !== deletable.length) {
    return {
      outcome: "error",
      message: `Delete removed ${deletedIds.size} of ${deletable.length} scoped rows.`,
      requested: requested.length,
      deleted: [...deletedIds],
      failed: deletable.filter((id) => !deletedIds.has(id))
    };
  }

  return {
    outcome: "completed",
    deleted: [...deletedIds],
    missing,
    forbidden
  };
}
