import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { digestPipedriveOAuthState } from "@/lib/integrations/pipedrive/oauth-state";
import type { PipedriveIdentity } from "@/lib/integrations/pipedrive/oauth-client";
import {
  revokePipedriveRefreshToken,
  validatePipedriveApiDomain
} from "@/lib/integrations/pipedrive/oauth-client";
import {
  decryptSecret,
  encryptSecret,
  getIntegrationSecretKeyring
} from "@/lib/security/encrypted-secret";
import {
  buildEncryptedPipedriveCredentialRecord,
  pipedriveSecretContext
} from "@/lib/integrations/pipedrive/credential-core";

export type PipedriveStateBinding = {
  userId: string;
  companyId: string;
  returnTo: string;
};

export type PipedrivePublicConnectionStatus = {
  exists: boolean;
  connected: boolean;
  status: "connected" | "not_connected" | "error";
  accountId: string | null;
  accountName: string | null;
};

export function encryptPipedriveCredentials(input: {
  connectionId: string;
  accessToken: string;
  refreshToken: string;
}) {
  const keyring = getIntegrationSecretKeyring();
  return buildEncryptedPipedriveCredentialRecord({
    ...input,
    keyVersion: keyring.activeKeyId,
    encrypt: (plaintext, context) => encryptSecret(plaintext, context, keyring)
  });
}

export async function consumePipedriveOAuthState(
  state: string,
  now: Date = new Date()
): Promise<PipedriveStateBinding | null> {
  if (!state) return null;
  const response = await (createAdminClient() as any)
    .from("integration_oauth_states")
    .update({ consumed_at: now.toISOString() })
    .eq("state_digest", digestPipedriveOAuthState(state))
    .eq("provider", "pipedrive")
    .is("consumed_at", null)
    .gt("expires_at", now.toISOString())
    .select("user_id, company_id, return_to")
    .maybeSingle();
  if (response.error || !response.data) return null;
  return {
    userId: response.data.user_id,
    companyId: response.data.company_id,
    returnTo: response.data.return_to
  };
}

export async function savePipedriveConnection(input: {
  userId: string;
  companyId: string;
  identity: PipedriveIdentity;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scopes: string[];
  tokenType: string | null;
  apiDomain: string;
  now?: Date;
}) {
  if (!input.accessToken || !input.refreshToken) {
    throw new Error("Pipedrive did not return complete OAuth credentials.");
  }
  const supabase = createAdminClient() as any;
  // Validate server configuration before changing an existing healthy row.
  getIntegrationSecretKeyring();
  const apiDomain = validatePipedriveApiDomain(input.apiDomain);
  const now = input.now ?? new Date();
  const expiresAt = new Date(
    now.getTime() + Math.max(60, Number(input.expiresIn) || 3600) * 1000
  ).toISOString();

  const metadata = await supabase.from("integrations").upsert(
    {
      account_id: input.companyId,
      provider: "pipedrive",
      access_token: null,
      refresh_token: null,
      expires_at: expiresAt,
      scope: input.scopes,
      provider_account_id: input.identity.companyId,
      provider_account_name: input.identity.companyName,
      provider_user_id: input.identity.userId,
      provider_api_domain: apiDomain,
      connected_by_user_id: input.userId,
      token_type: input.tokenType,
      status: "error",
      connected_at: now.toISOString(),
      last_verified_at: now.toISOString(),
      last_error_at: now.toISOString(),
      last_error_code: "credential_persistence_pending",
      last_sync_error: null,
      refresh_lease_token: null,
      refresh_lease_until: null
    },
    { onConflict: "account_id,provider" }
  ).select("id").single();
  if (metadata.error || !metadata.data?.id) {
    throw new Error("Unable to save the Pipedrive connection.");
  }

  const connectionId = metadata.data.id;
  const encrypted = encryptPipedriveCredentials({
    connectionId,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken
  });

  const existingSecret = await supabase
    .from("integration_connection_secrets")
    .select("credential_version")
    .eq("connection_id", connectionId)
    .maybeSingle();
  if (existingSecret.error) throw new Error("Unable to inspect encrypted Pipedrive credentials.");
  const secrets = await supabase.from("integration_connection_secrets").upsert({
    connection_id: connectionId,
    ...encrypted,
    credential_version: Number(existingSecret.data?.credential_version ?? -1) + 1
  });
  if (secrets.error) throw new Error("Unable to save encrypted Pipedrive credentials.");

  const activated = await supabase
    .from("integrations")
    .update({
      status: "connected",
      last_error_at: null,
      last_error_code: null
    })
    .eq("id", connectionId)
    .eq("account_id", input.companyId)
    .eq("provider", "pipedrive");
  if (activated.error) throw new Error("Unable to activate the Pipedrive connection.");
  return { connectionId };
}

