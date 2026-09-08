import type { AppRole } from "@/types/app";

export type CompanyIntegrationAuthorizationInput = {
  userId: string | null;
  role: AppRole | null;
  companyId: string | null;
  activeCompanyId: string | null;
  hasExhibitorWebAdminAccess: boolean;
};

export type CompanyIntegrationAuthorizationResult =
  | { ok: true; context: { userId: string; companyId: string } }
  | { ok: false; status: 400 | 401 | 403; error: string };

/**
 * Provider-neutral write authorization for a company-owned integration.
 * Platform-admin scope is accepted only when the session has already projected
 * the validated selected-company context onto `companyId`.
 */
export function resolveCompanyIntegrationAuthorization(
  input: CompanyIntegrationAuthorizationInput
): CompanyIntegrationAuthorizationResult {
  if (!input.userId) return { ok: false, status: 401, error: "Unauthorized" };

  const companyId = String(input.companyId ?? "").trim();
  if (input.role === "platform_admin") {
    const activeCompanyId = String(input.activeCompanyId ?? "").trim();
    if (!activeCompanyId || !companyId || activeCompanyId !== companyId) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
    return { ok: true, context: { userId: input.userId, companyId } };
  }

  if (input.role !== "exhibitor_admin") {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (!companyId) return { ok: false, status: 400, error: "Missing exhibitor account." };
  if (!input.hasExhibitorWebAdminAccess) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, context: { userId: input.userId, companyId } };
}
