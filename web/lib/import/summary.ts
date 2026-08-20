// Common row-result and import-summary shapes. The summary mirrors the shape
// already returned by the speaker importer so section importers and their UIs
// converge on one contract: { imported, skipped, duplicates, failed, errors }.

/** A row-scoped problem reported back to the user. */
export type ImportRowIssue = { row: number; message: string };

/** Validation outcome for a single mapped row before it is written. */
export type ImportRowResult<Normalized> = {
  rowNumber: number;
  normalized?: Normalized;
  isBlank: boolean;
  isValid: boolean;
  errors: string[];
  warnings: string[];
};

/** Aggregate result of an import attempt, supporting partial success. */
export type ImportSummary = {
  imported: number;
  skipped: number;
  duplicates: number;
  failed: number;
  errors: ImportRowIssue[];
};

/** Create an empty, zeroed import summary. */
export function createImportSummary(): ImportSummary {
  return { imported: 0, skipped: 0, duplicates: 0, failed: 0, errors: [] };
}

/** Roll a list of row results into preview counts. */
export function summarizeRowResults<Normalized>(results: ImportRowResult<Normalized>[]): {
  validCount: number;
  invalidCount: number;
  blankCount: number;
  warningCount: number;
} {
  let validCount = 0;
  let invalidCount = 0;
  let blankCount = 0;
  let warningCount = 0;

  for (const result of results) {
    warningCount += result.warnings.length;
    if (result.isBlank) blankCount += 1;
    else if (result.isValid) validCount += 1;
    else invalidCount += 1;
  }

  return { validCount, invalidCount, blankCount, warningCount };
}
