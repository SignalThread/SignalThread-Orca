import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The service-role client is injectable so the connection lifecycle can be
 * exercised deterministically in tests against an in-memory table set.
 */
type MicrosoftConnectionClient = ReturnType<typeof createAdminClient>;
import { decryptSecret, encryptSecret, getIntegrationSecretKeyring } from "@/lib/security/encrypted-secret";
import { digestMicrosoftOAuthValue } from "@/lib/integrations/microsoft/oauth-state";
import type { MicrosoftIdentity } from "@/lib/integrations/microsoft/oauth-client";
import { microsoftSecretContext } from "@/lib/integrations/microsoft/secret-context";
import { disconnectProviderConnectionWithDeps } from "@/lib/integrations/oauth/disconnect-core";
import {
  emitMicrosoftOAuthCallbackDiagnostic,
  type MicrosoftOAuthCallbackProgress
} from "@/lib/integrations/microsoft/oauth-callback-diagnostics";
import {
  buildEncryptedProviderCredentialRecord,
  ProviderRefreshCredentialRequiredError,
  resolveProviderRefreshCredential
} from "@/lib/integrations/oauth/refresh-credential-core";
import {
  hasAllRequiredMicrosoft365Scopes,
  successfulMicrosoft365ConnectionActivationPatch,
  verifyPersistedMicrosoft365RefreshCredential
} from "@/lib/integrations/microsoft/connection-health-core";
import { emitMicrosoft365ConnectionDiagnostic } from "@/lib/integrations/microsoft/connection-diagnostics";

const CALLBACK_VALIDATED_PROGRESS: MicrosoftOAuthCallbackProgress = {
  state_validation_succeeded: true,
  nonce_validation_succeeded: true,
  pkce_validation_succeeded: true,
  token_exchange_succeeded: true,
  token_response_validation_succeeded: true,
  subject_account_binding_succeeded: true,
  encryption_succeeded: null,
  persistence_succeeded: null
};

export class MicrosoftRefreshCredentialRequiredError extends ProviderRefreshCredentialRequiredError {
  constructor() {
    super("Microsoft did not issue an offline refresh token.");
    this.name = "MicrosoftRefreshCredentialRequiredError";
  }
}

export async function consumeMicrosoftOAuthNonce(input: {
  jti: string;
  userId: string;
  companyId: string;
  codeVerifier: string;
  now?: Date;
  supabase?: MicrosoftConnectionClient;
}) {
  const supabase = input.supabase ?? createAdminClient();
  const consumedAt = (input.now ?? new Date()).toISOString();
  const response = await supabase
    .from("microsoft_oauth_state_nonces")
    .update({ consumed_at: consumedAt })
    .eq("jti_digest", digestMicrosoftOAuthValue(input.jti))
    .eq("user_id", input.userId)
    .eq("company_id", input.companyId)
    .eq("code_verifier_digest", digestMicrosoftOAuthValue(input.codeVerifier))
    .is("consumed_at", null)
    .gt("expires_at", consumedAt)
    .select("return_to")
    .maybeSingle();
  const nonceProgress = {
    state_validation_succeeded: true,
    pkce_validation_succeeded: true,
    nonce_validation_succeeded: false
  };
  if (response.error) {
    emitMicrosoftOAuthCallbackDiagnostic({
      level: "error",
      stage: "nonce_lookup_and_consumption",
      safeErrorCategory: "persistence_failed",
      providerHttpStatus: response.status,
      providerCode: response.error.code,
      message: response.error,
      progress: nonceProgress
    });
    return null;
  }
  if (!response.data) {
    emitMicrosoftOAuthCallbackDiagnostic({
      level: "warn",
      stage: "nonce_lookup_and_consumption",
      safeErrorCategory: "nonce_unavailable",
      providerHttpStatus: response.status,
      message: "No matching unconsumed, unexpired OAuth nonce row was found.",
      progress: nonceProgress
    });
    return null;
  }
  emitMicrosoftOAuthCallbackDiagnostic({
    level: "info",
    stage: "nonce_atomic_consumption",
    safeErrorCategory: "none",
    providerHttpStatus: response.status,
    progress: { ...nonceProgress, nonce_validation_succeeded: true }
  });
  return response.data.return_to;
}

