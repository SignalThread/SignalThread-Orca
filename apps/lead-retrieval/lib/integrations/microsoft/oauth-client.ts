import "server-only";

import {
  microsoft365AuthorizationScopeParameter
} from "@/lib/integrations/microsoft/scopes";

const MICROSOFT_AUTHORIZATION_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MICROSOFT_TOKEN_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MICROSOFT_GRAPH_ME_ENDPOINT = "https://graph.microsoft.com/v1.0/me";

export type MicrosoftTokenPayload = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

export type MicrosoftIdentity = {
  subject: string;
  email: string;
  displayName: string | null;
};

export function requireMicrosoftOAuthConfig() {
  const clientId = String(process.env.MICROSOFT_CLIENT_ID ?? "").trim();
  const clientSecret = String(process.env.MICROSOFT_CLIENT_SECRET ?? "").trim();
  const redirectUri = String(process.env.MICROSOFT_REDIRECT_URI ?? "").trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Microsoft 365 OAuth is not configured.");
  }
  const parsed = new URL(redirectUri);
  const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp) {
    throw new Error("Microsoft redirect URI must use HTTPS outside localhost.");
  }
  return { clientId, clientSecret, redirectUri };
}

export function getMicrosoftOAuthAuthorizationPrompt(requiresNewRefreshToken: boolean) {
  // Missing/unusable refresh credentials and explicit reconnects must surface
  // consent so Microsoft issues a fresh offline grant. Healthy server-verified
  // credentials only need account selection.
  return requiresNewRefreshToken ? "consent" : "select_account";
}

export function buildMicrosoftAuthorizationUrl(input: {
  state: string;
  codeChallenge: string;
  loginHint?: string | null;
  forceConsent?: boolean;
}) {
  const config = requireMicrosoftOAuthConfig();
  const url = new URL(MICROSOFT_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", microsoft365AuthorizationScopeParameter());
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", getMicrosoftOAuthAuthorizationPrompt(input.forceConsent === true));
  if (input.loginHint) url.searchParams.set("login_hint", input.loginHint);
  return url;
}

async function readMicrosoftTokenResponse(response: Response): Promise<MicrosoftTokenPayload> {
  return (await response.json().catch(() => ({}))) as MicrosoftTokenPayload;
}

export async function exchangeMicrosoftAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
  fetchImpl?: typeof fetch;
}) {
  const config = requireMicrosoftOAuthConfig();
  const response = await (input.fetchImpl ?? fetch)(MICROSOFT_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.codeVerifier,
      scope: microsoft365AuthorizationScopeParameter()
    }),
    cache: "no-store"
  });
  return { ok: response.ok, status: response.status, payload: await readMicrosoftTokenResponse(response) };
}

export async function refreshMicrosoftAccessToken(input: {
  refreshToken: string;
  fetchImpl?: typeof fetch;
}) {
  const config = requireMicrosoftOAuthConfig();
  const response = await (input.fetchImpl ?? fetch)(MICROSOFT_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
      scope: microsoft365AuthorizationScopeParameter()
    }),
    cache: "no-store"
  });
  return { ok: response.ok, status: response.status, payload: await readMicrosoftTokenResponse(response) };
}

type GraphMeResponse = {
  id?: unknown;
  mail?: unknown;
  userPrincipalName?: unknown;
  displayName?: unknown;
};

/**
 * Verify the connected identity against Microsoft Graph. The connection is only
 * ever activated after this call succeeds, so a token that cannot read its own
 * account never reaches a `connected` state.
 */
export async function fetchMicrosoftIdentity(input: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<MicrosoftIdentity> {
  const response = await (input.fetchImpl ?? fetch)(MICROSOFT_GRAPH_ME_ENDPOINT, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}`, Accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) {
    throw Object.assign(new Error("Microsoft Graph did not return the connected account."), {
      status: response.status
    });
  }
  const payload = (await response.json().catch(() => ({}))) as GraphMeResponse;
  const subject = typeof payload.id === "string" ? payload.id.trim() : "";
  const mail = typeof payload.mail === "string" ? payload.mail.trim() : "";
  const principal = typeof payload.userPrincipalName === "string" ? payload.userPrincipalName.trim() : "";
  const email = (mail || principal).toLowerCase();
  if (!subject || !email) {
    throw new Error("Microsoft did not return a usable account identity.");
  }
  const displayName =
    typeof payload.displayName === "string" && payload.displayName.trim() ? payload.displayName.trim() : null;
  return { subject, email, displayName };
}
