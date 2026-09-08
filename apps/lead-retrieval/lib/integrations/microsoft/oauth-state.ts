import { randomBytes } from "node:crypto";
import {
  createOAuthPkcePair,
  deriveProviderStateSecret,
  digestOAuthValue,
  openStateEnvelope,
  requireOAuthStateSecret,
  signStateEnvelope
} from "@/lib/integrations/oauth/signed-state-core";
import {
  MOBILE_OAUTH_INTERNAL_RETURN_PATH,
  isOpaqueMobileOAuthCorrelation
} from "@/lib/integrations/mobile-oauth/bridge-core";
import { MICROSOFT_365_MANAGE_PATH, MICROSOFT_365_PROVIDER } from "@/lib/integrations/microsoft/provider";

const STATE_VERSION = 1;
export const MICROSOFT_OAUTH_STATE_TTL_SECONDS = 10 * 60;
export type MicrosoftOAuthChannel = "web" | "mobile";

export type MicrosoftOAuthStatePayload = {
  v: 1;
  provider: typeof MICROSOFT_365_PROVIDER;
  jti: string;
  userId: string;
  companyId: string;
  returnTo: string;
  channel?: MicrosoftOAuthChannel;
  correlation?: string;
  iat: number;
  exp: number;
};

/**
 * The signing key is domain-separated per provider, so a state minted for one
 * provider cannot verify for another even though both providers may read the
 * same configured OAuth state secret.
 */
function requireStateSecret(
  secret: string | undefined = process.env.MICROSOFT_OAUTH_STATE_SECRET ??
    process.env.GOOGLE_WORKSPACE_OAUTH_STATE_SECRET
) {
  return deriveProviderStateSecret(
    requireOAuthStateSecret(secret, "MICROSOFT_OAUTH_STATE_SECRET"),
    MICROSOFT_365_PROVIDER
  );
}

export function normalizeMicrosoftReturnTo(value: string | null | undefined) {
  const candidate = String(value ?? "").trim();
  if (candidate === "/exhibitor/integrations" || candidate === MICROSOFT_365_MANAGE_PATH) {
    return candidate;
  }
  return MICROSOFT_365_MANAGE_PATH;
}

export function createMicrosoftOAuthState(input: {
  userId: string;
  companyId: string;
  returnTo?: string | null;
  channel?: MicrosoftOAuthChannel;
  correlation?: string;
  now?: Date;
  secret?: string;
}) {
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const channel = input.channel ?? "web";
  if (channel === "mobile" && !isOpaqueMobileOAuthCorrelation(input.correlation)) {
    throw new Error("Mobile OAuth state requires an opaque correlation.");
  }
  const payload: MicrosoftOAuthStatePayload = {
    v: STATE_VERSION,
    provider: MICROSOFT_365_PROVIDER,
    jti: randomBytes(32).toString("base64url"),
    userId: input.userId,
    companyId: input.companyId,
    returnTo:
      channel === "mobile" ? MOBILE_OAUTH_INTERNAL_RETURN_PATH : normalizeMicrosoftReturnTo(input.returnTo),
    ...(channel === "mobile" ? { channel, correlation: input.correlation } : {}),
    iat: nowSeconds,
    exp: nowSeconds + MICROSOFT_OAUTH_STATE_TTL_SECONDS
  };
  return { payload, state: signStateEnvelope(payload, requireStateSecret(input.secret)) };
}

export function verifyMicrosoftOAuthState(
  state: string,
  options: { now?: Date; secret?: string } = {}
): MicrosoftOAuthStatePayload {
  const payload = openStateEnvelope(
    state,
    requireStateSecret(options.secret)
  ) as MicrosoftOAuthStatePayload;
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (
    payload.v !== STATE_VERSION ||
    payload.provider !== MICROSOFT_365_PROVIDER ||
    !payload.jti ||
    !payload.userId ||
    !payload.companyId ||
    (payload.channel !== undefined && payload.channel !== "web" && payload.channel !== "mobile") ||
    (payload.channel === "mobile"
      ? payload.returnTo !== MOBILE_OAUTH_INTERNAL_RETURN_PATH ||
        !isOpaqueMobileOAuthCorrelation(payload.correlation)
      : normalizeMicrosoftReturnTo(payload.returnTo) !== payload.returnTo ||
        payload.correlation !== undefined) ||
    !Number.isInteger(payload.iat) ||
    !Number.isInteger(payload.exp) ||
    payload.exp <= nowSeconds ||
    payload.iat > nowSeconds + 60 ||
    payload.exp - payload.iat > MICROSOFT_OAUTH_STATE_TTL_SECONDS
  ) {
    throw new Error("Expired or invalid OAuth state.");
  }
  return payload;
}

export function digestMicrosoftOAuthValue(value: string) {
  return digestOAuthValue(value);
}

export function createMicrosoftPkcePair() {
  return createOAuthPkcePair();
}
