import { randomBytes } from "node:crypto";
import {
  createOAuthPkcePair,
  digestOAuthValue,
  openStateEnvelope,
  requireOAuthStateSecret,
  signStateEnvelope
} from "@/lib/integrations/oauth/signed-state-core";
import {
  MOBILE_OAUTH_INTERNAL_RETURN_PATH,
  isOpaqueMobileOAuthCorrelation
} from "@/lib/integrations/mobile-oauth/bridge-core";

const STATE_VERSION = 1;
export const GOOGLE_OAUTH_STATE_TTL_SECONDS = 10 * 60;
export const GOOGLE_OAUTH_PKCE_COOKIE = "google_workspace_pkce";
export type GoogleOAuthChannel = "web" | "mobile";

export type GoogleOAuthStatePayload = {
  v: 1;
  jti: string;
  userId: string;
  companyId: string;
  returnTo: string;
  channel?: GoogleOAuthChannel;
  correlation?: string;
  iat: number;
  exp: number;
};

function requireStateSecret(secret: string | undefined = process.env.GOOGLE_WORKSPACE_OAUTH_STATE_SECRET) {
  return requireOAuthStateSecret(secret, "GOOGLE_WORKSPACE_OAUTH_STATE_SECRET");
}

export function normalizeGoogleReturnTo(value: string | null | undefined) {
  const candidate = String(value ?? "").trim();
  if (candidate === "/exhibitor/integrations" || candidate === "/exhibitor/integrations/google-workspace") {
    return candidate;
  }
  return "/exhibitor/integrations/google-workspace";
}

export function createGoogleOAuthState(input: {
  userId: string;
  companyId: string;
  returnTo?: string | null;
  channel?: GoogleOAuthChannel;
  correlation?: string;
  now?: Date;
  secret?: string;
}) {
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const channel = input.channel ?? "web";
  if (channel === "mobile" && !isOpaqueMobileOAuthCorrelation(input.correlation)) {
    throw new Error("Mobile OAuth state requires an opaque correlation.");
  }
  const payload: GoogleOAuthStatePayload = {
    v: STATE_VERSION,
    jti: randomBytes(32).toString("base64url"),
    userId: input.userId,
    companyId: input.companyId,
    returnTo:
      channel === "mobile" ? MOBILE_OAUTH_INTERNAL_RETURN_PATH : normalizeGoogleReturnTo(input.returnTo),
    ...(channel === "mobile" ? { channel, correlation: input.correlation } : {}),
    iat: nowSeconds,
    exp: nowSeconds + GOOGLE_OAUTH_STATE_TTL_SECONDS
  };
  return { payload, state: signStateEnvelope(payload, requireStateSecret(input.secret)) };
}

export function verifyGoogleOAuthState(
  state: string,
  options: { now?: Date; secret?: string } = {}
): GoogleOAuthStatePayload {
  const payload = openStateEnvelope(state, requireStateSecret(options.secret)) as GoogleOAuthStatePayload;
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (
    payload.v !== STATE_VERSION ||
    !payload.jti ||
    !payload.userId ||
    !payload.companyId ||
    (payload.channel !== undefined && payload.channel !== "web" && payload.channel !== "mobile") ||
    (payload.channel === "mobile"
      ? payload.returnTo !== MOBILE_OAUTH_INTERNAL_RETURN_PATH ||
        !isOpaqueMobileOAuthCorrelation(payload.correlation)
      : normalizeGoogleReturnTo(payload.returnTo) !== payload.returnTo || payload.correlation !== undefined) ||
    !Number.isInteger(payload.iat) ||
    !Number.isInteger(payload.exp) ||
    payload.exp <= nowSeconds ||
    payload.iat > nowSeconds + 60 ||
    payload.exp - payload.iat > GOOGLE_OAUTH_STATE_TTL_SECONDS
  ) {
    throw new Error("Expired or invalid OAuth state.");
  }
  return payload;
}

export function digestGoogleOAuthValue(value: string) {
  return digestOAuthValue(value);
}

export function createGooglePkcePair() {
  return createOAuthPkcePair();
}
