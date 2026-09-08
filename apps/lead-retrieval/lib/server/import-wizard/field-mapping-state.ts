import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json, Tables, TablesInsert } from "@/types/database";

type FieldMappingStateRow = Pick<
  Tables<"import_batch_field_mapping_state">,
  "csv_headers" | "preview_rows" | "selections" | "custom_field_definitions"
>;
import {
  assertDraftBatchWritable,
  bumpBatchDataRevisionIfSourceChanged,
  updateBatchSourceFilename,
} from "@/lib/server/import-wizard/import-batch-service";
import {
  cellsMatricesEqual,
  getCellsMatrixForBatch,
  replaceBatchRowsForBatch,
} from "@/lib/server/import-wizard/import-batch-rows-service";
import { fieldMappingSourceChanged } from "@/lib/import-wizard/field-mapping-source-persist";
import type { CustomFieldDefinitions } from "@/lib/import-wizard/custom-field-mapping";

export type FieldMappingPreviewColumn = {
  csvColumn: string;
  cells: string[];
};

/** Mapping + preview only (persisted on import_batch_field_mapping_state). */
export type FieldMappingStatePayload = {
  csv_headers: string[];
  preview_rows: FieldMappingPreviewColumn[];
  selections: Record<string, string>;
  /** Labels for `custom:<key>` entries in selections. */
  custom_field_definitions: CustomFieldDefinitions;
};

/** Client POST body: mapping state plus full CSV row matrix (stored in import_batch_rows). */
export type FieldMappingPersistPayload = FieldMappingStatePayload & {
  staged_rows: string[][];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseSelectionsJson(raw: Json): Record<string, string> {
  if (!isRecord(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function parseCustomFieldDefinitionsJson(raw: Json): CustomFieldDefinitions {
  if (!isRecord(raw)) return {};
  const out: CustomFieldDefinitions = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!/^[a-z0-9_]{1,64}$/i.test(k)) continue;
    if (!isRecord(v)) continue;
    if (typeof v.label === "string") out[k] = { label: v.label };
  }
  return out;
}

function parsePreviewJson(raw: Json): FieldMappingPreviewColumn[] {
  if (!Array.isArray(raw)) return [];
  const out: FieldMappingPreviewColumn[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const col = item.csvColumn;
    const cells = item.cells;
    if (typeof col !== "string" || !Array.isArray(cells)) continue;
    out.push({
      csvColumn: col,
      cells: cells.map((c) => (typeof c === "string" ? c : "")),
    });
  }
  return out;
}

export async function getFieldMappingStateForBatch(batchId: string): Promise<FieldMappingStatePayload | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("import_batch_field_mapping_state")
    .select("csv_headers, preview_rows, selections, custom_field_definitions")
    .eq("batch_id", batchId)
    .maybeSingle<FieldMappingStateRow>();

  if (error || !data) return null;

  const headers = Array.isArray(data.csv_headers) ? data.csv_headers.map((h) => String(h)) : [];

  return {
    csv_headers: headers,
    preview_rows: parsePreviewJson(data.preview_rows as Json),
    selections: parseSelectionsJson(data.selections as Json),
    custom_field_definitions: parseCustomFieldDefinitionsJson(data.custom_field_definitions as Json),
  };
}

/** Same as {@link getFieldMappingStateForBatch} but uses the admin client (e.g. after batch publish). */
export async function getFieldMappingStateForBatchWithAdmin(batchId: string): Promise<FieldMappingStatePayload | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("import_batch_field_mapping_state")
    .select("csv_headers, preview_rows, selections, custom_field_definitions")
    .eq("batch_id", batchId)
    .maybeSingle<FieldMappingStateRow>();

  if (error || !data) return null;

  const headers = Array.isArray(data.csv_headers) ? data.csv_headers.map((h) => String(h)) : [];

  return {
    csv_headers: headers,
    preview_rows: parsePreviewJson(data.preview_rows as Json),
    selections: parseSelectionsJson(data.selections as Json),
    custom_field_definitions: parseCustomFieldDefinitionsJson(data.custom_field_definitions as Json),
  };
}

export async function upsertFieldMappingStateForBatch(
  batchId: string,
  companyId: string,
  payload: FieldMappingPersistPayload,
  opts?: { sourceFilename?: string | null }
): Promise<void> {
  await assertDraftBatchWritable(batchId, companyId);

  const prev = await getFieldMappingStateForBatch(batchId);
  const prevMatrix = await getCellsMatrixForBatch(batchId);
  const previewJson = payload.preview_rows as unknown as Json;
  const defsJson = payload.custom_field_definitions as unknown as Json;

  const row: TablesInsert<"import_batch_field_mapping_state"> = {
    batch_id: batchId,
    csv_headers: payload.csv_headers,
    preview_rows: previewJson,
    selections: payload.selections as unknown as Json,
    custom_field_definitions: defsJson,
  };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("import_batch_field_mapping_state")
    .upsert(row as never, { onConflict: "batch_id" });

  if (error) {
    const err = new Error(error.message) as Error & { supabaseCode?: string };
    err.supabaseCode = error.code;
    throw err;
  }

  await replaceBatchRowsForBatch(batchId, companyId, payload.staged_rows);

  const previewChanged = fieldMappingSourceChanged(
    prev
      ? { csv_headers: prev.csv_headers, preview_rows: prev.preview_rows as unknown as Json }
      : null,
    { csv_headers: payload.csv_headers, preview_rows: previewJson }
  );
  const defsChanged =
    JSON.stringify(prev?.custom_field_definitions ?? {}) !== JSON.stringify(payload.custom_field_definitions ?? {});
  const selectionsChanged = JSON.stringify(prev?.selections ?? {}) !== JSON.stringify(payload.selections ?? {});
  const cellsChanged = !cellsMatricesEqual(prevMatrix, payload.staged_rows);
  // Mapping changes alter validation semantics even when the source rows are unchanged.
  const changed = previewChanged || cellsChanged || defsChanged || selectionsChanged;
  await bumpBatchDataRevisionIfSourceChanged(batchId, companyId, changed);

  if (opts?.sourceFilename != null) {
    await updateBatchSourceFilename(batchId, companyId, opts.sourceFilename);
  }
}
