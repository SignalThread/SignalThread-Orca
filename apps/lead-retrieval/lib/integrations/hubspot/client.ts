import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type IntegrationRow = {
  id: string;
  account_id: string;
  provider: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scope: string[] | null;
  provider_account_id: string | null;
};

type HubSpotRefreshResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string | string[];
  scopes?: string | string[];
  hub_id?: string | number;
  message?: string;
  [key: string]: unknown;
};

const HUBSPOT_OAUTH_TOKEN_ENDPOINT = "https://api.hubapi.com/oauth/v1/token";
const HUBSPOT_API_BASE_URL = "https://api.hubapi.com";
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export class HubSpotIntegrationError extends Error {
  readonly code:
    | "MISSING_ENV"
    | "MISSING_INTEGRATION"
    | "MISSING_REFRESH_TOKEN"
    | "TOKEN_REFRESH_FAILED"
    | "TOKEN_REFRESH_INVALID"
    | "HUBSPOT_HTTP_ERROR";
  readonly status?: number;

  constructor(
    code: HubSpotIntegrationError["code"],
    message: string,
    options?: { status?: number; cause?: unknown }
  ) {
    super(message);
    this.name = "HubSpotIntegrationError";
    this.code = code;
    this.status = options?.status;
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

function getHubSpotOAuthEnv() {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new HubSpotIntegrationError(
      "MISSING_ENV",
      "Missing HUBSPOT_CLIENT_ID or HUBSPOT_CLIENT_SECRET."
    );
  }

  return { clientId, clientSecret };
}

function normalizeScopeList(...rawScopes: unknown[]): string[] {
  const flattened = rawScopes.flatMap((value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return value.split(/[\s,]+/);
    return [];
  });

  return [...new Set(flattened.map((item) => String(item ?? "").trim()).filter(Boolean))];
}

function computeExpiresAt(expiresIn: unknown): string | null {
  const seconds = Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function shouldRefresh(expiresAtIso: string | null | undefined) {
  if (!expiresAtIso) {
    return true;
  }

  const expiresAt = new Date(expiresAtIso).getTime();
  if (!Number.isFinite(expiresAt)) {
    return true;
  }

  return expiresAt - Date.now() <= EXPIRY_BUFFER_MS;
}

function resolveHubSpotUrl(path: string) {
  const trimmed = String(path ?? "").trim();
  if (!trimmed) {
    throw new HubSpotIntegrationError("HUBSPOT_HTTP_ERROR", "HubSpot request path is required.");
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `${HUBSPOT_API_BASE_URL}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
}

async function loadIntegrationRow(accountId: string): Promise<IntegrationRow> {
  const normalizedAccountId = String(accountId ?? "").trim();
  if (!normalizedAccountId) {
    throw new HubSpotIntegrationError("MISSING_INTEGRATION", "accountId is required.");
  }

  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("integrations")
    .select(
      "id, account_id, provider, access_token, refresh_token, expires_at, scope, provider_account_id"
    )
    .eq("account_id", normalizedAccountId)
    .eq("provider", "hubspot")
    .maybeSingle();

  if (error) {
    throw new HubSpotIntegrationError(
      "MISSING_INTEGRATION",
      error.message ?? "Failed to load HubSpot integration.",
      { cause: error }
    );
  }

  if (!data) {
    throw new HubSpotIntegrationError(
      "MISSING_INTEGRATION",
      `No HubSpot integration found for account ${normalizedAccountId}.`
    );
  }

  return data as IntegrationRow;
}

export async function getHubSpotIntegration(accountId: string) {
  return loadIntegrationRow(accountId);
}

export async function refreshHubSpotAccessToken(accountId: string) {
  const integration = await loadIntegrationRow(accountId);

  if (!integration.refresh_token) {
    throw new HubSpotIntegrationError(
      "MISSING_REFRESH_TOKEN",
      `HubSpot integration for account ${integration.account_id} does not have a refresh token.`
    );
  }

  const { clientId, clientSecret } = getHubSpotOAuthEnv();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: integration.refresh_token,
  });

  const response = await fetch(HUBSPOT_OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as HubSpotRefreshResponse;

  if (!response.ok) {
    const message =
      typeof payload.message === "string" && payload.message.trim().length > 0
        ? payload.message
        : "HubSpot refresh token exchange failed.";

    throw new HubSpotIntegrationError("TOKEN_REFRESH_FAILED", message, {
      status: response.status,
      cause: payload,
    });
  }

  const nextAccessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!nextAccessToken) {
    throw new HubSpotIntegrationError(
      "TOKEN_REFRESH_INVALID",
      "HubSpot refresh succeeded but no access token was returned.",
      { cause: payload }
    );
  }

  const nextRefreshToken =
    typeof payload.refresh_token === "string" && payload.refresh_token.trim().length > 0
      ? payload.refresh_token
      : integration.refresh_token;

  const nextExpiresAt = computeExpiresAt(payload.expires_in);
  const nextScope = normalizeScopeList(payload.scope, payload.scopes);
  const nextProviderAccountId =
    payload.hub_id !== undefined && payload.hub_id !== null
      ? String(payload.hub_id)
      : integration.provider_account_id;

  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("integrations")
    .update({
      access_token: nextAccessToken,
      refresh_token: nextRefreshToken,
      expires_at: nextExpiresAt,
      scope: nextScope.length > 0 ? nextScope : integration.scope ?? [],
      provider_account_id: nextProviderAccountId,
      updated_at: new Date().toISOString(),
    })
    .eq("account_id", integration.account_id)
    .eq("provider", "hubspot")
    .select(
      "id, account_id, provider, access_token, refresh_token, expires_at, scope, provider_account_id"
    )
    .single();

  if (error || !data) {
    throw new HubSpotIntegrationError(
      "TOKEN_REFRESH_FAILED",
      error?.message ?? "Failed to persist refreshed HubSpot token.",
      { cause: error }
    );
  }

  return data as IntegrationRow;
}

export async function getValidHubSpotAccessToken(accountId: string) {
  const integration = await loadIntegrationRow(accountId);

  if (shouldRefresh(integration.expires_at)) {
    const refreshed = await refreshHubSpotAccessToken(accountId);
    return refreshed.access_token;
  }

  return integration.access_token;
}

export async function hubSpotFetch(accountId: string, path: string, init?: RequestInit) {
  const url = resolveHubSpotUrl(path);

  const attempt = async (token: string) => {
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

  let token = await getValidHubSpotAccessToken(accountId);
  let response = await attempt(token);

  if (response.status === 401) {
    token = (await refreshHubSpotAccessToken(accountId)).access_token;
    response = await attempt(token);
  }

  if (!response.ok) {
    let details = "";
    try {
      details = await response.text();
    } catch {
      details = "";
    }

    throw new HubSpotIntegrationError(
      "HUBSPOT_HTTP_ERROR",
      `HubSpot API request failed (${response.status}${details ? `): ${details}` : ")"}`,
      { status: response.status }
    );
  }

  return response;
}
