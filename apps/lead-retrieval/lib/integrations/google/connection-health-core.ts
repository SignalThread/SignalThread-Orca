import { getGoogleWorkspaceCapabilities, hasRequiredGoogleIdentityScopes } from "@/lib/integrations/google/scopes";
import {
  deriveProviderConnectionHealth,
  successfulProviderConnectionActivationPatch,
  verifyPersistedProviderRefreshCredential,
  type ProviderConnectionLifecycleStatus,
  type ProviderRefreshCredentialState
} from "@/lib/integrations/oauth/connection-health-core";

export type GoogleConnectionLifecycleStatus = ProviderConnectionLifecycleStatus;
export type GoogleRefreshCredentialState = ProviderRefreshCredentialState;

export function hasAllRequiredGoogleWorkspaceScopes(scopes: string[]) {
  return (
    hasRequiredGoogleIdentityScopes(scopes) &&
    Object.values(getGoogleWorkspaceCapabilities(scopes)).every(Boolean)
  );
}

export function successfulGoogleConnectionActivationPatch(now: string) {
  return successfulProviderConnectionActivationPatch(now);
}

export function verifyPersistedGoogleRefreshCredential(input: {
  encryptedRefreshCredential: string | null | undefined;
  expectedRefreshCredential: string;
  decrypt: (encrypted: string) => string;
}) {
  return verifyPersistedProviderRefreshCredential(input);
}

export function deriveGoogleWorkspaceConnectionHealth(input: {
  persistedStatus: GoogleConnectionLifecycleStatus;
  grantedScopes: string[];
  refreshCredentialState: GoogleRefreshCredentialState;
}) {
  return deriveProviderConnectionHealth({
    persistedStatus: input.persistedStatus,
    refreshCredentialState: input.refreshCredentialState,
    hasRequiredIdentityScopes: hasRequiredGoogleIdentityScopes(input.grantedScopes),
    capabilities: (lifecycleConnected) =>
      getGoogleWorkspaceCapabilities(lifecycleConnected ? input.grantedScopes : [])
  });
}
