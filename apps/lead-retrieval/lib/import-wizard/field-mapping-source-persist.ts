import type { Json } from "@/types/database";

/**
 * Whether source shape (headers + preview cells) changed vs previous persisted mapping.
 * Used to bump batch data_revision when users append rows or replace the file — downstream steps
 * should treat higher revision as stale relative to enrichment/validation caches.
 */
export function fieldMappingSourceChanged(
  prev: { csv_headers: string[]; preview_rows: Json } | null,
  next: { csv_headers: string[]; preview_rows: Json }
): boolean {
  if (!prev) return true;
  if (prev.csv_headers.length !== next.csv_headers.length) return true;
  for (let i = 0; i < prev.csv_headers.length; i++) {
    if (prev.csv_headers[i] !== next.csv_headers[i]) return true;
  }
  return JSON.stringify(prev.preview_rows) !== JSON.stringify(next.preview_rows);
}
