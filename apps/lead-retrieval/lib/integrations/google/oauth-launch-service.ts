import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildGoogleAuthorizationUrl } from "@/lib/integrations/google/oauth-client";
import {
  createGoogleOAuthState,
  createGooglePkcePair,
  digestGoogleOAuthValue,
  type GoogleOAuthChannel
} from "@/lib/integrations/google/oauth-state";
import { logMobileOAuthLaunchPostgrestError } from "@/lib/integrations/mobile-oauth/launch-diagnostics";
import { decryptSecret, getIntegrationSecretKeyring } from "@/lib/security/encrypted-secret";
import {
  deriveGoogleOAuthConsentAssessment,
  type GoogleStoredConnectionState
} from "@/lib/integrations/google/oauth-refresh-credential-core";

export async function assessGoogleOAuthConsentRequirement(input: {
  userId: string;
  companyId: string;
  explicitReconnect?: boolean;
}) {
  const supabase = createAdminClient();
  const connectionResponse = await supabase
    .from("google_workspace_connections")
    .select("id, status")
    .eq("user_id", input.userId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (connectionResponse.error) throw new Error("Unable to inspect the Google Workspace connection.");

  const connection = connectionResponse.data;
  if (!connection) {
    return deriveGoogleOAuthConsentAssessment({
      explicitReconnect: input.explicitReconnect === true,
      connectionStatus: null,
      storedRefreshCredentialExists: false,
      storedRefreshCredentialReadable: false
    });
  }

  const secretResponse = await supabase
    .from("google_workspace_connection_secrets")
    .select("refresh_token_encrypted")
    .eq("connection_id", connection.id)
    .maybeSingle();
  if (secretResponse.error) throw new Error("Unable to inspect the Google refresh credential.");

  const encryptedRefreshToken = secretResponse.data?.refresh_token_encrypted ?? null;
  let storedRefreshCredentialReadable = false;
  if (encryptedRefreshToken) {
    try {
      storedRefreshCredentialReadable = Boolean(
        decryptSecret(
          encryptedRefreshToken,
          `google_workspace:${connection.id}:refresh_token`,
          getIntegrationSecretKeyring()
        ).trim()
      );
    } catch {
      storedRefreshCredentialReadable = false;
    }
  }
  return deriveGoogleOAuthConsentAssessment({
    explicitReconnect: input.explicitReconnect === true,
    connectionStatus: connection.status as GoogleStoredConnectionState,
    storedRefreshCredentialExists: Boolean(encryptedRefreshToken),
    storedRefreshCredentialReadable
  });
}

export async function prepareGoogleOAuthLaunch(input: {
  userId: string;
  companyId: string;
  returnTo?: string | null;
  channel?: GoogleOAuthChannel;
  correlation?: string;
  forceConsent?: boolean;
}) {
  const consent = await assessGoogleOAuthConsentRequirement({
    userId: input.userId,
    companyId: input.companyId,
    explicitReconnect: input.forceConsent
  });
  const { payload, state } = createGoogleOAuthState(input);
  const pkce = createGooglePkcePair();
  const response = await createAdminClient().from("google_oauth_state_nonces").insert({
    jti_digest: digestGoogleOAuthValue(payload.jti),
    user_id: payload.userId,
    company_id: payload.companyId,
    code_verifier_digest: digestGoogleOAuthValue(pkce.verifier),
    return_to: payload.returnTo,
    expires_at: new Date(payload.exp * 1000).toISOString()
  });
  if (response.error) {
    if (input.channel === "mobile") {
      logMobileOAuthLaunchPostgrestError({
        stage: "google_state_nonce_persistence",
        error: response.error,
        httpStatus: response.status,
        ticketRowMatched: true,
        atomicConsumptionSucceeded: true,
        bindingValidationSucceeded: true
      });
    }
    throw new Error("Unable to start Google authorization.");
  }

  return {
    authorizationUrl: buildGoogleAuthorizationUrl({
      state,
      codeChallenge: pkce.challenge,
      forceConsent: consent.requiresNewRefreshToken
    }),
    codeVerifier: pkce.verifier,
    maxAge: payload.exp - payload.iat
  };
}
