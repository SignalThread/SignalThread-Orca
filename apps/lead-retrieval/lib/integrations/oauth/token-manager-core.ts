/**
 * Provider-neutral OAuth access-token lifecycle engine.
 *
 * Extracted from the Google Workspace token manager so every SignalThread
 * integration OAuth provider shares one implementation of expiry buffering,
 * single-flight refresh leasing, refresh-token rotation, and the
 * `reconnect_required` transition. Providers supply storage and transport
 * through `ProviderTokenManagerDeps`; no provider-specific behaviour lives here.
 */
import { randomUUID } from "node:crypto";

export const PROVIDER_TOKEN_EXPIRY_BUFFER_MS = 5 * 60_000;
export const PROVIDER_REFRESH_LEASE_MS = 30_000;

export type ProviderTokenFailureStage =
  | "connection_lookup"
  | "credential_lookup"
  | "access_token_decryption"
  | "refresh_token_decryption"
  | "expiration_parsing"
  | "refresh_decision"
  | "refresh_lease_acquisition"
  | "provider_refresh_request"
  | "refreshed_credential_persistence";

export type ProviderTokenFailureCategory =
  | "missing_connection"
  | "reconnect_required"
  | "configuration_error"
  | "credential_storage_error"
  | "credential_decryption_error"
  | "invalid_expiration"
  | "refresh_lease_error"
  | "refresh_busy"
  | "provider_refresh_error"
  | "refresh_persistence_error"
  | "internal_error";

export class ProviderTokenManagerStageError extends Error {
  constructor(
    public readonly stage: ProviderTokenFailureStage,
    public readonly category: ProviderTokenFailureCategory,
    public readonly refreshAttempted = false
  ) {
    super("Provider token manager stage failed.");
    this.name = "ProviderTokenManagerStageError";
  }
}

export type ProviderTokenConnection = {
  id: string;
  status: "connected" | "reconnect_required" | "error" | "revocation_pending";
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
  grantedScopes: string[];
};

export type ProviderRefreshResult =
  | {
      ok: true;
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
      scopes?: string[];
      tokenType?: string;
    }
  | { ok: false; status: number; code: string; message: string };

export type ProviderTokenManagerDeps = {
  loadConnection: () => Promise<ProviderTokenConnection | null>;
  acquireRefreshLease: (connectionId: string, leaseToken: string, now: string, until: string) => Promise<boolean>;
  waitForRefreshCompletion: (connectionId: string) => Promise<ProviderTokenConnection | null>;
  refreshToken: (refreshToken: string) => Promise<ProviderRefreshResult>;
  persistRefresh: (
    connection: ProviderTokenConnection,
    leaseToken: string,
    patch: { accessToken: string; refreshToken: string; expiresAt: string; scopes: string[]; tokenType: string | null }
  ) => Promise<ProviderTokenConnection>;
  markReconnectRequired: (connectionId: string, leaseToken: string, code: string) => Promise<void>;
  markRefreshError: (connectionId: string, leaseToken: string, code: string) => Promise<void>;
  releaseRefreshLease: (connectionId: string, leaseToken: string) => Promise<void>;
  now?: () => Date;
  createLeaseToken?: () => string;
};

export type ProviderTokenManagerResult =
  | { ok: true; accessToken: string; expiresAt: string | null; refreshed: boolean; refreshAttempted: boolean }
  | {
      ok: false;
      reason: "missing_connection" | "reconnect_required" | "refresh_failed" | "refresh_busy";
      stage: ProviderTokenFailureStage;
      category: ProviderTokenFailureCategory;
      refreshAttempted: boolean;
    };

function failure(input: {
  reason: "missing_connection" | "reconnect_required" | "refresh_failed" | "refresh_busy";
  stage: ProviderTokenFailureStage;
  category: ProviderTokenFailureCategory;
  refreshAttempted?: boolean;
}): ProviderTokenManagerResult {
  return { ok: false, ...input, refreshAttempted: input.refreshAttempted ?? false };
}

function failureFromError(error: unknown, fallbackStage: ProviderTokenFailureStage, refreshAttempted = false): ProviderTokenManagerResult {
  if (error instanceof ProviderTokenManagerStageError) {
    return failure({
      reason: error.category === "missing_connection" ? "missing_connection" : error.category === "reconnect_required" ? "reconnect_required" : error.category === "refresh_busy" ? "refresh_busy" : "refresh_failed",
      stage: error.stage,
      category: error.category,
      refreshAttempted: error.refreshAttempted
    });
  }
  return failure({ reason: "refresh_failed", stage: fallbackStage, category: "internal_error", refreshAttempted });
}

