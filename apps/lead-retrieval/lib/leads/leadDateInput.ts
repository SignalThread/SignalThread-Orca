/** Normalize DB / ISO values for input[type=date] (YYYY-MM-DD). */
export function toDateInputValue(v: string | null | undefined): string {
  if (v == null || String(v).trim() === "") return "";
  const s = String(v).trim();
  const ymd = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymd) return ymd[1];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
