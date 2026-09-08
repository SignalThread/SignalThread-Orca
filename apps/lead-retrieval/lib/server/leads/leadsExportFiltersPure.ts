import type { ExportFilters } from "@/lib/server/leads/leadsExportTypes";

function isLeadStatus(value: string) {
  return value === "new" || value === "follow_up" || value === "closed";
}

function parseSearchQuery(value?: string | null) {
  const next = String(value ?? "").trim();
  return next || null;
}

export function parseExportFilters(searchParams: URLSearchParams): ExportFilters {
  return {
    q: parseSearchQuery(searchParams.get("q")),
    status: (() => {
      const s = String(searchParams.get("status") ?? "").trim();
      return s && isLeadStatus(s) ? s : null;
    })(),
    leadIds: null
  };
}
