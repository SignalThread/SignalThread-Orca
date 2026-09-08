/**
 * Async scope resolution for lead export — wires DB-backed inputs into evaluateLeadsExportScopePure.
 * No "server-only" so tests can inject deterministic deps without mocking the pure RBAC rules.
 */
import {
  evaluateLeadsExportScopePure,
  scopeEvaluationToResponse
} from "@/lib/server/leads/leadsExportScopePure";
import type { ExportScope, ExportSession } from "@/lib/server/leads/leadsExportTypes";

export type LeadsExportScopeDeps = {
  fetchExhibitorCompanyIdForExport: (
    userId: string
  ) => Promise<
    { ok: true; companyId: string | null } | { ok: false; error: string }
  >;
  getOrganizerAllowedEventIds: (userId: string) => Promise<string[]>;
};

export async function resolveLeadsExportScopeWithDeps(
  params: {
    session: ExportSession;
    searchParams: URLSearchParams;
  },
  deps: LeadsExportScopeDeps
): Promise<ExportScope | Response> {
  const role = String(params.session.role ?? "").trim().toLowerCase();
  const eventIdParam = String(params.searchParams.get("eventId") ?? "").trim() || null;
  const companyIdParam = String(params.searchParams.get("companyId") ?? "").trim() || null;

  if (role === "exhibitor_admin") {
    const fetched = await deps.fetchExhibitorCompanyIdForExport(params.session.userId);
    if (!fetched.ok) {
      return new Response(JSON.stringify({ error: fetched.error }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    const exhibitorCompanyFromUserRow = fetched.companyId;
    const evaluated = evaluateLeadsExportScopePure({
      role,
      sessionCompanyId: params.session.companyId,
      companyIdParam,
      eventIdParam,
      exhibitorCompanyFromUserRow,
      organizerAllowedEventIds: null
    });
    return scopeEvaluationToResponse(evaluated);
  }

  if (role === "organizer_admin" || role === "event_organizer" || role === "organizer") {
    const organizerAllowedEventIds = await deps.getOrganizerAllowedEventIds(params.session.userId);
    const evaluated = evaluateLeadsExportScopePure({
      role,
      sessionCompanyId: params.session.companyId,
      companyIdParam,
      eventIdParam,
      exhibitorCompanyFromUserRow: null,
      organizerAllowedEventIds
    });
    return scopeEvaluationToResponse(evaluated);
  }

  const evaluated = evaluateLeadsExportScopePure({
    role,
    sessionCompanyId: params.session.companyId,
    companyIdParam,
    eventIdParam,
    exhibitorCompanyFromUserRow: null,
    organizerAllowedEventIds: null
  });
  return scopeEvaluationToResponse(evaluated);
}