export async function getPipedriveConnectionStatus(
  companyId: string
): Promise<PipedrivePublicConnectionStatus> {
  const response = await (createAdminClient() as any)
    .from("integrations")
    .select("status, provider_account_id, provider_account_name")
    .eq("account_id", companyId)
    .eq("provider", "pipedrive")
    .maybeSingle();
  if (response.error) throw new Error("Unable to load Pipedrive connection status.");
  if (!response.data) {
    return { exists: false, connected: false, status: "not_connected", accountId: null, accountName: null };
  }
  const connected = response.data.status === "connected";
  return {
    exists: true,
    connected,
    status: connected ? "connected" : "error",
    accountId: response.data.provider_account_id ?? null,
    accountName: response.data.provider_account_name ?? null
  };
}

export async function disconnectPipedriveConnection(companyId: string) {
  const supabase = createAdminClient() as any;
  const connection = await supabase
    .from("integrations")
    .select("id")
    .eq("account_id", companyId)
    .eq("provider", "pipedrive")
    .maybeSingle();
  if (connection.error) throw new Error("Unable to inspect the Pipedrive connection.");
  if (!connection.data) return { disconnected: false, revocationConfirmed: true };

  const connectionId = connection.data.id;
  const secrets = await supabase
    .from("integration_connection_secrets")
    .select("refresh_token_encrypted")
    .eq("connection_id", connectionId)
    .maybeSingle();
  if (secrets.error) throw new Error("Unable to load the Pipedrive credential.");

  const pendingRevocation = await supabase
    .from("integrations")
    .update({ status: "revocation_pending" })
    .eq("id", connectionId)
    .eq("account_id", companyId)
    .eq("provider", "pipedrive");
  if (pendingRevocation.error) throw new Error("Unable to secure the Pipedrive connection for revocation.");

  if (secrets.data?.refresh_token_encrypted) {
    let refreshToken: string;
    try {
      refreshToken = decryptSecret(
        secrets.data.refresh_token_encrypted,
        pipedriveSecretContext(connectionId, "refresh_token")
      );
    } catch {
      await supabase.from("integrations").delete().eq("id", connectionId).eq("account_id", companyId);
      throw new Error("The stored Pipedrive credential was unreadable and was removed.");
    }
    const revoked = await revokePipedriveRefreshToken({ refreshToken }).catch(() => false);
    if (!revoked) {
      await supabase
        .from("integrations")
        .update({
          // Keep the canonical token manager blocked while an operator retries
          // provider revocation; never re-enable a credential being removed.
          status: "revocation_pending",
          last_error_at: new Date().toISOString(),
          last_error_code: "revocation_failed"
        })
        .eq("id", connectionId)
        .eq("account_id", companyId);
      throw new Error("Pipedrive credential revocation failed.");
    }
  }

  const deleted = await supabase
    .from("integrations")
    .delete()
    .eq("id", connectionId)
    .eq("account_id", companyId)
    .eq("provider", "pipedrive");
  if (deleted.error) throw new Error("Unable to remove the Pipedrive connection.");
  return { disconnected: true, revocationConfirmed: true };
}