export async function saveMicrosoft365Connection(input: {
  userId: string;
  companyId: string;
  identity: MicrosoftIdentity;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scopes: string[];
  tokenType?: string;
  supabase?: MicrosoftConnectionClient;
}) {
  // The callback has already verified the account against Microsoft Graph. The
  // token response's scope field is the authoritative capability grant and may
  // legitimately be partial; persist that state so the UI can require
  // re-consent instead of inventing requested permissions.
  if (!input.accessToken) throw new Error("Microsoft did not return an access token.");
  const supabase = input.supabase ?? createAdminClient();
  const existingConnectionResponse = await supabase
    .from("microsoft_365_connections")
    .select("id")
    .eq("user_id", input.userId)
    .maybeSingle();
  const { data: existing, error: existingError } = existingConnectionResponse;
  if (existingError) {
    emitMicrosoftOAuthCallbackDiagnostic({
      level: "error",
      stage: "microsoft_subject_account_binding",
      safeErrorCategory: "persistence_failed",
      providerHttpStatus: existingConnectionResponse.status,
      providerCode: existingError.code,
      message: existingError,
      progress: CALLBACK_VALIDATED_PROGRESS
    });
    throw new Error("Unable to inspect the existing Microsoft connection.");
  }

  const connectionId = existing?.id ?? randomUUID();
  let existingRefreshCredentialEncrypted: string | null = null;
  if (!input.refreshToken && existing?.id) {
    const existingSecretResponse = await supabase
      .from("microsoft_365_connection_secrets")
      .select("refresh_token_encrypted")
      .eq("connection_id", existing.id)
      .maybeSingle();
    if (existingSecretResponse.error) {
      emitMicrosoftOAuthCallbackDiagnostic({
        level: "error",
        stage: "credential_refresh_resolution",
        safeErrorCategory: "persistence_failed",
        providerHttpStatus: existingSecretResponse.status,
        providerCode: existingSecretResponse.error.code,
        message: existingSecretResponse.error,
        progress: {
          ...CALLBACK_VALIDATED_PROGRESS,
          encryption_succeeded: false,
          persistence_succeeded: false
        }
      });
      throw new Error("Unable to load the existing Microsoft refresh credential.");
    }
    existingRefreshCredentialEncrypted = existingSecretResponse.data?.refresh_token_encrypted ?? null;
  }
  let refreshToken: string;
  try {
    refreshToken = resolveProviderRefreshCredential({
      newRefreshToken: input.refreshToken,
      existingRefreshCredentialEncrypted,
      decryptExisting: (encrypted) =>
        decryptSecret(encrypted, microsoftSecretContext(connectionId, "refresh_token")),
      missingCredentialError: () => new MicrosoftRefreshCredentialRequiredError()
    }).refreshToken;
  } catch (error) {
    const missingRefreshToken = error instanceof ProviderRefreshCredentialRequiredError;
    emitMicrosoftOAuthCallbackDiagnostic({
      level: "error",
      stage: "credential_refresh_resolution",
      safeErrorCategory: missingRefreshToken ? "missing_refresh_token" : "encryption_failed",
      message: missingRefreshToken
        ? "Microsoft did not issue an offline refresh token and no existing credential was available."
        : error,
      progress: {
        ...CALLBACK_VALIDATED_PROGRESS,
        encryption_succeeded: false,
        persistence_succeeded: false
      }
    });
    throw error;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(60, input.expiresIn ?? 3600) * 1000).toISOString();
  const connectionResponse = await supabase.from("microsoft_365_connections").upsert(
    {
      id: connectionId,
      user_id: input.userId,
      company_id: input.companyId,
      microsoft_subject: input.identity.subject,
      microsoft_email: input.identity.email,
      microsoft_display_name: input.identity.displayName,
      granted_scopes: input.scopes,
      token_type: input.tokenType ?? null,
      token_expires_at: expiresAt,
      // Do not expose the connection as healthy before its encrypted refresh
      // credential has been persisted, read back, and authenticated.
      status: "error",
      connected_at: now.toISOString(),
      last_error_at: now.toISOString(),
      last_error_code: "credential_persistence_pending",
      refresh_lease_token: null,
      refresh_lease_until: null
    },
    { onConflict: "user_id" }
  );
  const connectionError = connectionResponse.error;
  if (connectionError) {
    emitMicrosoftOAuthCallbackDiagnostic({
      level: "error",
      stage: "connection_metadata_persistence",
      safeErrorCategory: connectionError.code === "23505" ? "account_binding_conflict" : "persistence_failed",
      providerHttpStatus: connectionResponse.status,
      providerCode: connectionError.code,
      message:
        connectionError.code === "23505"
          ? "The Microsoft subject is already bound to another SignalThread user."
          : connectionError,
      progress: {
        ...CALLBACK_VALIDATED_PROGRESS,
        encryption_succeeded: false,
        persistence_succeeded: false,
        subject_account_binding_succeeded: connectionError.code !== "23505"
      }
    });
    throw new Error(
      connectionError.code === "23505"
        ? "That Microsoft account is already connected to another SignalThread user."
        : "Unable to save the Microsoft 365 connection."
    );
  }

  let encryptedCredentialRecord: ReturnType<typeof buildEncryptedProviderCredentialRecord>;
  try {
    const keyring = getIntegrationSecretKeyring();
    encryptedCredentialRecord = buildEncryptedProviderCredentialRecord({
      connectionId,
      accessToken: input.accessToken,
      refreshToken,
      activeKeyId: keyring.activeKeyId,
      encrypt: (plaintext, kind) =>
        encryptSecret(plaintext, microsoftSecretContext(connectionId, kind), keyring),
      missingCredentialError: () => new MicrosoftRefreshCredentialRequiredError()
    });
    emitMicrosoftOAuthCallbackDiagnostic({
      level: "info",
      stage: "credential_encryption",
      safeErrorCategory: "none",
      progress: { ...CALLBACK_VALIDATED_PROGRESS, encryption_succeeded: true }
    });
  } catch (error) {
    emitMicrosoftOAuthCallbackDiagnostic({
      level: "error",
      stage: "credential_encryption",
      safeErrorCategory: "encryption_configuration",
      message: error,
      progress: {
        ...CALLBACK_VALIDATED_PROGRESS,
        encryption_succeeded: false,
        persistence_succeeded: false
      }
    });
    throw error;
  }
  const secretResponse = await supabase
    .from("microsoft_365_connection_secrets")
    .upsert(encryptedCredentialRecord)
    .select("connection_id, refresh_token_encrypted, encryption_key_version")
    .single();
  const secretError = secretResponse.error;
  if (secretError) {
    await supabase
      .from("microsoft_365_connections")
      .update({ status: "error", last_error_at: now.toISOString(), last_error_code: "secret_persist_failed" })
      .eq("id", connectionId);
    emitMicrosoftOAuthCallbackDiagnostic({
      level: "error",
      stage: "connection_secret_persistence",
      safeErrorCategory: "persistence_failed",
      providerHttpStatus: secretResponse.status,
      providerCode: secretError.code,
      message: secretError,
      progress: {
        ...CALLBACK_VALIDATED_PROGRESS,
        encryption_succeeded: true,
        persistence_succeeded: false
      }
    });
    throw new Error("Unable to secure the Microsoft 365 credentials.");
  }

  const keyring = getIntegrationSecretKeyring();
  const refreshCredentialVerified =
    secretResponse.data?.connection_id === connectionId &&
    secretResponse.data.encryption_key_version === keyring.activeKeyId &&
    verifyPersistedMicrosoft365RefreshCredential({
      encryptedRefreshCredential: secretResponse.data.refresh_token_encrypted,
      expectedRefreshCredential: refreshToken,
      decrypt: (encrypted) =>
        decryptSecret(encrypted, microsoftSecretContext(connectionId, "refresh_token"), keyring)
    });
  if (!refreshCredentialVerified) {
    await supabase
      .from("microsoft_365_connections")
      .update({
        status: "reconnect_required",
        last_error_at: now.toISOString(),
        last_error_code: "credential_verification_failed",
        refresh_lease_token: null,
        refresh_lease_until: null
      })
      .eq("id", connectionId)
      .eq("user_id", input.userId)
      .eq("company_id", input.companyId);
    emitMicrosoft365ConnectionDiagnostic({
      level: "error",
      diagnostic: {
        stage: "oauth_persistence_verification",
        safe_error_category: "credential_unreadable",
        connection_row_matched: true,
        refresh_credential_present: Boolean(secretResponse.data?.refresh_token_encrypted),
        refresh_credential_decryptable: false,
        persisted_status: "reconnect_required",
        effective_status: "reconnect_required",
        required_scopes_granted: hasAllRequiredMicrosoft365Scopes(input.scopes)
      }
    });
    throw new Error("Unable to verify the secured Microsoft 365 credentials.");
  }

  const activationResponse = await supabase
    .from("microsoft_365_connections")
    .update(successfulMicrosoft365ConnectionActivationPatch(now.toISOString()))
    .eq("id", connectionId)
    .eq("user_id", input.userId)
    .eq("company_id", input.companyId)
    .select(
      "status, last_refresh_at, last_refresh_attempt_at, last_error_at, last_error_code, refresh_lease_token, refresh_lease_until"
    )
    .maybeSingle();
  const activationVerified =
    activationResponse.data?.status === "connected" &&
    activationResponse.data.last_refresh_at === null &&
    activationResponse.data.last_refresh_attempt_at === null &&
    activationResponse.data.last_error_at === null &&
    activationResponse.data.last_error_code === null &&
    activationResponse.data.refresh_lease_token === null &&
    activationResponse.data.refresh_lease_until === null;
  if (activationResponse.error || !activationVerified) {
    await supabase
      .from("microsoft_365_connections")
      .update({
        status: "error",
        last_error_at: now.toISOString(),
        last_error_code: "connection_activation_failed",
        refresh_lease_token: null,
        refresh_lease_until: null
      })
      .eq("id", connectionId)
      .eq("user_id", input.userId)
      .eq("company_id", input.companyId);
    emitMicrosoft365ConnectionDiagnostic({
      level: "error",
      diagnostic: {
        stage: "oauth_persistence_verification",
        safe_error_category: "persistence_failed",
        connection_row_matched: false,
        refresh_credential_present: true,
        refresh_credential_decryptable: true,
        persisted_status: null,
        effective_status: "error",
        required_scopes_granted: hasAllRequiredMicrosoft365Scopes(input.scopes)
      }
    });
    throw new Error("Unable to activate the Microsoft 365 connection.");
  }
  emitMicrosoft365ConnectionDiagnostic({
    level: "info",
    diagnostic: {
      stage: "oauth_persistence_verification",
      safe_error_category: "none",
      connection_row_matched: true,
      refresh_credential_present: true,
      refresh_credential_decryptable: true,
      persisted_status: activationResponse.data!.status,
      effective_status: "connected",
      required_scopes_granted: hasAllRequiredMicrosoft365Scopes(input.scopes)
    }
  });
  emitMicrosoftOAuthCallbackDiagnostic({
    level: "info",
    stage: "connection_persistence",
    safeErrorCategory: "none",
    providerHttpStatus: secretResponse.status,
    progress: {
      ...CALLBACK_VALIDATED_PROGRESS,
      encryption_succeeded: true,
      persistence_succeeded: true
    }
  });
  return connectionId;
}

