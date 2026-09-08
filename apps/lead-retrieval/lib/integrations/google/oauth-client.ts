import "server-only";

import { createRemoteJWKSet, jwtVerify } from "jose";
import { GOOGLE_WORKSPACE_SCOPES } from "@/lib/integrations/google/scopes";
import { getGoogleOAuthAuthorizationAccessParameters } from "@/lib/integrations/google/oauth-refresh-credential-core";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export type GoogleTokenPayload = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

export type GoogleIdentity = {
  subject: string;
  email: string;
  displayName: string | null;
};

export function requireGoogleOAuthConfig() {
  const clientId = String(process.env.GOOGLE_WORKSPACE_CLIENT_ID ?? "").trim();
  const clientSecret = String(process.env.GOOGLE_WORKSPACE_CLIENT_SECRET ?? "").trim();
  const redirectUri = String(process.env.GOOGLE_WORKSPACE_REDIRECT_URI ?? "").trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google Workspace OAuth is not configured.");
  }
  const parsed = new URL(redirectUri);
  const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp) {
    throw new Error("Google Workspace redirect URI must use HTTPS outside localhost.");
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildGoogleAuthorizationUrl(input: {
  state: string;
  codeChallenge: string;
  loginHint?: string | null;
  forceConsent?: boolean;
}) {
  const config = requireGoogleOAuthConfig();
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_WORKSPACE_SCOPES.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  const access = getGoogleOAuthAuthorizationAccessParameters(input.forceConsent === true);
  url.searchParams.set("access_type", access.accessType);
  // Missing/unusable refresh credentials and explicit reconnects must surface
  // consent. Healthy server-verified credentials only need account selection.
  url.searchParams.set("prompt", access.prompt);
  url.searchParams.set("include_granted_scopes", "false");
  if (input.loginHint) url.searchParams.set("login_hint", input.loginHint);
  return url;
}

async function readGoogleTokenResponse(response: Response): Promise<GoogleTokenPayload> {
  return (await response.json().catch(() => ({}))) as GoogleTokenPayload;
}

export async function exchangeGoogleAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
  fetchImpl?: typeof fetch;
}) {
  const config = requireGoogleOAuthConfig();
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.codeVerifier
    }),
    cache: "no-store"
  });
  return { ok: response.ok, status: response.status, payload: await readGoogleTokenResponse(response) };
}

export async function refreshGoogleAccessToken(input: {
  refreshToken: string;
  fetchImpl?: typeof fetch;
}) {
  const config = requireGoogleOAuthConfig();
  const response = await (input.fetchImpl ?? fetch)(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: input.refreshToken
    }),
    cache: "no-store"
  });
  return { ok: response.ok, status: response.status, payload: await readGoogleTokenResponse(response) };
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const { clientId } = requireGoogleOAuthConfig();
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    audience: clientId,
    issuer: ["https://accounts.google.com", "accounts.google.com"]
  });
  const subject = typeof payload.sub === "string" ? payload.sub.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";
  if (!subject || !email || !emailVerified) {
    throw new Error("Google did not return a verified account identity.");
  }
  const displayName = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null;
  return { subject, email, displayName };
}

export async function revokeGoogleToken(input: { token: string; fetchImpl?: typeof fetch }) {
  const response = await (input.fetchImpl ?? fetch)(GOOGLE_REVOKE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: input.token }),
    cache: "no-store"
  });
  return { ok: response.ok || response.status === 400, status: response.status };
}
