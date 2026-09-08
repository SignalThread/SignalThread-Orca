import "server-only";

import { setTimeout as delay } from "node:timers/promises";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  decryptSecret,
  encryptSecret,
  getIntegrationSecretKeyring
} from "@/lib/security/encrypted-secret";
import {
  normalizePipedriveScopes,
  refreshPipedriveAccessToken,
  validatePipedriveApiDomain
} from "@/lib/integrations/pipedrive/oauth-client";
import {
  getValidPipedriveAccessTokenWithDeps,
  PipedriveTokenManagerError,
  type PipedriveTokenConnection
} from "@/lib/integrations/pipedrive/token-manager-core";
import { pipedriveSecretContext } from "@/lib/integrations/pipedrive/credential-core";

async function loadPipedriveConnection(
  companyId: string,
  connectionId?: string
): Promise<PipedriveTokenConnection | null> {
  const supabase = createAdminClient() as any;
  let query = supabase
    .from("integrations")
    .select("id, status, expires_at, scope, provider_api_domain")
    .eq("account_id", companyId)
    .eq("provider", "pipedrive");
  if (connectionId) query = query.eq("id", connectionId);
  const connectionResponse = await query.maybeSingle();
  if (connectionResponse.error) throw new Error("Pipedrive connection lookup failed.");
  if (!connectionResponse.data) return null;

  const row = connectionResponse.data;
  const secretResponse = await supabase
    .from("integration_connection_secrets")
    .select("access_token_encrypted, refresh_token_encrypted, credential_version")
    .eq("connection_id", row.id)
    .maybeSingle();
  if (secretResponse.error || !secretResponse.data) {
    await supabase
      .from("integrations")
      .update({
        status: "reconnect_required",
        last_error_at: new Date().toISOString(),
        last_error_code: "credential_missing"
      })
      .eq("id", row.id)
      .eq("account_id", companyId)
      .eq("provider", "pipedrive");
    throw new PipedriveTokenManagerError("reconnect_required");
  }

  const keyring = getIntegrationSecretKeyring();
  let accessToken: string;
  let refreshToken: string;
  try {
    accessToken = decryptSecret(
      secretResponse.data.access_token_encrypted,
      pipedriveSecretContext(row.id, "access_token"),
      keyring
    );
    refreshToken = decryptSecret(
      secretResponse.data.refresh_token_encrypted,
      pipedriveSecretContext(row.id, "refresh_token"),
      keyring
    );
  } catch {
    await supabase
      .from("integrations")
      .update({
        status: "reconnect_required",
        last_error_at: new Date().toISOString(),
        last_error_code: "credential_decryption_failed"
      })
      .eq("id", row.id)
      .eq("account_id", companyId)
      .eq("provider", "pipedrive");
    throw new PipedriveTokenManagerError("reconnect_required");
  }
  let apiDomain: string;
  try {
    apiDomain = validatePipedriveApiDomain(row.provider_api_domain);
  } catch {
    await supabase
      .from("integrations")
      .update({
        status: "reconnect_required",
        last_error_at: new Date().toISOString(),
        last_error_code: "invalid_api_domain"
      })
      .eq("id", row.id)
      .eq("account_id", companyId)
      .eq("provider", "pipedrive");
    throw new PipedriveTokenManagerError("reconnect_required");
  }
  return {
    id: row.id,
    status: row.status,
    accessToken,
    refreshToken,
    expiresAt: row.expires_at,
    scopes: Array.isArray(row.scope) ? row.scope : [],
    apiDomain,
    credentialVersion: Number(secretResponse.data.credential_version)
  };
}

