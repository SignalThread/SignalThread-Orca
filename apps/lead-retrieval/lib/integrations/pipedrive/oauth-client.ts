import "server-only";

import {
  buildPipedriveAuthorizationUrlCore,
  resolvePipedriveOAuthConfigCore,
  validatePipedriveApiDomain
} from "@/lib/integrations/pipedrive/oauth-client-core";
export {
  PIPEDRIVE_CALLBACK_PATH,
  normalizePipedriveRedirectUri,
  normalizePipedriveScopes,
  resolvePipedriveDeploymentEnvironment,
  validatePipedriveApiDomain
} from "@/lib/integrations/pipedrive/oauth-client-core";

const PIPEDRIVE_TOKEN_URL = "https://oauth.pipedrive.com/oauth/token";
const PIPEDRIVE_REVOKE_URL = "https://oauth.pipedrive.com/oauth/revoke";

export type PipedriveOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type PipedriveTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  api_domain?: string;
  error?: string;
  error_description?: string;
};

export type PipedriveIdentity = {
  userId: string;
  companyId: string;
  companyName: string | null;
  email: string | null;
  name: string | null;
};

export function requirePipedriveOAuthConfig(
  environment: NodeJS.ProcessEnv = process.env
): PipedriveOAuthConfig {
  return resolvePipedriveOAuthConfigCore(environment as Record<string, string | undefined>);
}

export function buildPipedriveAuthorizationUrl(input: {
  state: string;
  config?: PipedriveOAuthConfig;
}) {
  const config = input.config ?? requirePipedriveOAuthConfig();
  return buildPipedriveAuthorizationUrlCore({ state: input.state, config });
}

function basicAuthorization(config: PipedriveOAuthConfig) {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64")}`;
}

async function requestToken(input: {
  body: URLSearchParams;
  config?: PipedriveOAuthConfig;
  fetchImpl?: typeof fetch;
}) {
  const config = input.config ?? requirePipedriveOAuthConfig();
  const response = await (input.fetchImpl ?? fetch)(PIPEDRIVE_TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: basicAuthorization(config),
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json"
    },
    body: input.body.toString(),
    cache: "no-store"
  });
  const payload = (await response.json().catch(() => ({}))) as PipedriveTokenPayload;
  return { ok: response.ok, status: response.status, payload };
}

export function exchangePipedriveAuthorizationCode(input: {
  code: string;
  config?: PipedriveOAuthConfig;
  fetchImpl?: typeof fetch;
}) {
  const config = input.config ?? requirePipedriveOAuthConfig();
  return requestToken({
    config,
    fetchImpl: input.fetchImpl,
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: config.redirectUri
    })
  });
}

export function refreshPipedriveAccessToken(input: {
  refreshToken: string;
  config?: PipedriveOAuthConfig;
  fetchImpl?: typeof fetch;
}) {
  return requestToken({
    config: input.config,
    fetchImpl: input.fetchImpl,
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: input.refreshToken
    })
  });
}

export async function verifyPipedriveConnection(input: {
  accessToken: string;
  apiDomain: string;
  fetchImpl?: typeof fetch;
}): Promise<PipedriveIdentity> {
  const apiDomain = validatePipedriveApiDomain(input.apiDomain);
  const response = await (input.fetchImpl ?? fetch)(`${apiDomain}/api/v1/users/me`, {
    method: "GET",
    headers: { authorization: `Bearer ${input.accessToken}`, accept: "application/json" },
    cache: "no-store"
  });
  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: Record<string, unknown>;
  };
  const data = payload.data;
  const userId = String(data?.id ?? "").trim();
  const companyId = String(data?.company_id ?? "").trim();
  if (!response.ok || payload.success !== true || !data || !userId || !companyId) {
    throw new Error("Pipedrive connection verification failed.");
  }
  return {
    userId,
    companyId,
    companyName: String(data.company_name ?? "").trim() || null,
    email: String(data.email ?? "").trim() || null,
    name: String(data.name ?? "").trim() || null
  };
}

export async function revokePipedriveRefreshToken(input: {
  refreshToken: string;
  config?: PipedriveOAuthConfig;
  fetchImpl?: typeof fetch;
}) {
  const config = input.config ?? requirePipedriveOAuthConfig();
  const response = await (input.fetchImpl ?? fetch)(PIPEDRIVE_REVOKE_URL, {
    method: "POST",
    headers: {
      authorization: basicAuthorization(config),
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      token: input.refreshToken,
      token_type_hint: "refresh_token"
    }).toString(),
    cache: "no-store"
  });
  return response.ok;
}
