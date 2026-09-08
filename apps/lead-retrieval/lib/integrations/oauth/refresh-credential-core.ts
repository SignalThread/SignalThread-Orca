/**
 * Provider-neutral refresh-credential policy shared by every integration OAuth
 * provider: when a new offline grant must be forced, how a replacement refresh
 * token is resolved against the stored one, and how credentials are shaped for
 * encrypted storage.
 */
export type ProviderStoredConnectionState =
  | "connected"
  | "reconnect_required"
  | "error"
  | "revocation_pending";

export type ProviderOAuthConsentAssessment = {
  requiresNewRefreshToken: boolean;
  reason:
    | "explicit_reconnect"
    | "missing_connection"
    | "unusable_connection_status"
    | "missing_refresh_credential"
    | "unreadable_refresh_credential"
    | "healthy_refresh_credential";
};

export function deriveProviderOAuthConsentAssessment(input: {
  explicitReconnect: boolean;
  connectionStatus: ProviderStoredConnectionState | null;
  storedRefreshCredentialExists: boolean;
  storedRefreshCredentialReadable: boolean;
}): ProviderOAuthConsentAssessment {
  if (!input.connectionStatus) {
    return { requiresNewRefreshToken: true, reason: "missing_connection" };
  }
  if (input.connectionStatus !== "connected") {
    return { requiresNewRefreshToken: true, reason: "unusable_connection_status" };
  }
  if (!input.storedRefreshCredentialExists) {
    return { requiresNewRefreshToken: true, reason: "missing_refresh_credential" };
  }
  if (!input.storedRefreshCredentialReadable) {
    return { requiresNewRefreshToken: true, reason: "unreadable_refresh_credential" };
  }
  // Explicit reconnect is additive only: the server-side connection and
  // credential checks above remain authoritative even when the client sends
  // reconnect=false or omits the hint entirely.
  if (input.explicitReconnect) {
    return { requiresNewRefreshToken: true, reason: "explicit_reconnect" };
  }
  return { requiresNewRefreshToken: false, reason: "healthy_refresh_credential" };
}

export class ProviderRefreshCredentialRequiredError extends Error {
  constructor(message = "The provider did not issue an offline refresh token.") {
    super(message);
    this.name = "ProviderRefreshCredentialRequiredError";
  }
}

export function resolveProviderRefreshCredential(input: {
  newRefreshToken?: string | null;
  existingRefreshCredentialEncrypted?: string | null;
  decryptExisting: (encrypted: string) => string;
  missingCredentialError?: () => Error;
}): { refreshToken: string; source: "new" | "existing" } {
  const newRefreshToken = String(input.newRefreshToken ?? "").trim();
  if (newRefreshToken) return { refreshToken: newRefreshToken, source: "new" };

  const encrypted = String(input.existingRefreshCredentialEncrypted ?? "").trim();
  if (encrypted) {
    const existingRefreshToken = String(input.decryptExisting(encrypted) ?? "").trim();
    if (existingRefreshToken) return { refreshToken: existingRefreshToken, source: "existing" };
  }
  throw (input.missingCredentialError ?? (() => new ProviderRefreshCredentialRequiredError()))();
}

export function buildEncryptedProviderCredentialRecord(input: {
  connectionId: string;
  accessToken: string;
  refreshToken: string;
  activeKeyId: string;
  encrypt: (plaintext: string, kind: "access_token" | "refresh_token") => string;
  missingCredentialError?: () => Error;
}) {
  if (!input.refreshToken) {
    throw (input.missingCredentialError ?? (() => new ProviderRefreshCredentialRequiredError()))();
  }
  return {
    connection_id: input.connectionId,
    access_token_encrypted: input.encrypt(input.accessToken, "access_token"),
    refresh_token_encrypted: input.encrypt(input.refreshToken, "refresh_token"),
    encryption_key_version: input.activeKeyId
  };
}