function usableWithoutRefresh(connection: ProviderTokenConnection, now: Date) {
  if (!connection.accessToken || !connection.expiresAt) return false;
  const expiry = Date.parse(connection.expiresAt);
  return Number.isFinite(expiry) && expiry - now.getTime() > PROVIDER_TOKEN_EXPIRY_BUFFER_MS;
}

export async function getValidProviderAccessTokenWithDeps(
  deps: ProviderTokenManagerDeps,
  options: { forceRefresh?: boolean } = {}
): Promise<ProviderTokenManagerResult> {
  const now = deps.now?.() ?? new Date();
  let connection: ProviderTokenConnection | null;
  try {
    connection = await deps.loadConnection();
  } catch (error) {
    return failureFromError(error, "connection_lookup");
  }
  if (!connection) return failure({ reason: "missing_connection", stage: "connection_lookup", category: "missing_connection" });
  if (connection.status === "reconnect_required" || connection.status === "revocation_pending") {
    return failure({ reason: "reconnect_required", stage: "refresh_decision", category: "reconnect_required" });
  }
  if (connection.expiresAt !== null && !Number.isFinite(Date.parse(connection.expiresAt))) {
    return failure({ reason: "refresh_failed", stage: "expiration_parsing", category: "invalid_expiration" });
  }
  if (!options.forceRefresh && usableWithoutRefresh(connection, now)) {
    return { ok: true, accessToken: connection.accessToken, expiresAt: connection.expiresAt, refreshed: false, refreshAttempted: false };
  }
  if (!connection.refreshToken) {
    return failure({ reason: "reconnect_required", stage: "refresh_decision", category: "reconnect_required" });
  }

  const leaseToken = deps.createLeaseToken?.() ?? randomUUID();
  let acquired: boolean;
  try {
    acquired = await deps.acquireRefreshLease(
      connection.id,
      leaseToken,
      now.toISOString(),
      new Date(now.getTime() + PROVIDER_REFRESH_LEASE_MS).toISOString()
    );
  } catch (error) {
    return failureFromError(error, "refresh_lease_acquisition");
  }
  if (!acquired) {
    let refreshedByPeer: ProviderTokenConnection | null;
    try {
      refreshedByPeer = await deps.waitForRefreshCompletion(connection.id);
    } catch (error) {
      return failureFromError(error, "refresh_lease_acquisition");
    }
    if (refreshedByPeer && usableWithoutRefresh(refreshedByPeer, deps.now?.() ?? new Date())) {
      return {
        ok: true,
        accessToken: refreshedByPeer.accessToken,
        expiresAt: refreshedByPeer.expiresAt,
        refreshed: true,
        refreshAttempted: false
      };
    }
    return failure({ reason: "refresh_busy", stage: "refresh_lease_acquisition", category: "refresh_busy" });
  }

  try {
    let refreshed: ProviderRefreshResult;
    try {
      refreshed = await deps.refreshToken(connection.refreshToken);
    } catch (error) {
      return failureFromError(error, "provider_refresh_request", true);
    }
    if (!refreshed.ok) {
      if (refreshed.code === "invalid_grant") {
        try {
          await deps.markReconnectRequired(connection.id, leaseToken, "invalid_grant");
        } catch (error) {
          return failureFromError(error, "refreshed_credential_persistence", true);
        }
        return failure({ reason: "reconnect_required", stage: "provider_refresh_request", category: "reconnect_required", refreshAttempted: true });
      }
      try {
        await deps.markRefreshError(connection.id, leaseToken, refreshed.code || "refresh_failed");
      } catch (error) {
        return failureFromError(error, "refreshed_credential_persistence", true);
      }
      return failure({ reason: "refresh_failed", stage: "provider_refresh_request", category: "provider_refresh_error", refreshAttempted: true });
    }
    const expiresAt = new Date(now.getTime() + Math.max(60, refreshed.expiresIn ?? 3600) * 1000).toISOString();
    let persisted: ProviderTokenConnection;
    try {
      persisted = await deps.persistRefresh(connection, leaseToken, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken || connection.refreshToken,
        expiresAt,
        scopes: refreshed.scopes?.length ? refreshed.scopes : connection.grantedScopes,
        tokenType: refreshed.tokenType ?? null
      });
    } catch (error) {
      return failureFromError(error, "refreshed_credential_persistence", true);
    }
    return { ok: true, accessToken: persisted.accessToken, expiresAt: persisted.expiresAt, refreshed: true, refreshAttempted: true };
  } finally {
    await deps.releaseRefreshLease(connection.id, leaseToken).catch(() => undefined);
  }
}
