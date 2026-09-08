/**
 * Pure RBAC + scope evaluation for lead CSV export (no I/O).
 * Used by leadsExportQuery.ts and tested directly — do not duplicate rules elsewhere.
 */

import type { ExportScope } from "@/lib/server/leads/leadsExportTypes";

export type ScopeEvaluationResult =
  | { ok: true; scope: ExportScope }
  | { ok: false; status: number; error: string };

/**
 * Evaluates export scope from already-resolved inputs (DB reads done by caller).
 *
 * - platform_admin: requires companyIdParam (exhibitor company owning leads).
 * - exhibitor_admin: company comes from user row + session; optional companyIdParam only if it matches.
 * - organizer roles: eventIdParam required and must appear in organizerAllowedEventIds.
 */
export function evaluateLeadsExportScopePure(input: {
  role: string;
  sessionCompanyId: string;
  companyIdParam: string | null;
  eventIdParam: string | null;
  /** From users.company_id for exhibitor_admin; null for other roles when not applicable. */
  exhibitorCompanyFromUserRow: string | null;
  /** From getOrganizerScope().events.map(e => e.id); empty array means no access. */
  organizerAllowedEventIds: string[] | null;
}): ScopeEvaluationResult {
  const role = String(input.role ?? "").trim().toLowerCase();

  if (role === "platform_admin") {
    if (!input.companyIdParam?.trim()) {
      return { ok: false, status: 400, error: "companyId is required for platform export scope." };
    }
    return {
      ok: true,
      scope: {
        kind: "platform",
        companyId: input.companyIdParam.trim(),
        eventId: input.eventIdParam?.trim() || null
      }
    };
  }

  if (role === "exhibitor_admin") {
    const fromSession = String(input.sessionCompanyId ?? "").trim() || null;
    const fromRow = String(input.exhibitorCompanyFromUserRow ?? "").trim() || null;
    const companyId = fromRow ?? fromSession;
    const requested = input.companyIdParam?.trim() || null;
    const scopedCompanyId = requested && requested === companyId ? requested : companyId;

    if (!scopedCompanyId) {
      return { ok: false, status: 400, error: "Missing exhibitor company scope." };
    }

    return {
      ok: true,
      scope: {
        kind: "exhibitor",
        companyId: scopedCompanyId,
        eventId: input.eventIdParam?.trim() || null
      }
    };
  }

  if (role === "organizer_admin" || role === "event_organizer" || role === "organizer") {
    const eventId = input.eventIdParam?.trim() || "";
    if (!eventId) {
      return { ok: false, status: 400, error: "eventId is required for organizer export scope." };
    }

    const allowed = input.organizerAllowedEventIds;
    if (!allowed || !allowed.includes(eventId)) {
      return { ok: false, status: 403, error: "Selected event is outside organizer scope." };
    }

    return {
      ok: true,
      scope: { kind: "organizer", eventId }
    };
  }

  return { ok: false, status: 403, error: "Forbidden" };
}

export function scopeEvaluationToResponse(result: ScopeEvaluationResult): ExportScope | Response {
  if (result.ok) {
    return result.scope;
  }
  return new Response(JSON.stringify({ error: result.error }), {
    status: result.status,
    headers: { "Content-Type": "application/json" }
  });
}
