import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getValidSalesforceConnectionForCompanyWithDeps as runSalesforceConnectionHealth
} from "@/lib/integrations/salesforce/connection-health-core";

type SalesforceIntegrationRow = {
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

type SalesforceQueryResponse = {
  records?: Array<Record<string, unknown>>;
};

type SalesforceRefreshTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  instance_url?: string;
  expires_in?: number | string;
  scope?: string | string[];
  error?: string;
  error_description?: string;
};

type SalesforceConnectionHealthReason =
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
      connection: SalesforceIntegrationRow & {
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

type SalesforceConnectionDeps = {
  loadLatestConnection: (accountId: string) => Promise<SalesforceIntegrationRow | null>;
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
  ) => Promise<SalesforceIntegrationRow>;
};

const SALESFORCE_TOKEN_URL = "https://login.salesforce.com/services/oauth2/token";
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const DEFAULT_SALESFORCE_ACCESS_TOKEN_TTL_SECONDS = 2 * 60 * 60;

export type SalesforceLeadLookupInput = {
  accountId: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  limit?: number;
};

export type SalesforceLeadLookupResult = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  email: string | null;
  company: string | null;
  title: string | null;
  status: string | null;
  createdAt: string | null;
  lastModifiedAt: string | null;
};

export class SalesforceIntegrationError extends Error {
  readonly code:
    | "MISSING_ACCOUNT"
    | "MISSING_INTEGRATION"
    | "MISSING_TOKEN"
    | "MISSING_ENV"
    | "RECONNECT_REQUIRED"
    | "TOKEN_REFRESH_FAILED"
    | "INVALID_QUERY"
    | "HTTP_ERROR";
  readonly status?: number;

  constructor(
    code: SalesforceIntegrationError["code"],
    message: string,
    options?: { status?: number; cause?: unknown }
  ) {
    super(message);
    this.name = "SalesforceIntegrationError";
    this.code = code;
    this.status = options?.status;
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

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

function safeDetails(row: SalesforceIntegrationRow | null): SalesforceConnectionSafeDetails {
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

function reconnectRequired(row: SalesforceIntegrationRow | null, message: string): SalesforceConnectionHealth {
  return {
    ok: false,
    reason: row ? "reconnect_required" : "missing_connection",
    message,
    safeDetails: safeDetails(row)
  };
}

function refreshFailed(row: SalesforceIntegrationRow | null, message: string): SalesforceConnectionHealth {
  return {
    ok: false,
    reason: "refresh_failed",
    message,
    safeDetails: safeDetails(row)
  };
}

function getSalesforceOAuthEnv() {
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new SalesforceIntegrationError(
      "MISSING_ENV",
      "Missing Salesforce OAuth client configuration."
    );
  }
  return { clientId, clientSecret };
}

function escapeSoqlLiteral(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function loadLatestSalesforceIntegration(accountId: string) {
  const normalizedAccountId = normalizeString(accountId);
  if (!normalizedAccountId) {
    throw new SalesforceIntegrationError("MISSING_ACCOUNT", "accountId is required.");
  }

  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("integrations")
    .select(
      "id, account_id, provider, access_token, refresh_token, expires_at, scope, provider_account_id, updated_at, last_refresh_attempt_at, last_sync_error"
    )
    .eq("account_id", normalizedAccountId)
    .eq("provider", "salesforce")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new SalesforceIntegrationError(
      "MISSING_INTEGRATION",
      error.message ?? "Failed to load Salesforce integration.",
      { cause: error }
    );
  }

  return (data as SalesforceIntegrationRow | null) ?? null;
}

function defaultSalesforceConnectionDeps(): SalesforceConnectionDeps {
  const supabase = createAdminClient();
  return {
    loadLatestConnection: loadLatestSalesforceIntegration,
    markRefreshAttempt: async (connectionId, attemptedAt) => {
      await (supabase as any)
        .from("integrations")
        .update({
          last_refresh_attempt_at: attemptedAt,
          updated_at: attemptedAt
        })
        .eq("id", connectionId);
    },
    refreshToken: async (refreshToken) => {
      const { clientId, clientSecret } = getSalesforceOAuthEnv();
      const response = await fetch(SALESFORCE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken
        }).toString(),
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => ({}))) as SalesforceRefreshTokenResponse;
      return response.ok && !payload.error
        ? { ok: true, payload }
        : { ok: false, status: response.status, payload };
    },
    persistRefreshedConnection: async (connectionId, patch) => {
      const { data, error } = await (supabase as any)
        .from("integrations")
        .update(patch)
        .eq("id", connectionId)
        .select(
          "id, account_id, provider, access_token, refresh_token, expires_at, scope, provider_account_id, updated_at, last_refresh_attempt_at, last_sync_error"
        )
        .single();

      if (error || !data) {
        throw new SalesforceIntegrationError(
          "TOKEN_REFRESH_FAILED",
          error?.message ?? "Failed to persist refreshed Salesforce token.",
          { cause: error }
        );
      }
      return data as SalesforceIntegrationRow;
    }
  };
}

export async function getValidSalesforceConnectionForCompanyWithDeps(
  deps: SalesforceConnectionDeps,
  input: { accountId: string; forceRefresh?: boolean }
): Promise<SalesforceConnectionHealth> {
  try {
    return await runSalesforceConnectionHealth(deps, input);
  } catch (error) {
    if (error instanceof SalesforceIntegrationError && error.code === "MISSING_ENV") {
      return {
        ok: false,
        reason: "refresh_failed",
        message: error.message,
        safeDetails: {
          connectionId: null,
          provider: "salesforce",
          instanceUrl: null,
          expiresAt: null,
          hasRefreshToken: false,
          lastRefreshAttemptAt: null,
          lastSyncError: null
        }
      };
    }
    throw error;
  }
}

