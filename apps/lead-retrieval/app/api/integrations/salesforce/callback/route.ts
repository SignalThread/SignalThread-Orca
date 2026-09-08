import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CookieOptions } from "@supabase/ssr";

const SALESFORCE_TOKEN_URL = "https://login.salesforce.com/services/oauth2/token";
const STATE_COOKIE_NAME = "salesforce_oauth_state";
const CODE_VERIFIER_COOKIE_NAME = "salesforce_code_verifier";

export const runtime = "nodejs";

type SalesforceTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  instance_url?: string;
  scope?: string | string[];
  token_type?: string;
  expires_in?: number | string;
  issued_at?: string;
  signature?: string;
  error?: string;
  error_description?: string;
};

function normalizeScopeList(rawScope: unknown): string[] {
  if (Array.isArray(rawScope)) {
    return [...new Set(rawScope.map((value) => String(value ?? "").trim()).filter(Boolean))];
  }
  if (typeof rawScope === "string") {
    return [...new Set(rawScope.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean))];
  }
  return [];
}

function resolveExpiresAt(expiresIn: unknown) {
  const parsed = Number(expiresIn);
  const seconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 2 * 60 * 60;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function clearPkceCookie(response: NextResponse) {
  const cookieOptions = getPkceCookieOptions();
  response.cookies.set(STATE_COOKIE_NAME, "", {
    ...cookieOptions,
    maxAge: 0,
  });
  response.cookies.set(CODE_VERIFIER_COOKIE_NAME, "", {
    ...cookieOptions,
    maxAge: 0,
  });
  return response;
}

function getPkceCookieOptions(): CookieOptions {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/api/integrations/salesforce"
  };
}

function resolveRedirectUri(request: NextRequest) {
  const configured = process.env.SALESFORCE_REDIRECT_URI?.trim() ?? "";
  if (!configured) return { redirectUri: null, hostMismatch: false, configuredHost: null, requestHost: request.nextUrl.host };

  try {
    const configuredUrl = new URL(configured);
    const requestOrigin = request.nextUrl.origin;
    const requestHost = request.nextUrl.host;
    const hostMismatch = configuredUrl.host !== requestHost;
    const callbackPath = `${configuredUrl.pathname}${configuredUrl.search}`;
    const runtimeRedirectUri = `${requestOrigin}${callbackPath}`;

    return {
      redirectUri: hostMismatch ? runtimeRedirectUri : configuredUrl.toString(),
      hostMismatch,
      configuredHost: configuredUrl.host,
      requestHost
    };
  } catch {
    return { redirectUri: configured, hostMismatch: false, configuredHost: null, requestHost: request.nextUrl.host };
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim();
  const cookieStore = await cookies();
  const oauthState = cookieStore.get("salesforce_oauth_state")?.value ?? null;
  const codeVerifier = cookieStore.get("salesforce_code_verifier")?.value ?? null;
  console.log("[salesforce/callback] pkce cookie presence", {
    hasStateCookie: Boolean(oauthState),
    hasCodeVerifierCookie: Boolean(codeVerifier),
    host: request.nextUrl.host
  });

  if (!code) {
    return NextResponse.json({ error: "Missing code." }, { status: 400 });
  }
  if (!codeVerifier) {
    return NextResponse.json({ error: "Missing PKCE code verifier." }, { status: 400 });
  }

  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser?.id) {
    return clearPkceCookie(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }
  if (!sessionUser.company_id) {
    return clearPkceCookie(
      NextResponse.json({ error: "User is not associated to an account." }, { status: 400 })
    );
  }

  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
  const redirectResolution = resolveRedirectUri(request);
  const redirectUri = redirectResolution.redirectUri;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: "Missing Salesforce OAuth environment configuration." },
      { status: 500 }
    );
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
    code_verifier: codeVerifier
  });

  console.log("[salesforce/callback] redirect URI resolution", {
    redirectUri,
    redirectHostMismatch: redirectResolution.hostMismatch,
    configuredRedirectHost: redirectResolution.configuredHost,
    requestHost: redirectResolution.requestHost
  });

  const tokenResponse = await fetch(SALESFORCE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body,
    cache: "no-store"
  });

  const payload = (await tokenResponse.json().catch(() => ({}))) as SalesforceTokenResponse;

  if (!tokenResponse.ok || payload.error) {
    return clearPkceCookie(
      NextResponse.json(
      {
        error:
          payload.error_description ??
          payload.error ??
          `Salesforce token exchange failed (${tokenResponse.status}).`
      },
      { status: 400 }
      )
    );
  }

  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!accessToken) {
    return clearPkceCookie(
      NextResponse.json(
        { error: "Salesforce token exchange returned no access token." },
        { status: 502 }
      )
    );
  }

  const refreshToken =
    typeof payload.refresh_token === "string" ? payload.refresh_token : null;
  const scope = normalizeScopeList(payload.scope);
  const issuedAt = typeof payload.issued_at === "string" ? payload.issued_at : null;
  const instanceUrl = typeof payload.instance_url === "string" ? payload.instance_url : null;

  const supabase = createAdminClient();
  const persistencePayload: Record<string, unknown> = {
    account_id: sessionUser.company_id,
    provider: "salesforce",
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: resolveExpiresAt(payload.expires_in),
    scope,
    provider_account_id: instanceUrl,
    updated_at: new Date().toISOString(),
    issued_at: issuedAt
  };

  let persistenceError: any = null;
  const primaryUpsert = await (supabase as any)
    .from("integrations")
    .upsert(persistencePayload, { onConflict: "account_id,provider" });
  persistenceError = primaryUpsert.error;

  if (persistenceError && String(persistenceError.message ?? "").includes("issued_at")) {
    delete persistencePayload.issued_at;
    const fallbackUpsert = await (supabase as any)
      .from("integrations")
      .upsert(persistencePayload, { onConflict: "account_id,provider" });
    persistenceError = fallbackUpsert.error;
  }

  if (persistenceError) {
    return clearPkceCookie(
      NextResponse.json({ error: "Failed to save Salesforce connection." }, { status: 500 })
    );
  }

  const redirectUrl = new URL("/admin/integrations/salesforce?salesforce=connected", request.url);
  console.log("[salesforce/callback] redirecting after successful save", {
    target: redirectUrl.toString()
  });
  return clearPkceCookie(NextResponse.redirect(redirectUrl));
}
