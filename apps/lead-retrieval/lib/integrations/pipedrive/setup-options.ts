import "server-only";

import { getValidPipedriveAccessToken } from "@/lib/integrations/pipedrive/token-manager";
import {
  listPipedriveSetupOptionsWithToken,
  type PipedriveSetupOptions
} from "@/lib/integrations/pipedrive/setup-options-core";

export { listPipedriveSetupOptionsWithToken };

export async function listPipedriveSetupOptions(companyId: string): Promise<PipedriveSetupOptions> {
  const token = await getValidPipedriveAccessToken(companyId);
  if (!token.ok) throw new Error("Pipedrive connection needs to be reconnected.");
  return listPipedriveSetupOptionsWithToken({
    accessToken: token.accessToken,
    apiDomain: token.apiDomain
  });
}