export async function getValidSalesforceConnectionForCompany(
  accountId: string,
  options: { forceRefresh?: boolean } = {}
) {
  return getValidSalesforceConnectionForCompanyWithDeps(defaultSalesforceConnectionDeps(), {
    accountId,
    forceRefresh: options.forceRefresh
  });
}

export async function getSalesforceIntegration(accountId: string) {
  const result = await getValidSalesforceConnectionForCompany(accountId);
  if (!result.ok) {
    throw new SalesforceIntegrationError(
      result.reason === "missing_connection" ? "MISSING_INTEGRATION" : "RECONNECT_REQUIRED",
      result.message
    );
  }
  return result.connection;
}

async function recordSalesforceSyncError(accountId: string, message: string) {
  const row = await loadLatestSalesforceIntegration(accountId).catch(() => null);
  if (!row) return;
  await (createAdminClient() as any)
    .from("integrations")
    .update({
      last_sync_error: message,
      updated_at: new Date().toISOString()
    })
    .eq("id", row.id);
}

export async function salesforceFetch(accountId: string, path: string, init?: RequestInit) {
  const trimmedPath = String(path ?? "").trim();
  if (!trimmedPath) {
    throw new SalesforceIntegrationError("HTTP_ERROR", "Salesforce request path is required.");
  }

  const runRequest = async (token: string, instanceUrl: string) => {
    const url = `${instanceUrl.replace(/\/+$/, "")}${trimmedPath.startsWith("/") ? trimmedPath : `/${trimmedPath}`}`;
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }
    return fetch(url, {
      ...init,
      headers,
      cache: "no-store",
    });
  };

  const connection = await getValidSalesforceConnectionForCompany(accountId);
  if (!connection.ok) {
    throw new SalesforceIntegrationError(
      connection.reason === "missing_connection" ? "MISSING_INTEGRATION" : "RECONNECT_REQUIRED",
      connection.message
    );
  }

  let activeConnection = connection.connection;
  let response = await runRequest(activeConnection.access_token, activeConnection.provider_account_id);

  if (response.status === 401) {
    const refreshed = await getValidSalesforceConnectionForCompany(accountId, { forceRefresh: true });
    if (refreshed.ok) {
      activeConnection = refreshed.connection;
      response = await runRequest(activeConnection.access_token, activeConnection.provider_account_id);
    } else {
      throw new SalesforceIntegrationError("RECONNECT_REQUIRED", refreshed.message, { status: 401 });
    }
  }

  if (!response.ok) {
    let details = "";
    try {
      const payload = await response.json();
      details = typeof payload?.[0]?.message === "string"
        ? payload[0].message
        : typeof payload?.message === "string"
          ? payload.message
          : JSON.stringify(payload);
    } catch {
      details = await response.text();
    }

    const message = `Salesforce API request failed (${response.status}${details ? `): ${details}` : ")"}`;
    await recordSalesforceSyncError(accountId, message).catch(() => undefined);
    throw new SalesforceIntegrationError(
      "HTTP_ERROR",
      message,
      { status: response.status }
    );
  }

  return response;
}

function toNullableString(value: unknown) {
  const normalized = normalizeString(value);
  return normalized ?? null;
}

function buildLookupWhereClause(input: SalesforceLeadLookupInput) {
  const email = normalizeString(input.email);
  const firstName = normalizeString(input.firstName);
  const lastName = normalizeString(input.lastName);
  const company = normalizeString(input.company);

  const clauses: string[] = [];

  if (email) {
    clauses.push(`Email = '${escapeSoqlLiteral(email)}'`);
  }
  if (firstName) {
    clauses.push(`FirstName LIKE '%${escapeSoqlLiteral(firstName)}%'`);
  }
  if (lastName) {
    clauses.push(`LastName LIKE '%${escapeSoqlLiteral(lastName)}%'`);
  }
  if (company) {
    clauses.push(`Company LIKE '%${escapeSoqlLiteral(company)}%'`);
  }

  if (clauses.length === 0) {
    throw new SalesforceIntegrationError(
      "INVALID_QUERY",
      "At least one lookup value (email, firstName, lastName, company) is required."
    );
  }

  return clauses.join(" AND ");
}

export async function lookupSalesforceLeads(input: SalesforceLeadLookupInput) {
  const whereClause = buildLookupWhereClause(input);
  const limit = Number.isFinite(Number(input.limit))
    ? Math.min(Math.max(Number(input.limit), 1), 20)
    : 10;

  const soql = [
    "SELECT Id, FirstName, LastName, Name, Email, Company, Title, Status, CreatedDate, LastModifiedDate",
    "FROM Lead",
    `WHERE ${whereClause}`,
    "ORDER BY LastModifiedDate DESC",
    `LIMIT ${limit}`
  ].join(" ");

  const response = await salesforceFetch(
    input.accountId,
    `/services/data/v60.0/query?q=${encodeURIComponent(soql)}`,
    { method: "GET" }
  );

  const payload = (await response.json().catch(() => ({}))) as SalesforceQueryResponse;
  const records = Array.isArray(payload.records) ? payload.records : [];

  return records
    .map((record) => ({
      id: toNullableString(record.Id),
      firstName: toNullableString(record.FirstName),
      lastName: toNullableString(record.LastName),
      fullName: toNullableString(record.Name),
      email: toNullableString(record.Email),
      company: toNullableString(record.Company),
      title: toNullableString(record.Title),
      status: toNullableString(record.Status),
      createdAt: toNullableString(record.CreatedDate),
      lastModifiedAt: toNullableString(record.LastModifiedDate),
    }))
    .filter((record): record is SalesforceLeadLookupResult => Boolean(record.id));
}
