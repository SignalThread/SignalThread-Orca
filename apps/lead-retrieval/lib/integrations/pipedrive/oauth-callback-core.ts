import type { CompanyIntegrationAuthorizationResult } from "@/lib/integrations/company-integration-authorization-core";
import type {
  PipedriveIdentity,
  PipedriveTokenPayload
} from "@/lib/integrations/pipedrive/oauth-client";

type TokenExchangeResult = {
  ok: boolean;
  status: number;
  payload: PipedriveTokenPayload;
};

export type PipedriveCallbackResult = {
  ok: boolean;
  result:
    | "connected"
    | "invalid_state"
    | "session_mismatch"
    | "access_denied"
    | "missing_code"
    | "token_exchange_failed"
    | "verification_failed"
    | "persistence_failed";
  returnTo: string;
};

export type PipedriveCallbackDeps = {
  consumeState: (state: string) => Promise<{
    userId: string;
    companyId: string;
    returnTo: string;
  } | null>;
  authorize: () => Promise<CompanyIntegrationAuthorizationResult>;
  exchangeCode: (code: string) => Promise<TokenExchangeResult>;
  verifyConnection: (input: {
    accessToken: string;
    apiDomain: string;
  }) => Promise<PipedriveIdentity>;
  saveConnection: (input: {
    userId: string;
    companyId: string;
    identity: PipedriveIdentity;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    scopes: string[];
    tokenType: string | null;
    apiDomain: string;
  }) => Promise<unknown>;
  normalizeScopes: (scope: string | null | undefined) => string[];
  revokeRefreshToken: (refreshToken: string) => Promise<void>;
};

const DEFAULT_RETURN_TO = "/exhibitor/integrations/pipedrive";

function result(
  name: PipedriveCallbackResult["result"],
  returnTo = DEFAULT_RETURN_TO
): PipedriveCallbackResult {
  return { ok: name === "connected", result: name, returnTo };
}

export async function handlePipedriveOAuthCallback(
  input: { state: string | null; code: string | null; providerError: string | null },
  deps: PipedriveCallbackDeps
): Promise<PipedriveCallbackResult> {
  if (!input.state) return result("invalid_state");
  const binding = await deps.consumeState(input.state);
  if (!binding) return result("invalid_state");

  const authorization = await deps.authorize();
  if (
    !authorization.ok ||
    authorization.context.userId !== binding.userId ||
    authorization.context.companyId !== binding.companyId
  ) {
    return result("session_mismatch", binding.returnTo);
  }
  if (input.providerError) return result("access_denied", binding.returnTo);
  if (!input.code) return result("missing_code", binding.returnTo);

  let exchanged: TokenExchangeResult;
  try {
    exchanged = await deps.exchangeCode(input.code);
  } catch {
    return result("token_exchange_failed", binding.returnTo);
  }
  const accessToken = String(exchanged.payload.access_token ?? "").trim();
  const refreshToken = String(exchanged.payload.refresh_token ?? "").trim();
  const apiDomain = String(exchanged.payload.api_domain ?? "").trim();
  if (!exchanged.ok || !accessToken || !refreshToken || !apiDomain) {
    if (refreshToken) await deps.revokeRefreshToken(refreshToken).catch(() => undefined);
    return result("token_exchange_failed", binding.returnTo);
  }

  let identity: PipedriveIdentity;
  try {
    identity = await deps.verifyConnection({ accessToken, apiDomain });
  } catch {
    await deps.revokeRefreshToken(refreshToken).catch(() => undefined);
    return result("verification_failed", binding.returnTo);
  }

  try {
    await deps.saveConnection({
      userId: binding.userId,
      companyId: binding.companyId,
      identity,
      accessToken,
      refreshToken,
      expiresIn: Number(exchanged.payload.expires_in) || 3600,
      scopes: deps.normalizeScopes(exchanged.payload.scope),
      tokenType: String(exchanged.payload.token_type ?? "").trim() || null,
      apiDomain
    });
  } catch {
    await deps.revokeRefreshToken(refreshToken).catch(() => undefined);
    return result("persistence_failed", binding.returnTo);
  }
  return result("connected", binding.returnTo);
}
