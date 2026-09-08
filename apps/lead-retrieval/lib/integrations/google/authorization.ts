import "server-only";

import {
  authorizeIntegrationConnectionAdmin,
  type IntegrationConnectionAdminContext
} from "@/lib/integrations/oauth/authorization";

export type GoogleWorkspaceAdminContext = IntegrationConnectionAdminContext;

export async function authorizeGoogleWorkspaceAdmin() {
  return authorizeIntegrationConnectionAdmin();
}
