/**
 * Canonical import batch status values (see public.import_batches.status).
 * Single source of truth for wizard batch lifecycle — DB check constraint matches.
 */

export type ImportBatchStatus = "draft" | "published" | "discarded";
export type ImportBatchSourceKind = "import_file" | "selected_leads";

export type ImportBatchSummary = {
  id: string;
  status: ImportBatchStatus;
  companyId: string;
  dataRevision: number;
  sourceLastFilename: string | null;
  sourceKind: ImportBatchSourceKind;
  sourceSelectedLeadIds: string[];
  /** ISO timestamp from `import_batches.created_at`, when selected */
  createdAt: string | null;
};

export function isImportBatchDraftStatus(s: string): s is "draft" {
  return s === "draft";
}

export function isImportBatchTerminalStatus(s: string): boolean {
  return s === "published" || s === "discarded";
}

/** Field mapping and source preview may only be written while the batch is draft. */
export function canWriteFieldMappingForBatchStatus(s: string): boolean {
  return s === "draft";
}

/** Short display label for wizard chrome (not a stable business identifier). */
export function importBatchDisplayLabel(batchId: string): string {
  const compact = batchId.replace(/-/g, "");
  return `#${compact.slice(0, 6)}`;
}
