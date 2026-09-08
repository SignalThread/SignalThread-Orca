import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, getIntegrationSecretKeyring } from "@/lib/security/encrypted-secret";
import { digestGoogleOAuthValue } from "@/lib/integrations/google/oauth-state";
import { revokeGoogleToken, type GoogleIdentity } from "@/lib/integrations/google/oauth-client";
import { disconnectGoogleWorkspaceWithDeps } from "@/lib/integrations/google/disconnect-core";
import {
  emitGoogleOAuthCallbackDiagnostic,
  type GoogleOAuthCallbackProgress
} from "@/lib/integrations/google/oauth-callback-diagnostics";
import {
  buildEncryptedGoogleCredentialRecord,
  GoogleRefreshCredentialRequiredError,
  resolveGoogleRefreshCredential
} from "@/lib/integrations/google/oauth-refresh-credential-core";
import {
  hasAllRequiredGoogleWorkspaceScopes,
  successfulGoogleConnectionActivationPatch,
  verifyPersistedGoogleRefreshCredential
} from "@/lib/integrations/google/connection-health-core";
import { emitGoogleConnectionDiagnostic } from "@/lib/integrations/google/connection-diagnostics";

const CALLBACK_VALIDATED_PROGRESS: GoogleOAuthCallbackProgress = {
  state_validation_succeeded: true,
  nonce_validation_succeeded: true,
  pkce_validation_succeeded: true,
  token_exchange_succeeded: true,
  token_response_validation_succeeded: true,
  subject_account_binding_succeeded: true,
  encryption_succeeded: null,
  persistence_succeeded: null
};

function secretContext(connectionId: string, kind: "access_token" | "refresh_token") {
  return `google_workspace:${connectionId}:${kind}`;
}

export async function consumeGoogleOAuthNonce(input: {
  jti: string;
  userId: string;
  companyId: string;
  codeVerifier: string;
  now?: Date;
}) {
  const supabase = createAdminClient();
  const consumedAt = (input.now ?? new Date()).toISOString();
  const response = await supabase
    .from("google_oauth_state_nonces")
    .update({ consumed_at: consumedAt })
    .eq("jti_digest", digestGoogleOAuthValue(input.jti))
    .eq("user_id", input.userId)
    .eq("company_id", input.companyId)
    .eq("code_verifier_digest", digestGoogleOAuthValue(input.codeVerifier))
    .is("consumed_at", null)
    .gt("expires_at", consumedAt)
    .select("return_to")
    .maybeSingle();
  if (response.error) {
    emitGoogleOAuthCallbackDiagnostic({
      level: "error",
      stage: "nonce_lookup_and_consumption",
      safeErrorCategory: "persistence_failed",
      providerHttpStatus: response.status,
      providerCode: response.error.code,
      message: response.error,
      progress: {
        state_validation_succeeded: true,
        pkce_validation_succeeded: true,
        nonce_validation_succeeded: false
      }
    });
    return null;
  }
  if (!response.data) {
    emitGoogleOAuthCallbackDiagnostic({
      level: "warn",
      stage: "nonce_lookup_and_consumption",
      safeErrorCategory: "nonce_unavailable",
      providerHttpStatus: response.status,
      message: "No matching unconsumed, unexpired OAuth nonce row was found.",
      progress: {
        state_validation_succeeded: true,
        pkce_validation_succeeded: true,
        nonce_validation_succeeded: false
      }
    });
    return null;
  }
  emitGoogleOAuthCallbackDiagnostic({
    level: "info",
    stage: "nonce_atomic_consumption",
    safeErrorCategory: "none",
    providerHttpStatus: response.status,
    progress: {
      state_validation_succeeded: true,
      pkce_validation_succeeded: true,
      nonce_validation_succeeded: true
    }
  });
  return response.data.return_to;
}

