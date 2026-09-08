/**
 * Lead export row fetch — no "server-only" so integration tests can pass a real Supabase client.
 * Scope must already be authorized (see evaluateLeadsExportScopePure + resolveLeadsExportScope).
 */
import type { ExportFilters, ExportScope } from "@/lib/server/leads/leadsExportTypes";

const MAX_EXPORT_ROWS = 50_000;

export const LEADS_EXPORT_SELECT =
  "id, full_name, job_title, company_text, rating, priority_score, status, follow_up_date, created_at, updated_at, event_id, company_id";

export async function fetchLeadsForExportWithClient(
  supabase: { from: (t: string) => any },
  scope: ExportScope,
  filters: ExportFilters
): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  const selectList = LEADS_EXPORT_SELECT;

  let query = (supabase as any)
    .from("leads")
    .select(selectList)
    .order("created_at", { ascending: false })
    .limit(MAX_EXPORT_ROWS);

  if (scope.kind === "exhibitor") {
    query = query.eq("company_id", scope.companyId);
    if (scope.eventId) {
      query = query.eq("event_id", scope.eventId);
    }
  } else if (scope.kind === "organizer") {
    query = query.eq("event_id", scope.eventId);
  } else {
    query = query.eq("company_id", scope.companyId);
    if (scope.eventId) {
      query = query.eq("event_id", scope.eventId);
    }
  }

  if (filters.leadIds && filters.leadIds.length > 0) {
    query = query.in("id", filters.leadIds);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.q) {
    const normalized = filters.q.replace(/,/g, " ");
    query = query.or(
      `full_name.ilike.%${normalized}%,email.ilike.%${normalized}%,company_text.ilike.%${normalized}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    return { rows: [], error: error.message ?? "Failed loading leads for export." };
  }

  return { rows: (data ?? []) as Record<string, unknown>[], error: null };
}
