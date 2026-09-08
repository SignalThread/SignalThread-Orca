export type SalesforceConnectionRow = {
  id: string;
  account_id: string;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  scope: string[] | null;
  provider_account_id: string | null;
  updated_at: string | null;
  last_refresh_attempt_at: string | null;
  last_sync_error: string | null;
};

export type SalesforceRefreshTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  instance_url?: string;
  expires_in?: number | string;
  scope?: string | string[];
  error?: string;
  error_description?: string;
};

export type SalesforceConnectionHealthReason =
  | "missing_connection"
  | "reconnect_required"
  | "refresh_failed";

export type SalesforceConnectionSafeDetails = {
  connectionId: string | null;
  provider: "salesforce";
  instanceUrl: string | null;
  expiresAt: string | null;
  hasRefreshToken: boolean;
  lastRefreshAttemptAt: string | null;
  lastSyncError: string | null;
};

export type SalesforceConnectionHealth =
  | {
      ok: true;
      connection: SalesforceConnectionRow & {
        access_token: string;
        refresh_token: string;
        provider_account_id: string;
      };
      refreshed: boolean;
      safeDetails: SalesforceConnectionSafeDetails;
    }
  | {
      ok: false;
      reason: SalesforceConnectionHealthReason;
      message: string;
      safeDetails: SalesforceConnectionSafeDetails;
    };

export type SalesforceConnectionDeps = {
  loadLatestConnection: (accountId: string) => Promise<SalesforceConnectionRow | null>;
  markRefreshAttempt: (connectionId: string, attemptedAt: string) => Promise<void>;
  refreshToken: (
    refreshToken: string
  ) => Promise<
    | { ok: true; payload: SalesforceRefreshTokenResponse }
    | { ok: false; status: number; payload: SalesforceRefreshTokenResponse }
  >;
  persistRefreshedConnection: (
    connectionId: string,
    patch: {
      access_token: string;
      refresh_token: string;
      expires_at: string;
      provider_account_id: string;
      scope: string[];
      last_refresh_attempt_at: string;
      last_sync_error: string | null;
      updated_at: string;
    }
  ) => Promise<SalesforceConnectionRow>;
};

const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const DEFAULT_SALESFORCE_ACCESS_TOKEN_TTL_SECONDS = 2 * 60 * 60;

function normalizeString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeScopeList(...rawScopes: unknown[]): string[] {
  const flattened = rawScopes.flatMap((value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return value.split(/[\s,]+/);
    return [];
  });
  return [...new Set(flattened.map((item) => String(item ?? "").trim()).filter(Boolean))];
}

function computeExpiresAt(expiresIn: unknown): string {
  const parsed = Number(expiresIn);
  const seconds =
    Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_SALESFORCE_ACCESS_TOKEN_TTL_SECONDS;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function shouldRefresh(expiresAtIso: string | null | undefined) {
  if (!expiresAtIso) return true;
  const expiresAt = Date.parse(expiresAtIso);
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt - Date.now() <= EXPIRY_BUFFER_MS;
}

function safeDetails(row: SalesforceConnectionRow | null): SalesforceConnectionSafeDetails {
  return {
    connectionId: row?.id ?? null,
    provider: "salesforce",
    instanceUrl: normalizeString(row?.provider_account_id) ?? null,
    expiresAt: row?.expires_at ?? null,
    hasRefreshToken: Boolean(normalizeString(row?.refresh_token)),
    lastRefreshAttemptAt: row?.last_refresh_attempt_at ?? null,
    lastSyncError: row?.last_sync_error ?? null
  };
}

function reconnectRequired(row: SalesforceConnectionRow | null, message: string): SalesforceConnectionHealth {
  return {
    ok: false,
    reason: row ? "reconnect_required" : "missing_connection",
    message,
    safeDetails: safeDetails(row)
  };
}

function refreshFailed(row: SalesforceConnectionRow | null, message: string): SalesforceConnectionHealth {
  return {
    ok: false,
    reason: "refresh_failed",
    message,
    safeDetails: safeDetails(row)
  };
}

export async function getValidSalesforceConnectionForCompanyWithDeps(
  deps: SalesforceConnectionDeps,
  input: { accountId: string; forceRefresh?: boolean }
): Promise<SalesforceConnectionHealth> {
  const accountId = normalizeString(input.accountId);
  if (!accountId) {
    return reconnectRequired(null, "Missing Salesforce account scope.");
  }

  const row = await deps.loadLatestConnection(accountId);
  if (!row) {
    return reconnectRequired(null, `No Salesforce integration found for account ${accountId}.`);
  }

  const refreshToken = normalizeString(row.refresh_token);
  const instanceUrl = normalizeString(row.provider_account_id);
  const accessToken = normalizeString(row.access_token);

  if (!refreshToken) {
    return reconnectRequired(row, "Salesforce reconnect required: refresh token is missing.");
  }
  if (!instanceUrl) {
    return reconnectRequired(row, "Salesforce reconnect required: instance URL is missing.");
  }

  const needsRefresh = input.forceRefresh || !accessToken || shouldRefresh(row.expires_at);
  if (!needsRefresh) {
    return {
      ok: true,
      connection: {
        ...row,
        access_token: accessToken,
        refresh_token: refreshToken,
        provider_account_id: instanceUrl.replace(/\/+$/, "")
      },
      refreshed: false,
      safeDetails: safeDetails(row)
    };
  }

  const attemptedAt = new Date().toISOString();
  await deps.markRefreshAttempt(row.id, attemptedAt);

  const refreshed = await deps.refreshToken(refreshToken);
  if (!refreshed.ok) {
    const err = normalizeString(refreshed.payload.error);
    const description = normalizeString(refreshed.payload.error_description);
    const message = description ?? err ?? `Salesforce token refresh failed (${refreshed.status}).`;
    if (err === "invalid_grant" || /invalid_grant|revoked/i.test(message)) {
      return reconnectRequired(
        { ...row, last_refresh_attempt_at: attemptedAt, last_sync_error: message },
        `Salesforce reconnect required: ${message}`
      );
    }
    return refreshFailed(
      { ...row, last_refresh_attempt_at: attemptedAt, last_sync_error: message },
      message
    );
  }

  const nextAccessToken = normalizeString(refreshed.payload.access_token);
  if (!nextAccessToken) {
    return refreshFailed(row, "Salesforce refresh succeeded but no access token was returned.");
  }

  const nextRefreshToken = normalizeString(refreshed.payload.refresh_token) ?? refreshToken;
  const nextInstanceUrl = normalizeString(refreshed.payload.instance_url) ?? instanceUrl;
  const nextScope = normalizeScopeList(refreshed.payload.scope);
  const expiresAt = computeExpiresAt(refreshed.payload.expires_in);
  const persisted = await deps.persistRefreshedConnection(row.id, {
    access_token: nextAccessToken,
    refresh_token: nextRefreshToken,
    expires_at: expiresAt,
    provider_account_id: nextInstanceUrl,
    scope: nextScope.length > 0 ? nextScope : row.scope ?? [],
    last_refresh_attempt_at: attemptedAt,
    last_sync_error: null,
    updated_at: new Date().toISOString()
  });

  return {
    ok: true,
    connection: {
      ...persisted,
      access_token: nextAccessToken,
      refresh_token: nextRefreshToken,
      provider_account_id: nextInstanceUrl.replace(/\/+$/, "")
    },
    refreshed: true,
    safeDetails: safeDetails(persisted)
  };
}
