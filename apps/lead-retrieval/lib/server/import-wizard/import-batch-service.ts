import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  importBatchDisplayLabel,
  type ImportBatchSourceKind,
  type ImportBatchSummary,
} from "@/lib/import-wizard/import-batch-contract";
import { materializeImportedLeadsFromBatch } from "@/lib/server/import-wizard/publish-leads-materialization";
import { getBatchRowsForBatchWithAdmin } from "@/lib/server/import-wizard/import-batch-rows-service";
import { getFieldMappingStateForBatch } from "@/lib/server/import-wizard/field-mapping-state";
import { deriveImportBatchValidation } from "@/lib/import-wizard/import-batch-validation-derive";

function rowToSummary(row: {
  id: string;
  company_id: string;
  status: string;
  data_revision: number;
  source_last_filename: string | null;
  source_kind?: string | null;
  source_selected_lead_ids?: string[] | null;
  created_at?: string | null;
}): ImportBatchSummary {
  const sourceKind =
    row.source_kind === "selected_leads" ? "selected_leads" : "import_file";
  return {
    id: row.id,
    status: row.status as ImportBatchSummary["status"],
    companyId: row.company_id,
    dataRevision: row.data_revision,
    sourceLastFilename: row.source_last_filename,
    sourceKind: sourceKind as ImportBatchSourceKind,
    sourceSelectedLeadIds: Array.isArray(row.source_selected_lead_ids) ? row.source_selected_lead_ids : [],
    createdAt: row.created_at ?? null,
  };
}

export async function getActiveDraftBatchForCompany(companyId: string): Promise<ImportBatchSummary | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("id, company_id, status, data_revision, source_last_filename, source_kind, source_selected_lead_ids, created_at")
    .eq("company_id", companyId)
    .eq("source_kind", "import_file")
    .eq("status", "draft")
    .maybeSingle();

  if (error) {
    throw new Error(`import_batches_select_failed: ${error.message}${error.code ? ` (${error.code})` : ""}`);
  }
  if (!data) return null;
  return rowToSummary(data);
}

/**
 * Returns the company's active draft batch, creating one if none exists.
 * Concurrent creates: unique partial index on (company_id) where draft → retry select on 23505.
 */
export async function ensureActiveDraftBatch(companyId: string): Promise<ImportBatchSummary> {
  const existing = await getActiveDraftBatchForCompany(companyId);
  if (existing) return existing;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("import_batches")
    .insert({ company_id: companyId, status: "draft", source_kind: "import_file" } as never)
    .select("id, company_id, status, data_revision, source_last_filename, source_kind, source_selected_lead_ids, created_at")
    .single();

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      const retry = await getActiveDraftBatchForCompany(companyId);
      if (retry) return retry;
    }
    throw new Error(`import_batches_insert_failed: ${error.message}${code ? ` (${code})` : ""}`);
  }
  return rowToSummary(data);
}

export async function getBatchByIdForCompany(batchId: string, companyId: string): Promise<ImportBatchSummary | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("id, company_id, status, data_revision, source_last_filename, source_kind, source_selected_lead_ids, created_at")
    .eq("id", batchId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) return null;
  return rowToSummary(data);
}

export async function assertDraftBatchWritable(batchId: string, companyId: string): Promise<ImportBatchSummary> {
  const batch = await getBatchByIdForCompany(batchId, companyId);
  if (!batch) {
    throw new Error("batch_not_found");
  }
  if (batch.status !== "draft") {
    throw new Error("batch_not_draft");
  }
  return batch;
}

export type CompleteImportBatchResult = {
  importedCount?: number;
};

