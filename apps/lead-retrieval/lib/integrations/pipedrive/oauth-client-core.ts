export type PipedriveOAuthPublicConfig = {
  clientId: string;
  redirectUri: string;
};

export function buildPipedriveAuthorizationUrlCore(input: {
  state: string;
  config: PipedriveOAuthPublicConfig;
}) {
  const url = new URL("https://oauth.pipedrive.com/oauth/authorize");
  url.searchParams.set("client_id", input.config.clientId);
  url.searchParams.set("redirect_uri", input.config.redirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}

export function normalizePipedriveScopes(scope: string | null | undefined) {
  return String(scope ?? "")
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function validatePipedriveApiDomain(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    !(hostname === "pipedrive.com" || hostname.endsWith(".pipedrive.com")) ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new Error("Pipedrive returned an invalid API domain.");
  }
  return `${url.origin}`;
}

export const PIPEDRIVE_CALLBACK_PATH = "/api/integrations/pipedrive/callback";

export type PipedriveDeploymentEnvironment = "development" | "preview" | "production";

/**
 * Resolve which deployment the process is serving. `VERCEL_ENV` is the canonical
 * signal on the hosting platform; `NODE_ENV` is only the local fallback.
 */
export function resolvePipedriveDeploymentEnvironment(
  environment: { VERCEL_ENV?: string; NODE_ENV?: string }
): PipedriveDeploymentEnvironment {
  const vercelEnv = String(environment.VERCEL_ENV ?? "").trim().toLowerCase();
  if (vercelEnv === "production" || vercelEnv === "preview" || vercelEnv === "development") {
    return vercelEnv;
  }
  return String(environment.NODE_ENV ?? "").trim().toLowerCase() === "production"
    ? "production"
    : "development";
}

function isLoopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * Produce the single canonical redirect URI for this deployment, or fail loudly.
 *
 * Pipedrive rejects the authorization request with "Redirect URI match failed"
 * whenever the generated value differs from the Developer Hub callback by even a
 * trailing slash or query string, so the value is normalized here and every
 * environment-inappropriate host is rejected rather than silently accepted.
 */
export function normalizePipedriveRedirectUri(input: {
  redirectUri: string;
  deployment: PipedriveDeploymentEnvironment;
}) {
  let url: URL;
  try {
    url = new URL(input.redirectUri);
  } catch {
    throw new Error("PIPEDRIVE_REDIRECT_URI must be a valid absolute URL.");
  }
  if (url.username || url.password) {
    throw new Error("PIPEDRIVE_REDIRECT_URI must not embed credentials.");
  }
  if (url.search || url.hash) {
    throw new Error("PIPEDRIVE_REDIRECT_URI must not include a query string or fragment.");
  }
  if (url.pathname !== PIPEDRIVE_CALLBACK_PATH) {
    throw new Error(`PIPEDRIVE_REDIRECT_URI path must be exactly ${PIPEDRIVE_CALLBACK_PATH}.`);
  }

  const hostname = url.hostname.toLowerCase();
  if (input.deployment === "development") {
    if (url.protocol !== "https:" && !isLoopbackHostname(hostname)) {
      throw new Error("PIPEDRIVE_REDIRECT_URI must use HTTPS unless it targets localhost.");
    }
  } else {
    if (url.protocol !== "https:") {
      throw new Error(`PIPEDRIVE_REDIRECT_URI must use HTTPS in the ${input.deployment} environment.`);
    }
    if (isLoopbackHostname(hostname)) {
      throw new Error(`PIPEDRIVE_REDIRECT_URI must not target localhost in the ${input.deployment} environment.`);
    }
  }
  if (input.deployment === "production" && hostname.endsWith(".vercel.app")) {
    throw new Error(
      "PIPEDRIVE_REDIRECT_URI must use the stable production domain, not a per-deployment vercel.app host."
    );
  }

  return `${url.origin}${url.pathname}`;
}

export type PipedriveOAuthConfigCore = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/**
 * Every Pipedrive OAuth value comes from the environment. There is deliberately
 * no request-derived or localhost fallback: a preview or production deployment
 * that is missing configuration must fail loudly rather than send users to an
 * origin the Developer Hub callback cannot match.
 */
export function resolvePipedriveOAuthConfigCore(
  environment: Record<string, string | undefined>
): PipedriveOAuthConfigCore {
  const clientId = String(environment.PIPEDRIVE_CLIENT_ID ?? "").trim();
  const clientSecret = String(environment.PIPEDRIVE_CLIENT_SECRET ?? "").trim();
  const redirectUri = String(environment.PIPEDRIVE_REDIRECT_URI ?? "").trim();

  const missing = [
    clientId ? null : "PIPEDRIVE_CLIENT_ID",
    clientSecret ? null : "PIPEDRIVE_CLIENT_SECRET",
    redirectUri ? null : "PIPEDRIVE_REDIRECT_URI"
  ].filter((name): name is string => Boolean(name));
  if (missing.length) {
    throw new Error(`Pipedrive OAuth is not configured. Missing: ${missing.join(", ")}.`);
  }

  return {
    clientId,
    clientSecret,
    redirectUri: normalizePipedriveRedirectUri({
      redirectUri,
      deployment: resolvePipedriveDeploymentEnvironment(environment)
    })
  };
}
