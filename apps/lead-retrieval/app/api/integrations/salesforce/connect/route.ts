import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions } from "@supabase/ssr";

const DEFAULT_SALESFORCE_AUTHORIZE_URL =
  "https://login.salesforce.com/services/oauth2/authorize";
const STATE_COOKIE_NAME = "salesforce_oauth_state";
const CODE_VERIFIER_COOKIE_NAME = "salesforce_code_verifier";

export const runtime = "nodejs";

function toBase64Url(value: Buffer) {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createCodeVerifier() {
  return toBase64Url(randomBytes(64));
}

function createState() {
  return toBase64Url(randomBytes(32));
}

function createCodeChallenge(codeVerifier: string) {
  return toBase64Url(createHash("sha256").update(codeVerifier).digest());
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
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const redirectResolution = resolveRedirectUri(request);
  const redirectUri = redirectResolution.redirectUri;
  const authorizeBase =
    process.env.SALESFORCE_AUTHORIZE_URL?.trim() || DEFAULT_SALESFORCE_AUTHORIZE_URL;
  const cookieOptions = getPkceCookieOptions();

  if (!clientId) {
    return NextResponse.json(
      { error: "Missing SALESFORCE_CLIENT_ID." },
      { status: 500 }
    );
  }

  if (!redirectUri) {
    return NextResponse.json(
      { error: "Missing SALESFORCE_REDIRECT_URI." },
      { status: 500 }
    );
  }

  if (!authorizeBase) {
    return NextResponse.json(
      { error: "Missing SALESFORCE_AUTHORIZE_URL." },
      { status: 500 }
    );
  }

  const state = createState();
  const codeVerifier = createCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);
  const triggerSource = request.nextUrl.searchParams.get("source") ?? "unknown";
  const referer = request.headers.get("referer") ?? "none";
  console.log("[salesforce/connect] generated PKCE state and verifier", {
    source: triggerSource,
    referer,
    redirectUri,
    redirectHostMismatch: redirectResolution.hostMismatch,
    configuredRedirectHost: redirectResolution.configuredHost,
    requestHost: redirectResolution.requestHost
  });

  const authorizeUrl = new URL(authorizeBase);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "api refresh_token");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authorizeUrl, 302);
  response.cookies.set(STATE_COOKIE_NAME, state, cookieOptions);
  response.cookies.set(CODE_VERIFIER_COOKIE_NAME, codeVerifier, cookieOptions);
  console.log("[salesforce/connect] attached oauth cookies to redirect response", {
    source: triggerSource,
    cookieOptions
  });
  return response;
}
