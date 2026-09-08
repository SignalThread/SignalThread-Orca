/**
 * Google Workspace binding for the shared integration disconnect core.
 */
import {
  disconnectProviderConnectionWithDeps,
  type ProviderDisconnectDeps
} from "@/lib/integrations/oauth/disconnect-core";

export type GoogleDisconnectDeps = ProviderDisconnectDeps & {
  revokeToken: (refreshToken: string) => Promise<{ ok: boolean }>;
};

export function disconnectGoogleWorkspaceWithDeps(deps: GoogleDisconnectDeps) {
  return disconnectProviderConnectionWithDeps(deps);
}