export async function getValidPipedriveAccessToken(companyId: string, options?: {
  forceRefresh?: boolean;
}) {
  const normalizedCompanyId = String(companyId ?? "").trim();
  if (!normalizedCompanyId) {
    return { ok: false as const, code: "not_connected" as const, refreshAttempted: false };
  }
  const supabase = createAdminClient() as any;
  return getValidPipedriveAccessTokenWithDeps(
    {
      loadConnection: () => loadPipedriveConnection(normalizedCompanyId),
      acquireRefreshLease: async (connectionId, leaseToken, now, until) => {
        const patch = {
          refresh_lease_token: leaseToken,
          refresh_lease_until: until,
          last_refresh_attempt_at: now
        };
        const base = () =>
          supabase
            .from("integrations")
            .update(patch)
            .eq("id", connectionId)
            .eq("account_id", normalizedCompanyId)
            .eq("provider", "pipedrive")
            .in("status", ["connected", "error"]);
        const emptyLease = await base().is("refresh_lease_until", null).select("id").maybeSingle();
        if (emptyLease.error) throw new Error("Pipedrive refresh lease failed.");
        if (emptyLease.data?.id) return true;
        const expiredLease = await base().lt("refresh_lease_until", now).select("id").maybeSingle();
        if (expiredLease.error) throw new Error("Pipedrive refresh lease failed.");
        return Boolean(expiredLease.data?.id);
      },
      waitForRefresh: async (connectionId) => {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          await delay(100);
          const reloaded = await loadPipedriveConnection(normalizedCompanyId, connectionId);
          if (!reloaded) return null;
          const expiry = reloaded.expiresAt ? Date.parse(reloaded.expiresAt) : 0;
          if (expiry - Date.now() > 5 * 60_000 || reloaded.status === "reconnect_required") {
            return reloaded;
          }
        }
        return null;
      },
      refreshToken: async (refreshToken) => {
        const response = await refreshPipedriveAccessToken({ refreshToken });
        return {
          ok: response.ok,
          accessToken: response.payload.access_token,
          refreshToken: response.payload.refresh_token,
          expiresIn: response.payload.expires_in,
          scopes: response.payload.scope
            ? normalizePipedriveScopes(response.payload.scope)
            : undefined,
          apiDomain: response.payload.api_domain
            ? validatePipedriveApiDomain(response.payload.api_domain)
            : undefined,
          errorCode: response.payload.error ?? (response.ok ? undefined : "refresh_failed")
        };
      },
      persistRefresh: async (connection, leaseToken, patch) => {
        const keyring = getIntegrationSecretKeyring();
        const response = await supabase.rpc("persist_integration_oauth_refresh", {
          p_connection_id: connection.id,
          p_provider: "pipedrive",
          p_lease_token: leaseToken,
          p_expected_credential_version: connection.credentialVersion,
          p_access_token_encrypted: encryptSecret(
            patch.accessToken,
            pipedriveSecretContext(connection.id, "access_token"),
            keyring
          ),
          p_refresh_token_encrypted: encryptSecret(
            patch.refreshToken,
            pipedriveSecretContext(connection.id, "refresh_token"),
            keyring
          ),
          p_encryption_key_version: keyring.activeKeyId,
          p_expires_at: patch.expiresAt,
          p_scope: patch.scopes,
          p_provider_api_domain: validatePipedriveApiDomain(patch.apiDomain)
        });
        if (response.error || response.data !== true) return null;
        return {
          ...connection,
          accessToken: patch.accessToken,
          refreshToken: patch.refreshToken,
          expiresAt: patch.expiresAt,
          scopes: patch.scopes,
          apiDomain: patch.apiDomain,
          credentialVersion: connection.credentialVersion + 1,
          status: "connected"
        };
      },
      markFailure: async (connectionId, leaseToken, reconnectRequired, errorCode) => {
        const response = await supabase
          .from("integrations")
          .update({
            status: reconnectRequired ? "reconnect_required" : "error",
            last_error_at: new Date().toISOString(),
            last_error_code: String(errorCode).slice(0, 80),
            refresh_lease_token: null,
            refresh_lease_until: null
          })
          .eq("id", connectionId)
          .eq("account_id", normalizedCompanyId)
          .eq("provider", "pipedrive")
          .eq("refresh_lease_token", leaseToken);
        if (response.error) throw new Error("Pipedrive refresh failure persistence failed.");
      },
      releaseRefreshLease: async (connectionId, leaseToken) => {
        await supabase
          .from("integrations")
          .update({ refresh_lease_token: null, refresh_lease_until: null })
          .eq("id", connectionId)
          .eq("account_id", normalizedCompanyId)
          .eq("provider", "pipedrive")
          .eq("refresh_lease_token", leaseToken);
      }
    },
    options
  );
}
