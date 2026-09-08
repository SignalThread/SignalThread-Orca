import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/types/database";

type BatchRowCells = Pick<Tables<"import_batch_rows">, "row_index" | "cells">;
type BatchRowWithId = Pick<
  Tables<"import_batch_rows">,
  "id" | "row_index" | "cells" | "wizard_enrichment_normalized"
>;
import { assertDraftBatchWritable } from "@/lib/server/import-wizard/import-batch-service";

const INSERT_CHUNK = 500;

function parseCellsJson(raw: Json): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => (typeof c === "string" ? c : ""));
}

/**
 * Ordered matrix of cell values for validation / revision compare (row_index ASC).
 */
export async function getCellsMatrixForBatch(batchId: string): Promise<string[][]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("import_batch_rows")
    .select("row_index, cells")
    .eq("batch_id", batchId)
    .order("row_index", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.length === 0) return [];

  return (data as BatchRowCells[]).map((row) => parseCellsJson(row.cells as Json));
}

/** Same as {@link getCellsMatrixForBatch} but uses the admin client (e.g. after batch publish). */
export async function getCellsMatrixForBatchWithAdmin(batchId: string): Promise<string[][]> {
  const rows = await getBatchRowsForBatchWithAdmin(batchId);
  return rows.map((row) => row.cells);
}

/**
 * Ordered batch rows (row_index ASC) with stable `import_batch_rows.id`.
 * Needed for durable post-publish linkage (lead -> lead_briefings sourced from batch row briefings).
 */
export async function getBatchRowsForBatchWithAdmin(
  batchId: string
): Promise<
  Array<{ id: string; rowIndex: number; cells: string[]; wizardEnrichmentNormalized: Json | null }>
> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("import_batch_rows")
    .select("id, row_index, cells, wizard_enrichment_normalized")
    .eq("batch_id", batchId)
    .order("row_index", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.length === 0) return [];

  return (data as BatchRowWithId[]).map((row) => ({
    id: String(row.id),
    rowIndex: Number(row.row_index),
    cells: parseCellsJson(row.cells as Json),
    wizardEnrichmentNormalized: (row.wizard_enrichment_normalized ?? null) as Json | null
  }));
}

/**
 * Replace all staged rows for a draft batch: delete existing rows, then insert the new matrix.
 * Empty matrix leaves the batch with zero rows (validation shows totalRows = 0).
 */
export async function replaceBatchRowsForBatch(
  batchId: string,
  companyId: string,
  rows: string[][]
): Promise<void> {
  await assertDraftBatchWritable(batchId, companyId);

  const supabase = await createSupabaseServerClient();

  const { error: delError } = await supabase.from("import_batch_rows").delete().eq("batch_id", batchId);
  if (delError) {
    const err = new Error(delError.message) as Error & { supabaseCode?: string };
    err.supabaseCode = delError.code;
    throw err;
  }

  if (rows.length === 0) {
    return;
  }

  for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK) {
    const slice = rows.slice(offset, offset + INSERT_CHUNK);
    const inserts = slice.map((cells, j) => ({
      batch_id: batchId,
      row_index: offset + j,
      cells: cells as unknown as Json,
    }));
    const { error: insError } = await supabase.from("import_batch_rows").insert(inserts as never);
    if (insError) {
      const err = new Error(insError.message) as Error & { supabaseCode?: string };
      err.supabaseCode = insError.code;
      throw err;
    }
  }
}

export { cellsMatricesEqual } from "@/lib/import-wizard/cells-matrix-compare";