export async function saveGoogleWorkspaceConnection(input: {
  userId: string;
  companyId: string;
  identity: GoogleIdentity;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scopes: string[];
  tokenType?: string;
}) {
  // The callback has already verified the OIDC ID token. The token response's
  // scope field is used solely as the authoritative capability grant and may
  // legitimately be empty/partial; persist that state so the UI can require
  // re-consent instead of inventing requested permissions.
  if (!input.accessToken) throw new Error("Google did not return an access token.");
  const supabase = createAdminClient();
  const existingConnectionResponse = await supabase
    .from("google_workspace_connections")
    .select("id")
    .eq("user_id", input.userId)
    .maybeSingle();
  const { data: existing, error: existingError } = existingConnectionResponse;
  if (existingError) {
    emitGoogleOAuthCallbackDiagnostic({
      level: "error",
      stage: "google_subject_account_binding",
      safeErrorCategory: "persistence_failed",
      providerHttpStatus: existingConnectionResponse.status,
      providerCode: existingError.code,
      message: existingError,
      progress: CALLBACK_VALIDATED_PROGRESS
    });
    throw new Error("Unable to inspect the existing Google connection.");
  }

  const connectionId = existing?.id ?? randomUUID();
  let existingRefreshCredentialEncrypted: string | null = null;
  if (!input.refreshToken && existing?.id) {
    const existingSecretResponse = await supabase
      .from("google_workspace_connection_secrets")
      .select("refresh_token_encrypted")
      .eq("connection_id", existing.id)
      .maybeSingle();
    if (existingSecretResponse.error) {
      emitGoogleOAuthCallbackDiagnostic({
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
      throw new Error("Unable to load the existing Google refresh credential.");
    }
    existingRefreshCredentialEncrypted = existingSecretResponse.data?.refresh_token_encrypted ?? null;
  }
  let refreshToken: string;
  try {
    refreshToken = resolveGoogleRefreshCredential({
      newRefreshToken: input.refreshToken,
      existingRefreshCredentialEncrypted,
      decryptExisting: (encrypted) =>
        decryptSecret(encrypted, secretContext(connectionId, "refresh_token"))
    }).refreshToken;
  } catch (error) {
    const missingRefreshToken = error instanceof GoogleRefreshCredentialRequiredError;
    emitGoogleOAuthCallbackDiagnostic({
      level: "error",
      stage: "credential_refresh_resolution",
      safeErrorCategory: missingRefreshToken ? "missing_refresh_token" : "encryption_failed",
      message: missingRefreshToken
        ? "Google did not issue an offline refresh token and no existing credential was available."
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
  const connectionResponse = await supabase.from("google_workspace_connections").upsert(
    {
      id: connectionId,
      user_id: input.userId,
      company_id: input.companyId,
      google_subject: input.identity.subject,
      google_email: input.identity.email,
      google_display_name: input.identity.displayName,
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
    emitGoogleOAuthCallbackDiagnostic({
      level: "error",
      stage: "connection_metadata_persistence",
      safeErrorCategory: connectionError.code === "23505" ? "account_binding_conflict" : "persistence_failed",
      providerHttpStatus: connectionResponse.status,
      providerCode: connectionError.code,
      message:
        connectionError.code === "23505"
          ? "The Google subject is already bound to another SignalThread user."
          : connectionError,
      progress: {
        ...CALLBACK_VALIDATED_PROGRESS,
        encryption_succeeded: false,
        persistence_succeeded: false,
        subject_account_binding_succeeded: connectionError.code === "23505" ? false : true
      }
    });
    throw new Error(
      connectionError.code === "23505"
        ? "That Google account is already connected to another SignalThread user."
        : "Unable to save the Google Workspace connection."
    );
  }

  let encryptedCredentialRecord: ReturnType<typeof buildEncryptedGoogleCredentialRecord>;
  try {
    const keyring = getIntegrationSecretKeyring();
    encryptedCredentialRecord = buildEncryptedGoogleCredentialRecord({
      connectionId,
      accessToken: input.accessToken,
      refreshToken,
      activeKeyId: keyring.activeKeyId,
      encrypt: (plaintext, kind) =>
        encryptSecret(plaintext, secretContext(connectionId, kind), keyring)
    });
    emitGoogleOAuthCallbackDiagnostic({
      level: "info",
      stage: "credential_encryption",
      safeErrorCategory: "none",
      progress: { ...CALLBACK_VALIDATED_PROGRESS, encryption_succeeded: true }
    });
  } catch (error) {
    emitGoogleOAuthCallbackDiagnostic({
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
    .from("google_workspace_connection_secrets")
    .upsert(encryptedCredentialRecord)
    .select("connection_id, refresh_token_encrypted, encryption_key_version")
    .single();
  const secretError = secretResponse.error;
  if (secretError) {
    await supabase
      .from("google_workspace_connections")
      .update({ status: "error", last_error_at: now.toISOString(), last_error_code: "secret_persist_failed" })
      .eq("id", connectionId);
    emitGoogleOAuthCallbackDiagnostic({
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
    throw new Error("Unable to secure the Google Workspace credentials.");
  }

  const keyring = getIntegrationSecretKeyring();
  const refreshCredentialVerified =
    secretResponse.data?.connection_id === connectionId &&
    secretResponse.data.encryption_key_version === keyring.activeKeyId &&
    verifyPersistedGoogleRefreshCredential({
      encryptedRefreshCredential: secretResponse.data.refresh_token_encrypted,
      expectedRefreshCredential: refreshToken,
      decrypt: (encrypted) =>
        decryptSecret(encrypted, secretContext(connectionId, "refresh_token"), keyring)
    });
  if (!refreshCredentialVerified) {
    await supabase
      .from("google_workspace_connections")
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
    emitGoogleConnectionDiagnostic({
      level: "error",
      diagnostic: {
        stage: "oauth_persistence_verification",
        safe_error_category: "credential_unreadable",
        connection_row_matched: true,
        refresh_credential_present: Boolean(secretResponse.data?.refresh_token_encrypted),
        refresh_credential_decryptable: false,
        persisted_status: "reconnect_required",
        effective_status: "reconnect_required",
        required_scopes_granted: hasAllRequiredGoogleWorkspaceScopes(input.scopes)
      }
    });
    throw new Error("Unable to verify the secured Google Workspace credentials.");
  }

  const activationResponse = await supabase
    .from("google_workspace_connections")
    .update(successfulGoogleConnectionActivationPatch(now.toISOString()))
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
      .from("google_workspace_connections")
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
    emitGoogleConnectionDiagnostic({
      level: "error",
      diagnostic: {
        stage: "oauth_persistence_verification",
        safe_error_category: "persistence_failed",
        connection_row_matched: false,
        refresh_credential_present: true,
        refresh_credential_decryptable: true,
        persisted_status: null,
        effective_status: "error",
        required_scopes_granted: hasAllRequiredGoogleWorkspaceScopes(input.scopes)
      }
    });
    throw new Error("Unable to activate the Google Workspace connection.");
  }
  emitGoogleConnectionDiagnostic({
    level: "info",
    diagnostic: {
      stage: "oauth_persistence_verification",
      safe_error_category: "none",
      connection_row_matched: true,
      refresh_credential_present: true,
      refresh_credential_decryptable: true,
      persisted_status: activationResponse.data!.status,
      effective_status: "connected",
      required_scopes_granted: hasAllRequiredGoogleWorkspaceScopes(input.scopes)
    }
  });
  emitGoogleOAuthCallbackDiagnostic({
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

export async function disconnectGoogleWorkspaceConnection(input: { userId: string; companyId: string }) {
  const supabase = createAdminClient();
  return disconnectGoogleWorkspaceWithDeps({
    loadConnection: async () => {
      const { data: connection, error } = await supabase
        .from("google_workspace_connections")
        .select("id")
        .eq("user_id", input.userId)
        .eq("company_id", input.companyId)
        .maybeSingle();
      if (error) throw new Error("Unable to load the Google Workspace connection.");
      if (!connection) return null;
      const { data: secret, error: secretError } = await supabase
        .from("google_workspace_connection_secrets")
        .select("refresh_token_encrypted")
        .eq("connection_id", connection.id)
        .maybeSingle();
      if (secretError || !secret) {
        return { connectionId: connection.id, refreshToken: null };
      }
      let refreshToken: string | null = null;
      try {
        refreshToken = decryptSecret(
          secret.refresh_token_encrypted,
          secretContext(connection.id, "refresh_token")
        );
      } catch {
        // Corrupt or no-longer-decryptable credentials must not block local
        // disconnect. No ciphertext or provider detail leaves this service.
      }
      return {
        connectionId: connection.id,
        refreshToken
      };
    },
    revokeToken: (refreshToken) => revokeGoogleToken({ token: refreshToken }),
    deleteConnection: async (connectionId) => {
      const { error } = await supabase
        .from("google_workspace_connections")
        .delete()
        .eq("id", connectionId)
        .eq("user_id", input.userId)
        .eq("company_id", input.companyId);
      if (error) throw new Error("Unable to remove the local Google Workspace connection.");
    }
  });
}
