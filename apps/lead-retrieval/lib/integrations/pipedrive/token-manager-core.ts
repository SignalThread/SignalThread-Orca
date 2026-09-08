import { randomUUID } from "node:crypto";

export const PIPEDRIVE_TOKEN_EXPIRY_BUFFER_MS = 5 * 60_000;
export const PIPEDRIVE_REFRESH_LEASE_MS = 30_000;

export class PipedriveTokenManagerError extends Error {
  constructor(
    public readonly code: "not_connected" | "reconnect_required" | "persistence_failed"
  ) {
    super("Pipedrive token manager failed.");
    this.name = "PipedriveTokenManagerError";
  }
}

export type PipedriveTokenConnection = {
  id: string;
  status: "connected" | "error" | "reconnect_required" | "revocation_pending";
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
  scopes: string[];
  apiDomain: string;
  credentialVersion: number;
};

export type PipedriveTokenManagerResult =
  | {
      ok: true;
      accessToken: string;
      apiDomain: string;
      expiresAt: string | null;
      refreshed: boolean;
    }
  | {
      ok: false;
      code:
        | "not_connected"
        | "reconnect_required"
        | "refresh_busy"
        | "refresh_failed"
        | "persistence_failed";
      refreshAttempted: boolean;
    };

export type PipedriveTokenManagerDeps = {
  loadConnection: () => Promise<PipedriveTokenConnection | null>;
  acquireRefreshLease: (
    connectionId: string,
    leaseToken: string,
    now: string,
    until: string
  ) => Promise<boolean>;
  waitForRefresh: (connectionId: string) => Promise<PipedriveTokenConnection | null>;
  refreshToken: (refreshToken: string) => Promise<{
    ok: boolean;
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    scopes?: string[];
    apiDomain?: string;
    errorCode?: string;
  }>;
  persistRefresh: (
    connection: PipedriveTokenConnection,
    leaseToken: string,
    patch: {
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
      scopes: string[];
      apiDomain: string;
    }
  ) => Promise<PipedriveTokenConnection | null>;
  markFailure: (
    connectionId: string,
    leaseToken: string,
    reconnectRequired: boolean,
    errorCode: string
  ) => Promise<void>;
  releaseRefreshLease: (connectionId: string, leaseToken: string) => Promise<void>;
  now?: () => Date;
  createLeaseToken?: () => string;
};

function isUsable(connection: PipedriveTokenConnection, now: Date) {
  if (!connection.accessToken || !connection.apiDomain || !connection.expiresAt) return false;
  const expiry = Date.parse(connection.expiresAt);
  return Number.isFinite(expiry) && expiry - now.getTime() > PIPEDRIVE_TOKEN_EXPIRY_BUFFER_MS;
}

export async function getValidPipedriveAccessTokenWithDeps(
  deps: PipedriveTokenManagerDeps,
  options: { forceRefresh?: boolean } = {}
): Promise<PipedriveTokenManagerResult> {
  let connection: PipedriveTokenConnection | null;
  try {
    connection = await deps.loadConnection();
  } catch (error) {
    return {
      ok: false,
      code: error instanceof PipedriveTokenManagerError ? error.code : "persistence_failed",
      refreshAttempted: false
    };
  }
  if (!connection) return { ok: false, code: "not_connected", refreshAttempted: false };
  if (connection.status === "reconnect_required" || connection.status === "revocation_pending") {
    return { ok: false, code: "reconnect_required", refreshAttempted: false };
  }

  const now = deps.now?.() ?? new Date();
  if (!options.forceRefresh && isUsable(connection, now)) {
    return {
      ok: true,
      accessToken: connection.accessToken,
      apiDomain: connection.apiDomain,
      expiresAt: connection.expiresAt,
      refreshed: false
    };
  }
  if (!connection.refreshToken) {
    return { ok: false, code: "reconnect_required", refreshAttempted: false };
  }

  const leaseToken = deps.createLeaseToken?.() ?? randomUUID();
  let acquired = false;
  try {
    acquired = await deps.acquireRefreshLease(
      connection.id,
      leaseToken,
      now.toISOString(),
      new Date(now.getTime() + PIPEDRIVE_REFRESH_LEASE_MS).toISOString()
    );
    if (!acquired) {
      const peer = await deps.waitForRefresh(connection.id);
      if (peer && isUsable(peer, deps.now?.() ?? new Date())) {
        return {
          ok: true,
          accessToken: peer.accessToken,
          apiDomain: peer.apiDomain,
          expiresAt: peer.expiresAt,
          refreshed: true
        };
      }
      return { ok: false, code: "refresh_busy", refreshAttempted: false };
    }

    let refreshed: Awaited<ReturnType<PipedriveTokenManagerDeps["refreshToken"]>>;
    try {
      refreshed = await deps.refreshToken(connection.refreshToken);
    } catch {
      await deps.markFailure(
        connection.id,
        leaseToken,
        false,
        "provider_refresh_failed"
      ).catch(() => undefined);
      return { ok: false, code: "refresh_failed", refreshAttempted: true };
    }
    if (!refreshed.ok || !refreshed.accessToken) {
      const reconnect = refreshed.errorCode === "invalid_grant";
      await deps.markFailure(
        connection.id,
        leaseToken,
        reconnect,
        refreshed.errorCode ?? "refresh_failed"
      );
      return {
        ok: false,
        code: reconnect ? "reconnect_required" : "refresh_failed",
        refreshAttempted: true
      };
    }

    const patch = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || connection.refreshToken,
      expiresAt: new Date(
        now.getTime() + Math.max(60, Number(refreshed.expiresIn) || 3600) * 1000
      ).toISOString(),
      scopes: refreshed.scopes?.length ? refreshed.scopes : connection.scopes,
      apiDomain: refreshed.apiDomain || connection.apiDomain
    };
    const persisted = await deps.persistRefresh(connection, leaseToken, patch);
    if (!persisted) {
      return { ok: false, code: "persistence_failed", refreshAttempted: true };
    }
    return {
      ok: true,
      accessToken: persisted.accessToken,
      apiDomain: persisted.apiDomain,
      expiresAt: persisted.expiresAt,
      refreshed: true
    };
  } catch {
    return { ok: false, code: "refresh_failed", refreshAttempted: acquired };
  } finally {
    if (acquired) await deps.releaseRefreshLease(connection.id, leaseToken).catch(() => undefined);
  }
}
