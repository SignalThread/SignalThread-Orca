/**
 * Google Workspace binding for the shared refresh-credential policy core.
 */
import {
  buildEncryptedProviderCredentialRecord,
  deriveProviderOAuthConsentAssessment,
  resolveProviderRefreshCredential,
  type ProviderOAuthConsentAssessment,
  type ProviderStoredConnectionState
} from "@/lib/integrations/oauth/refresh-credential-core";

export type GoogleStoredConnectionState = ProviderStoredConnectionState;
export type GoogleOAuthConsentAssessment = ProviderOAuthConsentAssessment;

export function getGoogleOAuthAuthorizationAccessParameters(requiresNewRefreshToken: boolean) {
  return {
    accessType: "offline" as const,
    prompt: requiresNewRefreshToken ? "consent select_account" : "select_account"
  };
}

export function deriveGoogleOAuthConsentAssessment(input: {
  explicitReconnect: boolean;
  connectionStatus: GoogleStoredConnectionState | null;
  storedRefreshCredentialExists: boolean;
  storedRefreshCredentialReadable: boolean;
}): GoogleOAuthConsentAssessment {
  return deriveProviderOAuthConsentAssessment(input);
}

export class GoogleRefreshCredentialRequiredError extends Error {
  constructor() {
    super("Google did not issue an offline refresh token.");
    this.name = "GoogleRefreshCredentialRequiredError";
  }
}

export function resolveGoogleRefreshCredential(input: {
  newRefreshToken?: string | null;
  existingRefreshCredentialEncrypted?: string | null;
  decryptExisting: (encrypted: string) => string;
}): { refreshToken: string; source: "new" | "existing" } {
  return resolveProviderRefreshCredential({
    ...input,
    missingCredentialError: () => new GoogleRefreshCredentialRequiredError()
  });
}

export function buildEncryptedGoogleCredentialRecord(input: {
  connectionId: string;
  accessToken: string;
  refreshToken: string;
  activeKeyId: string;
  encrypt: (plaintext: string, kind: "access_token" | "refresh_token") => string;
}) {
  return buildEncryptedProviderCredentialRecord({
    ...input,
    missingCredentialError: () => new GoogleRefreshCredentialRequiredError()
  });
}
