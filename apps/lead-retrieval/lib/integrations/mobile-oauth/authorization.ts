import "server-only";

import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { resolveAccessibleEventIdsForUser } from "@/lib/server/company-event-access";
import { authorizeMobileIntegrationRequestWithDeps } from "@/lib/integrations/mobile-oauth/authorization-core";

export async function authorizeMobileIntegrationRequest(request: Request) {
  return authorizeMobileIntegrationRequestWithDeps(request, {
    resolveSession: (candidate) => resolveApiSession(candidate),
    resolveEventAccess: (userId) => resolveAccessibleEventIdsForUser({ userId })
  });
}
