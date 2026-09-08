/**
 * Canonical CSV columns for lead exports (aligned with shared leads contract).
 * Order is stable for spreadsheets and diffs.
 */
export const LEADS_EXPORT_COLUMNS = [
  "id",
  "full_name",
  "job_title",
  "company_text",
  "rating",
  "priority_score",
  "status",
  "follow_up_date",
  "created_at",
  "updated_at",
  "event_id",
  "company_id"
] as const;

export type LeadsExportColumn = (typeof LEADS_EXPORT_COLUMNS)[number];

/**
 * RFC 4180-style field escaping for CSV rows (comma delimiter, CRLF line endings).
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const s = String(value);
  if (/[\r\n",]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildLeadsCsvHeaderLine(): string {
  return LEADS_EXPORT_COLUMNS.join(",") + "\r\n";
}

export function buildLeadsCsvRow(row: Record<string, unknown>): string {
  const cells = LEADS_EXPORT_COLUMNS.map((col) => escapeCsvCell(row[col]));
  return cells.join(",") + "\r\n";
}

/**
 * Full CSV document with UTF-8 BOM for Excel compatibility.
 */
export function buildLeadsCsvDocument(rows: Array<Record<string, unknown>>): string {
  let out = "\uFEFF";
  out += buildLeadsCsvHeaderLine();
  for (const row of rows) {
    out += buildLeadsCsvRow(row);
  }
  return out;
}
