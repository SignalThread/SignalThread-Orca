import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildPipedriveAuthorizationUrl } from "@/lib/integrations/pipedrive/oauth-client";
import {
  createPipedriveOAuthState,
  PIPEDRIVE_OAUTH_RETURN_TO
} from "@/lib/integrations/pipedrive/oauth-state";

export async function preparePipedriveOAuthLaunch(input: {
  userId: string;
  companyId: string;
  now?: Date;
}) {
  const created = createPipedriveOAuthState({ now: input.now });
  const authorizationUrl = buildPipedriveAuthorizationUrl({ state: created.state });
  const response = await (createAdminClient() as any).from("integration_oauth_states").insert({
    state_digest: created.stateDigest,
    provider: "pipedrive",
    user_id: input.userId,
    company_id: input.companyId,
    return_to: PIPEDRIVE_OAUTH_RETURN_TO,
    expires_at: created.expiresAt.toISOString()
  });
  if (response.error) throw new Error("Unable to start Pipedrive authorization.");
  return {
    authorizationUrl,
    expiresAt: created.expiresAt
  };
}
