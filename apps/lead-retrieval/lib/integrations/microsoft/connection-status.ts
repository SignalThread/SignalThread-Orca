import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, getIntegrationSecretKeyring } from "@/lib/security/encrypted-secret";
import { getMicrosoft365Capabilities } from "@/lib/integrations/microsoft/scopes";
import { microsoftSecretContext } from "@/lib/integrations/microsoft/secret-context";
import {
  deriveMicrosoft365ConnectionHealth,
  hasAllRequiredMicrosoft365Scopes,
  type Microsoft365RefreshCredentialState
} from "@/lib/integrations/microsoft/connection-health-core";
import { emitMicrosoft365ConnectionDiagnostic } from "@/lib/integrations/microsoft/connection-diagnostics";

export type Microsoft365ConnectionStatus = {
  connected: boolean;
  status: "disconnected" | "connected" | "reconnect_required" | "error" | "revocation_pending";
  identity: { email: string; displayName: string | null } | null;
  grantedScopes: string[];
  capabilities: {
    mailSend: boolean;
    calendarReadWrite: boolean;
  };
  isPartialGrant: boolean;
  expiresAt: string | null;
  connectedAt: string | null;
  lastRefreshAt: string | null;
  lastErrorCode: string | null;
};

export type Microsoft365ConnectionHealthRecord = {
  connectionId: string | null;
  status: Microsoft365ConnectionStatus;
};

type ConnectionRow = {
  id: string;
  microsoft_email: string;
  microsoft_display_name: string | null;
  granted_scopes: string[] | null;
  status: "connected" | "reconnect_required" | "error" | "revocation_pending";
  token_expires_at: string | null;
  connected_at: string;
  last_refresh_at: string | null;
  last_error_code: string | null;
};

export function disconnectedMicrosoft365Status(): Microsoft365ConnectionStatus {
  return {
    connected: false,
    status: "disconnected",
    identity: null,
    grantedScopes: [],
    capabilities: getMicrosoft365Capabilities([]),
    isPartialGrant: false,
    expiresAt: null,
    connectedAt: null,
    lastRefreshAt: null,
    lastErrorCode: null
  };
}

export function toMicrosoft365ConnectionStatus(
  row: ConnectionRow | null,
  refreshCredentialState: Microsoft365RefreshCredentialState
) {
  if (!row) return disconnectedMicrosoft365Status();
  const grantedScopes = row.granted_scopes ?? [];
  const health = deriveMicrosoft365ConnectionHealth({
    persistedStatus: row.status,
    grantedScopes,
    refreshCredentialState
  });
  return {
    connected: health.connected,
    status: health.status,
    identity: { email: row.microsoft_email, displayName: row.microsoft_display_name },
    grantedScopes,
    capabilities: health.capabilities,
    isPartialGrant: health.isPartialGrant,
    expiresAt: row.token_expires_at,
    connectedAt: row.connected_at,
    lastRefreshAt: row.last_refresh_at,
    lastErrorCode: health.safeErrorCode ?? row.last_error_code
  } satisfies Microsoft365ConnectionStatus;
}

export async function getMicrosoft365ConnectionHealthRecord(
  userId: string,
  companyId: string,
  options: { supabase?: ReturnType<typeof createAdminClient> } = {}
): Promise<Microsoft365ConnectionHealthRecord> {
  const supabase = options.supabase ?? createAdminClient();
  const { data, error } = await supabase
    .from("microsoft_365_connections")
    .select(
      "id, microsoft_email, microsoft_display_name, granted_scopes, status, token_expires_at, connected_at, last_refresh_at, last_error_code"
    )
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error("Unable to load Microsoft 365 connection status.");
  const row = (data as ConnectionRow | null) ?? null;
  if (!row) {
    emitMicrosoft365ConnectionDiagnostic({
      level: "info",
      diagnostic: {
        stage: "status_calculation",
        safe_error_category: "missing_connection",
        connection_row_matched: false,
        refresh_credential_present: false,
        refresh_credential_decryptable: false,
        persisted_status: null,
        effective_status: "disconnected",
        required_scopes_granted: false
      }
    });
    return { connectionId: null, status: disconnectedMicrosoft365Status() };
  }

  const secretResponse = await supabase
    .from("microsoft_365_connection_secrets")
    .select("refresh_token_encrypted")
    .eq("connection_id", row.id)
    .maybeSingle();
  if (secretResponse.error) {
    throw new Error("Unable to inspect Microsoft 365 credential status.");
  }
  const credentialPresent = Boolean(secretResponse.data?.refresh_token_encrypted);
  let refreshCredentialState: Microsoft365RefreshCredentialState = credentialPresent
    ? "unreadable"
    : "missing";
  if (secretResponse.data?.refresh_token_encrypted) {
    try {
      const storedCredential = decryptSecret(
        secretResponse.data.refresh_token_encrypted,
        microsoftSecretContext(row.id, "refresh_token"),
        getIntegrationSecretKeyring()
      );
      refreshCredentialState = storedCredential.trim() ? "usable" : "missing";
    } catch {
      refreshCredentialState = "unreadable";
    }
  }
  const status = toMicrosoft365ConnectionStatus(row, refreshCredentialState);
  emitMicrosoft365ConnectionDiagnostic({
    level: refreshCredentialState === "usable" ? "info" : "warn",
    diagnostic: {
      stage: "status_calculation",
      safe_error_category:
        refreshCredentialState === "usable"
          ? status.status === "connected"
            ? "none"
            : "lifecycle_unhealthy"
          : refreshCredentialState === "missing"
            ? "credential_missing"
            : "credential_unreadable",
      connection_row_matched: true,
      refresh_credential_present: credentialPresent,
      refresh_credential_decryptable: refreshCredentialState === "usable",
      persisted_status: row.status,
      effective_status: status.status,
      required_scopes_granted: hasAllRequiredMicrosoft365Scopes(row.granted_scopes ?? [])
    }
  });
  return { connectionId: row.id, status };
}

export async function getMicrosoft365ConnectionStatus(
  userId: string,
  companyId: string,
  options: { supabase?: ReturnType<typeof createAdminClient> } = {}
) {
  return (await getMicrosoft365ConnectionHealthRecord(userId, companyId, options)).status;
}
