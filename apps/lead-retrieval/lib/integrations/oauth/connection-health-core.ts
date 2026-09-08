/**
 * Provider-neutral connection health derivation.
 *
 * A connection is only reported as healthy when its lifecycle status says
 * `connected` AND its stored refresh credential is readable. Anything else
 * degrades to `reconnect_required` rather than surfacing as a usable
 * connection or as a generic failure.
 */
export type ProviderConnectionLifecycleStatus =
  | "connected"
  | "reconnect_required"
  | "error"
  | "revocation_pending";

export type ProviderRefreshCredentialState = "usable" | "missing" | "unreadable";

export function successfulProviderConnectionActivationPatch(now: string) {
  return {
    status: "connected" as const,
    connected_at: now,
    last_refresh_at: null,
    last_refresh_attempt_at: null,
    last_error_at: null,
    last_error_code: null,
    refresh_lease_token: null,
    refresh_lease_until: null
  };
}

export function verifyPersistedProviderRefreshCredential(input: {
  encryptedRefreshCredential: string | null | undefined;
  expectedRefreshCredential: string;
  decrypt: (encrypted: string) => string;
}) {
  if (!input.encryptedRefreshCredential) return false;
  try {
    const persisted = input.decrypt(input.encryptedRefreshCredential).trim();
    return persisted.length > 0 && persisted === input.expectedRefreshCredential.trim();
  } catch {
    return false;
  }
}

export function deriveProviderConnectionHealth<Capabilities extends Record<string, boolean>>(input: {
  persistedStatus: ProviderConnectionLifecycleStatus;
  refreshCredentialState: ProviderRefreshCredentialState;
  hasRequiredIdentityScopes: boolean;
  /** Called with `false` when the connection is unusable, so capabilities collapse to none. */
  capabilities: (lifecycleConnected: boolean) => Capabilities;
}) {
  const credentialUsable = input.refreshCredentialState === "usable";
  const lifecycleConnected = input.persistedStatus === "connected" && credentialUsable;
  const effectiveStatus =
    input.persistedStatus === "connected" && !credentialUsable
      ? ("reconnect_required" as const)
      : input.persistedStatus;
  const capabilities = input.capabilities(lifecycleConnected);
  return {
    status: effectiveStatus,
    connected: lifecycleConnected && input.hasRequiredIdentityScopes,
    capabilities,
    isPartialGrant:
      lifecycleConnected &&
      (!input.hasRequiredIdentityScopes || Object.values(capabilities).some((value) => !value)),
    credentialUsable,
    safeErrorCode:
      input.refreshCredentialState === "missing"
        ? "credential_missing"
        : input.refreshCredentialState === "unreadable"
          ? "credential_decryption_failed"
          : null
  };
}
