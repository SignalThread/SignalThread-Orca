import {
  getMicrosoft365Capabilities,
  hasRequiredMicrosoft365IdentityScopes
} from "@/lib/integrations/microsoft/scopes";
import {
  deriveProviderConnectionHealth,
  successfulProviderConnectionActivationPatch,
  verifyPersistedProviderRefreshCredential,
  type ProviderConnectionLifecycleStatus,
  type ProviderRefreshCredentialState
} from "@/lib/integrations/oauth/connection-health-core";

export type Microsoft365ConnectionLifecycleStatus = ProviderConnectionLifecycleStatus;
export type Microsoft365RefreshCredentialState = ProviderRefreshCredentialState;

export function hasAllRequiredMicrosoft365Scopes(scopes: string[]) {
  return (
    hasRequiredMicrosoft365IdentityScopes(scopes) &&
    Object.values(getMicrosoft365Capabilities(scopes)).every(Boolean)
  );
}

export function successfulMicrosoft365ConnectionActivationPatch(now: string) {
  return successfulProviderConnectionActivationPatch(now);
}

export function verifyPersistedMicrosoft365RefreshCredential(input: {
  encryptedRefreshCredential: string | null | undefined;
  expectedRefreshCredential: string;
  decrypt: (encrypted: string) => string;
}) {
  return verifyPersistedProviderRefreshCredential(input);
}

export function deriveMicrosoft365ConnectionHealth(input: {
  persistedStatus: Microsoft365ConnectionLifecycleStatus;
  grantedScopes: string[];
  refreshCredentialState: Microsoft365RefreshCredentialState;
}) {
  return deriveProviderConnectionHealth({
    persistedStatus: input.persistedStatus,
    refreshCredentialState: input.refreshCredentialState,
    hasRequiredIdentityScopes: hasRequiredMicrosoft365IdentityScopes(input.grantedScopes),
    capabilities: (lifecycleConnected) =>
      getMicrosoft365Capabilities(lifecycleConnected ? input.grantedScopes : [])
  });
}
