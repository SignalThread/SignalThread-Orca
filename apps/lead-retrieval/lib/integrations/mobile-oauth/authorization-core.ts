import { isExhibitorScopedRole } from "@/lib/auth/role-scope";

export type MobileIntegrationSession = {
  userId: string;
  companyId: string;
  role: string;
};

export type MobileIntegrationEventAccess = {
  eventIds: string[];
  companyId: string | null;
  role: string | null;
};

export type MobileIntegrationAuthorization =
  | { ok: true; context: MobileIntegrationSession }
  | { ok: false; status: 401 | 403; error: "Unauthorized" | "Forbidden" };

export type MobileIntegrationAuthorizationDeps = {
  resolveSession: (request: Request) => Promise<MobileIntegrationSession>;
  resolveEventAccess: (userId: string) => Promise<MobileIntegrationEventAccess>;
};

function normalizedId(value: string | null | undefined) {
  return String(value ?? "").trim();
}

/**
 * Bearer-authenticated mobile integration access is a user/company/event
 * entitlement, not an exhibitor-admin capability. The session resolver also
 * enforces the user's mobile-app permission before this canonical scope check.
 */
export async function authorizeMobileIntegrationRequestWithDeps(
  request: Request,
  deps: MobileIntegrationAuthorizationDeps
): Promise<MobileIntegrationAuthorization> {
  if (!/^Bearer\s+\S+/i.test(request.headers.get("authorization") ?? "")) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const session = await deps.resolveSession(request);
  const sessionCompanyId = normalizedId(session.companyId);
  if (!isExhibitorScopedRole(session.role) || !sessionCompanyId) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const access = await deps.resolveEventAccess(session.userId);
  const accessCompanyId = normalizedId(access.companyId);
  if (
    !isExhibitorScopedRole(access.role) ||
    access.role !== session.role ||
    !accessCompanyId ||
    accessCompanyId !== sessionCompanyId ||
    access.eventIds.length === 0
  ) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return {
    ok: true,
    context: {
      userId: session.userId,
      companyId: sessionCompanyId,
      role: session.role
    }
  };
}
