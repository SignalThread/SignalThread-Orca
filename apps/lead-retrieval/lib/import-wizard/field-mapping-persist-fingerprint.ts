import { stableStringifyCustomFieldDefinitions, type CustomFieldDefinitions } from "@/lib/import-wizard/custom-field-mapping";

function sortedSelectionsJson(sel: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(sel).sort()) {
    out[k] = sel[k] ?? "";
  }
  return out;
}

/** Stable fingerprint for debounced POST + sync with last server-backed save/load. */
export function fieldMappingPersistFingerprint(p: {
  csv_headers: string[];
  preview_rows: { csvColumn: string; cells: string[] }[];
  selections: Record<string, string>;
  custom_field_definitions: CustomFieldDefinitions;
  staged_rows: string[][];
  source_filename: string | null;
}): string {
  return JSON.stringify({
    csv_headers: p.csv_headers,
    preview_rows: p.preview_rows,
    selections: sortedSelectionsJson(p.selections),
    custom_field_definitions: stableStringifyCustomFieldDefinitions(p.custom_field_definitions),
    staged_rows: p.staged_rows,
    source_filename: p.source_filename,
  });
}
