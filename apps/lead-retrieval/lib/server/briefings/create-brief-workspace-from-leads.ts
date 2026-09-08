import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import { resolveValidatedActiveEventIdForUser } from "@/lib/server/company-event-access";
import {
  buildSelectedLeadBriefPreviewRows,
  buildSelectedLeadBriefWorkspaceRows,
  MAX_SELECTED_BRIEF_LEADS,
  SELECTED_LEAD_HEADERS,
  SELECTED_LEAD_SELECTIONS,
  uniqueTrimmedSelectedLeadIds,
  validateSelectedLeadRowsForBriefWorkspace,
  type SelectedLeadBriefWorkspaceLead,
} from "@/lib/briefings/selected-lead-brief-workspace";

export type SelectedLeadBriefWorkspaceInput = {
  userId: string;
  role: string;
  companyId: string;
  eventId?: string | null;
  leadIds: string[];
};

export type SelectedLeadBriefWorkspaceResult = {
  batchId: string;
  eventId: string;
  leadIds: string[];
};

async function deleteBatchQuietly(batchId: string) {
  try {
    await createAdminClient().from("import_batches").delete().eq("id", batchId);
  } catch {
    // Best-effort rollback after validated create failure.
  }
}

export async function createBriefWorkspaceFromLeadSelection(
  input: SelectedLeadBriefWorkspaceInput
): Promise<SelectedLeadBriefWorkspaceResult> {
  const role = String(input.role ?? "").trim().toLowerCase();
  if (role !== "exhibitor_admin") {
    throw new Error("forbidden");
  }

  const userId = String(input.userId ?? "").trim();
  const companyId = String(input.companyId ?? "").trim();
  if (!userId || !companyId) {
    throw new Error("missing_scope");
  }

  const leadIds = uniqueTrimmedSelectedLeadIds(input.leadIds);
  if (leadIds.length === 0) {
    throw new Error("lead_selection_empty");
  }
  if (leadIds.length > MAX_SELECTED_BRIEF_LEADS) {
    throw new Error("lead_selection_too_large");
  }

  const eventResolution = await resolveValidatedActiveEventIdForUser(
    userId,
    String(input.eventId ?? "").trim() || null
  );
  const eventId = String(eventResolution.eventId ?? "").trim();
  if (!eventId) {
    throw new Error("missing_event_scope");
  }

  const supabase = createAdminClient();
  const { data: rawRows, error: leadErr } = await (supabase as any)
    .from("leads")
    .select("id, company_id, event_id, full_name, email, job_title, company_text, temperature, rating, status, follow_up_date")
    .eq("company_id", companyId)
    .eq("event_id", eventId)
    .in("id", leadIds);

  if (leadErr) {
    throw new Error(leadErr.message ?? "lead_selection_lookup_failed");
  }

  const selectedLeads = validateSelectedLeadRowsForBriefWorkspace({
    requestedLeadIds: leadIds,
    rows: (rawRows ?? []) as SelectedLeadBriefWorkspaceLead[],
    companyId,
    eventId,
  });

  const stagedRows = buildSelectedLeadBriefWorkspaceRows(selectedLeads);
  const previewRows = buildSelectedLeadBriefPreviewRows(stagedRows);

  const { data: batch, error: batchErr } = await (supabase as any)
    .from("import_batches")
    .insert({
      company_id: companyId,
      status: "draft",
      source_kind: "selected_leads",
      source_selected_lead_ids: leadIds,
      source_last_filename: null,
    })
    .select("id")
    .single();

  if (batchErr || !batch?.id) {
    throw new Error(batchErr?.message ?? "brief_workspace_create_failed");
  }

  const batchId = String(batch.id);
  try {
    const { error: mappingErr } = await (supabase as any)
      .from("import_batch_field_mapping_state")
      .upsert(
        {
          batch_id: batchId,
          csv_headers: [...SELECTED_LEAD_HEADERS],
          preview_rows: previewRows as unknown as Json,
          selections: SELECTED_LEAD_SELECTIONS as unknown as Json,
          custom_field_definitions: {} as Json,
        },
        { onConflict: "batch_id" }
      );
    if (mappingErr) throw new Error(mappingErr.message ?? "brief_workspace_mapping_failed");

    const rowInserts = stagedRows.map((cells, row_index) => ({
      batch_id: batchId,
      row_index,
      cells: cells as unknown as Json,
    }));
    const { data: insertedRows, error: rowsErr } = await (supabase as any)
      .from("import_batch_rows")
      .insert(rowInserts)
      .select("id, row_index");
    if (rowsErr) throw new Error(rowsErr.message ?? "brief_workspace_rows_failed");

    const rowIds = ((insertedRows ?? []) as Array<{ id: string; row_index: number }>).sort(
      (a, b) => Number(a.row_index) - Number(b.row_index)
    );
    if (rowIds.length !== selectedLeads.length) {
      throw new Error("brief_workspace_rows_incomplete");
    }

    const briefingInserts = rowIds.map((row, index) => ({
      batch_id: batchId,
      batch_row_id: row.id,
      content: {
        linkage: {
          published_lead_id: selectedLeads[index]!.id,
        },
      } as unknown as Json,
    }));
    const { error: briefingErr } = await (supabase as any)
      .from("import_batch_row_briefings")
      .insert(briefingInserts);
    if (briefingErr) throw new Error(briefingErr.message ?? "brief_workspace_briefing_rows_failed");
  } catch (error) {
    await deleteBatchQuietly(batchId);
    throw error;
  }

  return { batchId, eventId, leadIds };
}
