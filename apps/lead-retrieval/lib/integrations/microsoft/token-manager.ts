import "server-only";

import { setTimeout as delay } from "node:timers/promises";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, getIntegrationSecretKeyring } from "@/lib/security/encrypted-secret";
import { normalizeGrantedMicrosoft365Scopes } from "@/lib/integrations/microsoft/scopes";
import {
  refreshMicrosoftAccessToken,
  requireMicrosoftOAuthConfig
} from "@/lib/integrations/microsoft/oauth-client";
import { microsoftSecretContext } from "@/lib/integrations/microsoft/secret-context";
import {
  ProviderTokenManagerStageError,
  getValidProviderAccessTokenWithDeps,
  type ProviderTokenConnection
} from "@/lib/integrations/oauth/token-manager-core";

/**
 * The service-role client and the outbound token transport are injectable so the
 * refresh lifecycle (rotation, invalid-grant demotion) can be exercised
 * deterministically without network access.
 */
type MicrosoftTokenClient = ReturnType<typeof createAdminClient>;

type ConnectionDatabaseRow = {
  id: string;
  status: ProviderTokenConnection["status"];
  token_expires_at: string | null;
  granted_scopes: string[] | null;
};

async function markStoredConnectionReconnectRequired(
  supabase: MicrosoftTokenClient,
  connectionId: string,
  code: string
) {
  const { error } = await supabase
    .from("microsoft_365_connections")
    .update({
      status: "reconnect_required",
      last_error_at: new Date().toISOString(),
      last_error_code: code,
      refresh_lease_token: null,
      refresh_lease_until: null
    })
    .eq("id", connectionId);
  if (error) {
    throw new ProviderTokenManagerStageError("credential_lookup", "credential_storage_error");
  }
}

async function loadConnectionById(
  supabase: MicrosoftTokenClient,
  connectionId: string
): Promise<ProviderTokenConnection | null> {
  const { data: connection, error: connectionError } = await supabase
    .from("microsoft_365_connections")
    .select("id, status, token_expires_at, granted_scopes")
    .eq("id", connectionId)
    .maybeSingle();
  if (connectionError) {
    throw new ProviderTokenManagerStageError("connection_lookup", "credential_storage_error");
  }
  if (!connection) return null;
  const { data: secrets, error: secretsError } = await supabase
    .from("microsoft_365_connection_secrets")
    .select("access_token_encrypted, refresh_token_encrypted")
    .eq("connection_id", connectionId)
    .maybeSingle();
  if (secretsError) {
    throw new ProviderTokenManagerStageError("credential_lookup", "credential_storage_error");
  }
  if (!secrets) {
    await markStoredConnectionReconnectRequired(supabase, connectionId, "credential_missing");
    throw new ProviderTokenManagerStageError("credential_lookup", "reconnect_required");
  }
  const row = connection as ConnectionDatabaseRow;
  let keyring;
  try {
    keyring = getIntegrationSecretKeyring();
  } catch {
    throw new ProviderTokenManagerStageError("access_token_decryption", "configuration_error");
  }
  let accessToken: string;
  try {
    accessToken = decryptSecret(
      secrets.access_token_encrypted,
      microsoftSecretContext(row.id, "access_token"),
      keyring
    );
  } catch {
    await markStoredConnectionReconnectRequired(supabase, connectionId, "credential_decryption_failed");
    throw new ProviderTokenManagerStageError("access_token_decryption", "reconnect_required");
  }
  let refreshToken: string;
  try {
    refreshToken = decryptSecret(
      secrets.refresh_token_encrypted,
      microsoftSecretContext(row.id, "refresh_token"),
      keyring
    );
  } catch {
    await markStoredConnectionReconnectRequired(supabase, connectionId, "credential_decryption_failed");
    throw new ProviderTokenManagerStageError("refresh_token_decryption", "reconnect_required");
  }
  if (!accessToken || !refreshToken) {
    await markStoredConnectionReconnectRequired(supabase, connectionId, "credential_missing");
    throw new ProviderTokenManagerStageError("credential_lookup", "reconnect_required");
  }
  return {
    id: row.id,
    status: row.status,
    accessToken,
    refreshToken,
    expiresAt: row.token_expires_at,
    grantedScopes: row.granted_scopes ?? []
  };
}

