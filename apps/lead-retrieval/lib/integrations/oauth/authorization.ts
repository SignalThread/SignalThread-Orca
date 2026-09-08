import "server-only";

import { getCurrentSessionUser, normalizeSessionRole } from "@/lib/auth/session";
import { getUserHasExhibitorWebAdminAccess } from "@/lib/server/exhibitor-permission-aggregates";

/**
 * Provider-neutral RBAC for user-owned integration connections.
 *
 * One rule for every provider: an `exhibitor_admin` session, bound to a company,
 * with web admin access to that company. Providers do not add their own
 * restrictions on top of this.
 */
export type IntegrationConnectionAdminContext = { userId: string; companyId: string };

export async function authorizeIntegrationConnectionAdmin(): Promise<
  | { ok: true; context: IntegrationConnectionAdminContext }
  | { ok: false; status: 401 | 403 | 400; error: string }
> {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser?.id) return { ok: false, status: 401, error: "Unauthorized" };
  if (normalizeSessionRole(sessionUser.role) !== "exhibitor_admin") {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  const companyId = String(sessionUser.company_id ?? "").trim();
  if (!companyId) return { ok: false, status: 400, error: "Missing exhibitor account." };
  if (!(await getUserHasExhibitorWebAdminAccess(sessionUser.id, companyId))) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, context: { userId: sessionUser.id, companyId } };
}
