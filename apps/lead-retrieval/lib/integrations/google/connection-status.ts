import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, getIntegrationSecretKeyring } from "@/lib/security/encrypted-secret";
import { getGoogleWorkspaceCapabilities } from "@/lib/integrations/google/scopes";
import {
  deriveGoogleWorkspaceConnectionHealth,
  hasAllRequiredGoogleWorkspaceScopes,
  type GoogleRefreshCredentialState
} from "@/lib/integrations/google/connection-health-core";
import { emitGoogleConnectionDiagnostic } from "@/lib/integrations/google/connection-diagnostics";

export type GoogleWorkspaceConnectionStatus = {
  connected: boolean;
  status: "disconnected" | "connected" | "reconnect_required" | "error" | "revocation_pending";
  identity: { email: string; displayName: string | null } | null;
  grantedScopes: string[];
  capabilities: {
    gmailSend: boolean;
    calendarEventsOwned: boolean;
    calendarFreeBusy: boolean;
  };
  isPartialGrant: boolean;
  expiresAt: string | null;
  connectedAt: string | null;
  lastRefreshAt: string | null;
  lastErrorCode: string | null;
};

export type GoogleWorkspaceConnectionHealthRecord = {
  connectionId: string | null;
  status: GoogleWorkspaceConnectionStatus;
};

type ConnectionRow = {
  id: string;
  google_email: string;
  google_display_name: string | null;
  granted_scopes: string[] | null;
  status: "connected" | "reconnect_required" | "error" | "revocation_pending";
  token_expires_at: string | null;
  connected_at: string;
  last_refresh_at: string | null;
  last_error_code: string | null;
};

function secretContext(connectionId: string) {
  return `google_workspace:${connectionId}:refresh_token`;
}

export function disconnectedGoogleWorkspaceStatus(): GoogleWorkspaceConnectionStatus {
  return {
    connected: false,
    status: "disconnected",
    identity: null,
    grantedScopes: [],
    capabilities: getGoogleWorkspaceCapabilities([]),
    isPartialGrant: false,
    expiresAt: null,
    connectedAt: null,
    lastRefreshAt: null,
    lastErrorCode: null
  };
}

export function toGoogleWorkspaceConnectionStatus(
  row: ConnectionRow | null,
  refreshCredentialState: GoogleRefreshCredentialState
) {
  if (!row) return disconnectedGoogleWorkspaceStatus();
  const grantedScopes = row.granted_scopes ?? [];
  const health = deriveGoogleWorkspaceConnectionHealth({
    persistedStatus: row.status,
    grantedScopes,
    refreshCredentialState
  });
  return {
    connected: health.connected,
    status: health.status,
    identity: { email: row.google_email, displayName: row.google_display_name },
    grantedScopes,
    capabilities: health.capabilities,
    isPartialGrant: health.isPartialGrant,
    expiresAt: row.token_expires_at,
    connectedAt: row.connected_at,
    lastRefreshAt: row.last_refresh_at,
    lastErrorCode: health.safeErrorCode ?? row.last_error_code
  } satisfies GoogleWorkspaceConnectionStatus;
}

export async function getGoogleWorkspaceConnectionHealthRecord(
  userId: string,
  companyId: string,
  options: { supabase?: ReturnType<typeof createAdminClient> } = {}
): Promise<GoogleWorkspaceConnectionHealthRecord> {
  const supabase = options.supabase ?? createAdminClient();
  const { data, error } = await supabase
    .from("google_workspace_connections")
    .select(
      "id, google_email, google_display_name, granted_scopes, status, token_expires_at, connected_at, last_refresh_at, last_error_code"
    )
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error("Unable to load Google Workspace connection status.");
  const row = (data as ConnectionRow | null) ?? null;
  if (!row) {
    emitGoogleConnectionDiagnostic({
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
    return { connectionId: null, status: disconnectedGoogleWorkspaceStatus() };
  }

  const secretResponse = await supabase
    .from("google_workspace_connection_secrets")
    .select("refresh_token_encrypted")
    .eq("connection_id", row.id)
    .maybeSingle();
  if (secretResponse.error) {
    throw new Error("Unable to inspect Google Workspace credential status.");
  }
  const credentialPresent = Boolean(secretResponse.data?.refresh_token_encrypted);
  let refreshCredentialState: GoogleRefreshCredentialState = credentialPresent ? "unreadable" : "missing";
  if (secretResponse.data?.refresh_token_encrypted) {
    try {
      const refreshToken = decryptSecret(
        secretResponse.data.refresh_token_encrypted,
        secretContext(row.id),
        getIntegrationSecretKeyring()
      );
      refreshCredentialState = refreshToken.trim() ? "usable" : "missing";
    } catch {
      refreshCredentialState = "unreadable";
    }
  }
  const status = toGoogleWorkspaceConnectionStatus(row, refreshCredentialState);
  emitGoogleConnectionDiagnostic({
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
      required_scopes_granted: hasAllRequiredGoogleWorkspaceScopes(row.granted_scopes ?? [])
    }
  });
  return { connectionId: row.id, status };
}

export async function getGoogleWorkspaceConnectionStatus(
  userId: string,
  companyId: string,
  options: { supabase?: ReturnType<typeof createAdminClient> } = {}
) {
  return (await getGoogleWorkspaceConnectionHealthRecord(userId, companyId, options)).status;
}