async function loadScopedConnection(
  supabase: MicrosoftTokenClient,
  userId: string,
  companyId: string
) {
  const { data, error } = await supabase
    .from("microsoft_365_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new ProviderTokenManagerStageError("connection_lookup", "credential_storage_error");
  return data?.id ? loadConnectionById(supabase, data.id) : null;
}

export async function getValidMicrosoftAccessTokenForUser(input: {
  userId: string;
  companyId: string;
  forceRefresh?: boolean;
  supabase?: MicrosoftTokenClient;
  fetchImpl?: typeof fetch;
}) {
  const supabase = input.supabase ?? createAdminClient();
  const result = await getValidProviderAccessTokenWithDeps(
    {
      loadConnection: () => loadScopedConnection(supabase, input.userId, input.companyId),
      acquireRefreshLease: async (connectionId, leaseToken, now, until) => {
        const leasePatch = {
          refresh_lease_token: leaseToken,
          refresh_lease_until: until,
          last_refresh_attempt_at: now
        };
        const baseLeaseUpdate = () =>
          supabase
            .from("microsoft_365_connections")
            .update(leasePatch)
            .eq("id", connectionId)
            .eq("user_id", input.userId)
            .eq("company_id", input.companyId)
            .in("status", ["connected", "error"]);

        // PostgREST can generate an invalid qualified-column reference for an
        // OR filter on PATCH. Two conditional UPDATEs keep the lease atomic:
        // PostgreSQL rechecks each predicate after a concurrent row lock wait.
        const availableLease = await baseLeaseUpdate()
          .is("refresh_lease_until", null)
          .select("id")
          .maybeSingle();
        if (availableLease.error) {
          throw new ProviderTokenManagerStageError("refresh_lease_acquisition", "refresh_lease_error");
        }
        if (availableLease.data?.id) return true;

        const expiredLease = await baseLeaseUpdate()
          .lt("refresh_lease_until", now)
          .select("id")
          .maybeSingle();
        if (expiredLease.error) {
          throw new ProviderTokenManagerStageError("refresh_lease_acquisition", "refresh_lease_error");
        }
        return Boolean(expiredLease.data?.id);
      },
      waitForRefreshCompletion: async (connectionId) => {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          await delay(100);
          const reloaded = await loadConnectionById(supabase, connectionId);
          if (!reloaded) return null;
          const expiry = reloaded.expiresAt ? Date.parse(reloaded.expiresAt) : 0;
          if (expiry - Date.now() > 5 * 60_000 || reloaded.status === "reconnect_required") return reloaded;
        }
        return null;
      },
      refreshToken: async (refreshToken) => {
        try {
          requireMicrosoftOAuthConfig();
        } catch {
          throw new ProviderTokenManagerStageError("provider_refresh_request", "configuration_error", false);
        }
        let result;
        try {
          result = await refreshMicrosoftAccessToken({ refreshToken, fetchImpl: input.fetchImpl });
        } catch {
          throw new ProviderTokenManagerStageError("provider_refresh_request", "provider_refresh_error", true);
        }
        if (!result.ok || !result.payload.access_token) {
          return {
            ok: false as const,
            status: result.status,
            code: String(result.payload.error ?? "refresh_failed").slice(0, 80),
            message: "Microsoft token refresh failed."
          };
        }
        return {
          ok: true as const,
          accessToken: result.payload.access_token,
          // Microsoft rotates the refresh token on every successful refresh;
          // the replacement is persisted in place of the presented one.
          refreshToken: result.payload.refresh_token,
          expiresIn: result.payload.expires_in,
          scopes: result.payload.scope
            ? normalizeGrantedMicrosoft365Scopes(result.payload.scope)
            : undefined,
          tokenType: result.payload.token_type
        };
      },
      persistRefresh: async (connection, leaseToken, patch) => {
        let keyring;
        try {
          keyring = getIntegrationSecretKeyring();
        } catch {
          throw new ProviderTokenManagerStageError(
            "refreshed_credential_persistence",
            "configuration_error",
            true
          );
        }
        const { error: secretsError } = await supabase
          .from("microsoft_365_connection_secrets")
          .update({
            access_token_encrypted: encryptSecret(
              patch.accessToken,
              microsoftSecretContext(connection.id, "access_token"),
              keyring
            ),
            refresh_token_encrypted: encryptSecret(
              patch.refreshToken,
              microsoftSecretContext(connection.id, "refresh_token"),
              keyring
            ),
            encryption_key_version: keyring.activeKeyId
          })
          .eq("connection_id", connection.id);
        if (secretsError) {
          throw new ProviderTokenManagerStageError(
            "refreshed_credential_persistence",
            "refresh_persistence_error",
            true
          );
        }

        const { error: metadataError } = await supabase
          .from("microsoft_365_connections")
          .update({
            token_expires_at: patch.expiresAt,
            token_type: patch.tokenType,
            granted_scopes: patch.scopes,
            status: "connected",
            last_refresh_at: new Date().toISOString(),
            last_error_at: null,
            last_error_code: null,
            refresh_lease_token: null,
            refresh_lease_until: null
          })
          .eq("id", connection.id)
          .eq("refresh_lease_token", leaseToken);
        if (metadataError) {
          throw new ProviderTokenManagerStageError(
            "refreshed_credential_persistence",
            "refresh_persistence_error",
            true
          );
        }
        return {
          ...connection,
          accessToken: patch.accessToken,
          refreshToken: patch.refreshToken,
          expiresAt: patch.expiresAt,
          grantedScopes: patch.scopes,
          status: "connected"
        };
      },
      markReconnectRequired: async (connectionId, leaseToken, code) => {
        const { data, error } = await supabase
          .from("microsoft_365_connections")
          .update({
            status: "reconnect_required",
            last_error_at: new Date().toISOString(),
            last_error_code: code.slice(0, 80),
            refresh_lease_token: null,
            refresh_lease_until: null
          })
          .eq("id", connectionId)
          .eq("refresh_lease_token", leaseToken)
          .select("id")
          .maybeSingle();
        if (error || !data) {
          throw new ProviderTokenManagerStageError(
            "refreshed_credential_persistence",
            "refresh_persistence_error",
            true
          );
        }
        const { error: deleteError } = await supabase
          .from("microsoft_365_connection_secrets")
          .delete()
          .eq("connection_id", connectionId);
        if (deleteError) {
          throw new ProviderTokenManagerStageError(
            "refreshed_credential_persistence",
            "refresh_persistence_error",
            true
          );
        }
      },
      markRefreshError: async (connectionId, leaseToken, code) => {
        const { error } = await supabase
          .from("microsoft_365_connections")
          .update({
            status: "error",
            last_error_at: new Date().toISOString(),
            last_error_code: code.slice(0, 80),
            refresh_lease_token: null,
            refresh_lease_until: null
          })
          .eq("id", connectionId)
          .eq("refresh_lease_token", leaseToken);
        if (error) {
          throw new ProviderTokenManagerStageError(
            "refreshed_credential_persistence",
            "refresh_persistence_error",
            true
          );
        }
      },
      releaseRefreshLease: async (connectionId, leaseToken) => {
        await supabase
          .from("microsoft_365_connections")
          .update({ refresh_lease_token: null, refresh_lease_until: null })
          .eq("id", connectionId)
          .eq("refresh_lease_token", leaseToken);
      }
    },
    { forceRefresh: input.forceRefresh }
  );
  if (!result.ok && process.env.NODE_ENV === "development") {
    console.error("[microsoft/token-manager]", {
      stage: result.stage,
      category: result.category,
      tokenRefreshAttempted: result.refreshAttempted
    });
  }
  return result;
}
