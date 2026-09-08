import { NextRequest, NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const HUBSPOT_TOKEN_ENDPOINT = "https://api.hubapi.com/oauth/v1/token";
const HUBSPOT_TOKEN_INFO_ENDPOINT = "https://api.hubapi.com/oauth/v1/access-tokens";
const CONNECTED_REDIRECT_PATH = "/app?hubspot=connected";

type HubSpotTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string | string[];
  scopes?: string | string[];
  hub_id?: number | string;
  [key: string]: unknown;
};

type HubSpotTokenInfoResponse = {
  hub_id?: number | string;
  [key: string]: unknown;
};

function normalizeScopeList(...rawScopes: unknown[]): string[] {
  const flattened = rawScopes.flatMap((value) => {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === "string") {
      return value.split(/[\s,]+/);
    }
    return [];
  });

  return [...new Set(flattened.map((item) => String(item ?? "").trim()).filter(Boolean))];
}

function resolveExpiresAt(expiresIn: unknown): string | null {
  const seconds = Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function resolveProviderAccountId(accessToken: string, fallback: unknown) {
  if (fallback) {
    return String(fallback);
  }

  const response = await fetch(`${HUBSPOT_TOKEN_INFO_ENDPOINT}/${encodeURIComponent(accessToken)}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as HubSpotTokenInfoResponse;
  return payload.hub_id ? String(payload.hub_id) : null;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!sessionUser.company_id) {
    return NextResponse.json({ error: "User is not associated to an account." }, { status: 400 });
  }

  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: "Missing HubSpot OAuth environment variables" },
      { status: 500 }
    );
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });

  const tokenResponse = await fetch(HUBSPOT_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });

  const tokenPayload = (await tokenResponse.json()) as HubSpotTokenResponse;
  console.info("[hubspot/callback] token payload keys", Object.keys(tokenPayload ?? {}));

  if (!tokenResponse.ok) {
    const message =
      typeof tokenPayload?.message === "string"
        ? tokenPayload.message
        : "HubSpot token exchange failed.";

    return NextResponse.json({ error: message }, { status: tokenResponse.status });
  }

  const accessToken = typeof tokenPayload.access_token === "string" ? tokenPayload.access_token : "";
  if (!accessToken) {
    return NextResponse.json({ error: "HubSpot token exchange returned no access token." }, { status: 502 });
  }

  const refreshToken = typeof tokenPayload.refresh_token === "string" ? tokenPayload.refresh_token : null;
  const providerAccountId = await resolveProviderAccountId(accessToken, tokenPayload.hub_id);

  const supabase = createAdminClient();
  const { error: persistenceError } = await (supabase as any)
    .from("integrations")
    .upsert(
      {
        account_id: sessionUser.company_id,
        provider: "hubspot",
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: resolveExpiresAt(tokenPayload.expires_in),
        scope: normalizeScopeList(tokenPayload.scope, tokenPayload.scopes),
        provider_account_id: providerAccountId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,provider" }
    );

  if (persistenceError) {
    console.error("[hubspot/callback] integration persistence failed", {
      accountId: sessionUser.company_id,
      code: persistenceError.code,
      message: persistenceError.message,
      details: persistenceError.details,
      hint: persistenceError.hint,
    });

    return NextResponse.json({ error: "Failed to save HubSpot connection." }, { status: 500 });
  }

  const redirectUrl = new URL(CONNECTED_REDIRECT_PATH, request.url);
  return NextResponse.redirect(redirectUrl);
}
