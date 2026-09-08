export const PLATFORM_ADMIN_ACCOUNT_CONTEXT_COOKIE = "st_platform_admin_company";

export type PlatformAdminAccountContext = {
  companyId: string;
  companyName: string;
};

export type AccountContextPrincipal = {
  userId: string;
  role: string | null;
};

export type AccountContextCompany = {
  id: string;
  name: string | null;
};

/**
 * Pure authorization boundary for account switching. The requested company is
 * never treated as a scope until the authenticated principal and canonical DB
 * company row have both been validated.
 */
export function resolvePlatformAdminAccountContext(input: {
  principal: AccountContextPrincipal | null;
  requestedCompanyId: string | null | undefined;
  company: AccountContextCompany | null;
}): PlatformAdminAccountContext | null {
  const requestedCompanyId = String(input.requestedCompanyId ?? "").trim();
  if (!input.principal?.userId || input.principal.role !== "platform_admin" || !requestedCompanyId) {
    return null;
  }

  const canonicalCompanyId = String(input.company?.id ?? "").trim();
  if (!canonicalCompanyId || canonicalCompanyId !== requestedCompanyId) {
    return null;
  }

  return {
    companyId: canonicalCompanyId,
    companyName: String(input.company?.name ?? "").trim() || "Unnamed company"
  };
}

export function accountScopedCacheKey(companyId: string, resource: string): string {
  return `${String(companyId).trim()}:${String(resource).trim()}`;
}

export function projectAccountContextOntoPrincipal(input: {
  principal: { userId: string; role: string | null; companyId: string | null };
  context: PlatformAdminAccountContext | null;
}) {
  const context = input.principal.role === "platform_admin" ? input.context : null;
  return {
    authenticatedUserId: input.principal.userId,
    authenticatedRole: input.principal.role,
    authenticatedCompanyId: input.principal.companyId,
    companyId: context?.companyId ?? input.principal.companyId,
    activeCompanyId: context?.companyId ?? null,
    activeCompanyName: context?.companyName ?? null
  };
}
