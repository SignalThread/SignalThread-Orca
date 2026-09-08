import "server-only";

import {
  getCurrentSessionUser,
  type AppServerSupabaseClient
} from "@/lib/auth/session";
import { resolveCompanyIntegrationAuthorization } from "@/lib/integrations/company-integration-authorization-core";
import { getUserHasExhibitorWebAdminAccess } from "@/lib/server/exhibitor-permission-aggregates";

export async function authorizeCompanyIntegrationAdmin(options?: {
  supabase?: AppServerSupabaseClient;
}) {
  const sessionUser = await getCurrentSessionUser(options?.supabase);
  const companyId = String(sessionUser?.company_id ?? "").trim();
  const hasExhibitorWebAdminAccess =
    sessionUser?.role === "exhibitor_admin" && companyId
      ? await getUserHasExhibitorWebAdminAccess(sessionUser.id, companyId)
      : false;

  return resolveCompanyIntegrationAuthorization({
    userId: sessionUser?.id ?? null,
    role: sessionUser?.role ?? null,
    companyId: companyId || null,
    activeCompanyId: sessionUser?.active_company_id ?? null,
    hasExhibitorWebAdminAccess
  });
}
