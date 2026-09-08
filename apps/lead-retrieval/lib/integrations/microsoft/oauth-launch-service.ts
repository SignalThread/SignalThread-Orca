import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildMicrosoftAuthorizationUrl } from "@/lib/integrations/microsoft/oauth-client";
import {
  createMicrosoftOAuthState,
  createMicrosoftPkcePair,
  digestMicrosoftOAuthValue,
  type MicrosoftOAuthChannel
} from "@/lib/integrations/microsoft/oauth-state";
import { logMobileOAuthLaunchPostgrestError } from "@/lib/integrations/mobile-oauth/launch-diagnostics";
import { decryptSecret, getIntegrationSecretKeyring } from "@/lib/security/encrypted-secret";
import {
  deriveProviderOAuthConsentAssessment,
  type ProviderStoredConnectionState
} from "@/lib/integrations/oauth/refresh-credential-core";
import { microsoftSecretContext } from "@/lib/integrations/microsoft/secret-context";

export async function assessMicrosoftOAuthConsentRequirement(input: {
  userId: string;
  companyId: string;
  explicitReconnect?: boolean;
}) {
  const supabase = createAdminClient();
  const connectionResponse = await supabase
    .from("microsoft_365_connections")
    .select("id, status")
    .eq("user_id", input.userId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (connectionResponse.error) throw new Error("Unable to inspect the Microsoft 365 connection.");

  const connection = connectionResponse.data;
  if (!connection) {
    return deriveProviderOAuthConsentAssessment({
      explicitReconnect: input.explicitReconnect === true,
      connectionStatus: null,
      storedRefreshCredentialExists: false,
      storedRefreshCredentialReadable: false
    });
  }

  const secretResponse = await supabase
    .from("microsoft_365_connection_secrets")
    .select("refresh_token_encrypted")
    .eq("connection_id", connection.id)
    .maybeSingle();
  if (secretResponse.error) throw new Error("Unable to inspect the Microsoft refresh credential.");

  const encryptedRefreshToken = secretResponse.data?.refresh_token_encrypted ?? null;
  let storedRefreshCredentialReadable = false;
  if (encryptedRefreshToken) {
    try {
      storedRefreshCredentialReadable = Boolean(
        decryptSecret(
          encryptedRefreshToken,
          microsoftSecretContext(connection.id, "refresh_token"),
          getIntegrationSecretKeyring()
        ).trim()
      );
    } catch {
      storedRefreshCredentialReadable = false;
    }
  }
  return deriveProviderOAuthConsentAssessment({
    explicitReconnect: input.explicitReconnect === true,
    connectionStatus: connection.status as ProviderStoredConnectionState,
    storedRefreshCredentialExists: Boolean(encryptedRefreshToken),
    storedRefreshCredentialReadable
  });
}

export async function prepareMicrosoftOAuthLaunch(input: {
  userId: string;
  companyId: string;
  returnTo?: string | null;
  channel?: MicrosoftOAuthChannel;
  correlation?: string;
  forceConsent?: boolean;
}) {
  const consent = await assessMicrosoftOAuthConsentRequirement({
    userId: input.userId,
    companyId: input.companyId,
    explicitReconnect: input.forceConsent
  });
  const { payload, state } = createMicrosoftOAuthState(input);
  const pkce = createMicrosoftPkcePair();
  const response = await createAdminClient().from("microsoft_oauth_state_nonces").insert({
    jti_digest: digestMicrosoftOAuthValue(payload.jti),
    user_id: payload.userId,
    company_id: payload.companyId,
    code_verifier_digest: digestMicrosoftOAuthValue(pkce.verifier),
    return_to: payload.returnTo,
    expires_at: new Date(payload.exp * 1000).toISOString()
  });
  if (response.error) {
    if (input.channel === "mobile") {
      logMobileOAuthLaunchPostgrestError({
        stage: "microsoft_state_nonce_persistence",
        error: response.error,
        httpStatus: response.status,
        ticketRowMatched: true,
        atomicConsumptionSucceeded: true,
        bindingValidationSucceeded: true
      });
    }
    throw new Error("Unable to start Microsoft authorization.");
  }

  return {
    authorizationUrl: buildMicrosoftAuthorizationUrl({
      state,
      codeChallenge: pkce.challenge,
      forceConsent: consent.requiresNewRefreshToken
    }),
    codeVerifier: pkce.verifier,
    maxAge: payload.exp - payload.iat
  };
}