export async function completeImportBatch(
  batchId: string,
  companyId: string,
  action: "publish" | "discard",
  opts?: { ownerUserId?: string; eventId?: string | null }
): Promise<CompleteImportBatchResult> {
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  const nextStatus = action === "publish" ? "published" : "discarded";

  const { data: current, error: fetchErr } = await supabase
    .from("import_batches")
    .select("id, status")
    .eq("id", batchId)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string; status: string }>();

  if (fetchErr || !current) {
    throw new Error("batch_not_found");
  }
  if (current.status !== "draft") {
    throw new Error("batch_not_draft");
  }

  if (action === "publish") {
    const mapping = await getFieldMappingStateForBatch(batchId);
    const rows = await getBatchRowsForBatchWithAdmin(batchId);
    const validation = deriveImportBatchValidation({
      csv_headers: mapping?.csv_headers ?? [],
      selections: mapping?.selections ?? {},
      staged_rows: rows.map((row) => row.cells),
    });
    if (!validation.continueAllowed) {
      throw new Error("batch_validation_failed");
    }
  }

  const patch =
    action === "publish"
      ? { status: nextStatus, published_at: now, discarded_at: null as string | null }
      : { status: nextStatus, discarded_at: now, published_at: null as string | null };

  const { error } = await supabase
    .from("import_batches")
    .update(patch as never)
    .eq("id", batchId)
    .eq("company_id", companyId);

  if (error) {
    throw new Error(error.message);
  }

  if (action === "publish") {
    const ownerUserId = String(opts?.ownerUserId ?? "").trim();
    if (!ownerUserId) {
      throw new Error("missing_owner_for_publish");
    }
    const { importedCount } = await materializeImportedLeadsFromBatch({
      batchId,
      companyId,
      ownerUserId,
      eventId: opts?.eventId ?? null,
    });
    return { importedCount };
  }

  return {};
}

/**
 * Soft-deletes an import batch for exhibitor UI (AI Briefings / wizard lists).
 * Allowed from `draft` or `published`. Does not delete materialized leads or `lead_briefings`.
 */
export async function discardImportBatchForCompany(batchId: string, companyId: string): Promise<{
  previousStatus: "draft" | "published";
}> {
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();

  const { data: current, error: fetchErr } = await supabase
    .from("import_batches")
    .select("id, status")
    .eq("id", batchId)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string; status: string }>();

  if (fetchErr || !current) {
    throw new Error("batch_not_found");
  }
  if (current.status === "discarded") {
    throw new Error("batch_already_discarded");
  }
  if (current.status !== "draft" && current.status !== "published") {
    throw new Error("batch_cannot_discard");
  }

  const patch =
    current.status === "draft"
      ? ({ status: "discarded", discarded_at: now, published_at: null as string | null } as const)
      : ({ status: "discarded", discarded_at: now } as const);

  const { error } = await supabase
    .from("import_batches")
    .update(patch as never)
    .eq("id", batchId)
    .eq("company_id", companyId);

  if (error) {
    throw new Error(error.message);
  }

  return { previousStatus: current.status as "draft" | "published" };
}

export function formatActiveDraftResponse(batch: ImportBatchSummary) {
  return {
    batch: {
      id: batch.id,
      status: batch.status,
      displayLabel: importBatchDisplayLabel(batch.id),
      dataRevision: batch.dataRevision,
      sourceLastFilename: batch.sourceLastFilename,
    },
  };
}

export async function bumpBatchDataRevisionIfSourceChanged(
  batchId: string,
  companyId: string,
  changed: boolean
): Promise<void> {
  if (!changed) return;
  const supabase = await createSupabaseServerClient();
  const { data: row } = await supabase
    .from("import_batches")
    .select("data_revision")
    .eq("id", batchId)
    .eq("company_id", companyId)
    .maybeSingle<{ data_revision: number }>();

  const next = (row?.data_revision ?? 0) + 1;
  const { error } = await supabase
    .from("import_batches")
    .update({ data_revision: next } as never)
    .eq("id", batchId)
    .eq("company_id", companyId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function updateBatchSourceFilename(
  batchId: string,
  companyId: string,
  filename: string | null | undefined
): Promise<void> {
  if (filename == null || filename.trim() === "") return;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("import_batches")
    .update({ source_last_filename: filename.trim() } as never)
    .eq("id", batchId)
    .eq("company_id", companyId);
  if (error) {
    throw new Error(error.message);
  }
}
