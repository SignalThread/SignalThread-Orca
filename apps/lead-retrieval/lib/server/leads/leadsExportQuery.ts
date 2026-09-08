import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getOrganizerScope } from "@/lib/data/organizer-scope";
import { buildLeadsCsvDocument } from "@/lib/server/leads/csvFormat";
import { fetchLeadsForExportWithClient } from "@/lib/server/leads/leadsExportFetch";
import {
  resolveLeadsExportScopeWithDeps,
  type LeadsExportScopeDeps
} from "@/lib/server/leads/leadsExportResolveScope";
import type { ExportFilters, ExportScope, ExportSession } from "@/lib/server/leads/leadsExportTypes";

export type { ExportFilters, ExportScope, ExportSession } from "@/lib/server/leads/leadsExportTypes";

export { parseExportFilters } from "@/lib/server/leads/leadsExportFiltersPure";
export { fetchLeadsForExportWithClient, LEADS_EXPORT_SELECT } from "@/lib/server/leads/leadsExportFetch";
export { resolveLeadsExportScopeWithDeps, type LeadsExportScopeDeps };

const defaultLeadsExportScopeDeps: LeadsExportScopeDeps = {
  fetchExhibitorCompanyIdForExport: async (userId) => {
    const supabase = createAdminClient();
    const { data: currentUser, error } = await (supabase as any)
      .from("users")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      return { ok: false, error: "Failed resolving exhibitor scope." };
    }

    return {
      ok: true,
      companyId: String(currentUser?.company_id ?? "").trim() || null
    };
  },
  getOrganizerAllowedEventIds: async (userId) => {
    const scope = await getOrganizerScope(userId);
    return scope.events.map((e) => e.id);
  }
};

/**
 * Resolves RBAC-safe export scope. Returns a Response when the request must be rejected.
 * Core rules live in evaluateLeadsExportScopePure; I/O is wired via resolveLeadsExportScopeWithDeps.
 */
export async function resolveLeadsExportScope(params: {
  session: ExportSession;
  searchParams: URLSearchParams;
}): Promise<ExportScope | Response> {
  return resolveLeadsExportScopeWithDeps(params, defaultLeadsExportScopeDeps);
}

/**
 * Narrow select + scoped filters. Applies optional search/status consistent with exhibitor list.
 */
export async function fetchLeadsForExport(
  scope: ExportScope,
  filters: ExportFilters
): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  return fetchLeadsForExportWithClient(createAdminClient(), scope, filters);
}

export function buildExportFilename(scope: ExportScope): string {
  const d = new Date().toISOString().slice(0, 10);
  if (scope.kind === "organizer") {
    return `leads-export-event-${scope.eventId.slice(0, 8)}-${d}.csv`;
  }
  const ev = scope.eventId ? `-${scope.eventId.slice(0, 8)}` : "";
  return `leads-export-company-${scope.companyId.slice(0, 8)}${ev}-${d}.csv`;
}

export async function runLeadsExportCsv(
  scope: ExportScope,
  filters: ExportFilters
): Promise<{ csv: string; filename: string; error: string | null }> {
  const { rows, error } = await fetchLeadsForExport(scope, filters);
  if (error) {
    return { csv: "", filename: "", error };
  }
  return {
    csv: buildLeadsCsvDocument(rows),
    filename: buildExportFilename(scope),
    error: null
  };
}
