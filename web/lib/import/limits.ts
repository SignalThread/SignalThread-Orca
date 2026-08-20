// Server-side safety cap on the number of rows accepted in a single import
// request. Imports are parsed in the browser and POSTed as a JSON `rows` array,
// so the API must bound the array it receives. This is a conservative memory/
// timeout backstop against runaway or abusive uploads — several importers process
// rows one-by-one, which degrades well before this ceiling. It is NOT a per-section
// business quota: a section that legitimately needs to import more than this
// (e.g. a very large attendee list) is a product decision to raise the cap or add
// a streaming/batched path, not something to silently allow here.
export const MAX_IMPORT_ROWS = 10000;

export function exceedsImportRowLimit(rowCount: number): boolean {
  return rowCount > MAX_IMPORT_ROWS;
}

export function importRowLimitError(rowCount: number): { error: string; code: string } {
  return {
    error: `Import exceeds the maximum of ${MAX_IMPORT_ROWS} rows per upload (received ${rowCount}). Split the file into smaller batches.`,
    code: "TOO_MANY_ROWS",
  };
}