export async function disconnectMicrosoft365Connection(input: {
  userId: string;
  companyId: string;
  supabase?: MicrosoftConnectionClient;
}) {
  const supabase = input.supabase ?? createAdminClient();
  return disconnectProviderConnectionWithDeps({
    loadConnection: async () => {
      const { data: connection, error } = await supabase
        .from("microsoft_365_connections")
        .select("id")
        .eq("user_id", input.userId)
        .eq("company_id", input.companyId)
        .maybeSingle();
      if (error) throw new Error("Unable to load the Microsoft 365 connection.");
      if (!connection) return null;
      return { connectionId: connection.id, refreshToken: null };
    },
    // Microsoft identity platform exposes no delegated-token revocation
    // endpoint for a single application, so removing the local connection and
    // its encrypted credentials is the complete disconnect. Nothing is left
    // pending for a retry; consent is withdrawn from the Microsoft account
    // portal if the user wants the app entry removed there too.
    revokeToken: null,
    deleteConnection: async (connectionId) => {
      const { error } = await supabase
        .from("microsoft_365_connections")
        .delete()
        .eq("id", connectionId)
        .eq("user_id", input.userId)
        .eq("company_id", input.companyId);
      if (error) throw new Error("Unable to remove the local Microsoft 365 connection.");
    }
  });
}
