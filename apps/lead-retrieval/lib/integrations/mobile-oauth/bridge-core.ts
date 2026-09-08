import { createHash, randomBytes } from "node:crypto";

/**
 * Every provider the mobile OAuth bridge can carry. The bridge itself is
 * provider-neutral: tickets, correlations, deep-link returns and middleware
 * policy are shared, and each provider only supplies its own launch preparation.
 */
export const MOBILE_OAUTH_PROVIDERS = ["google_workspace", "microsoft_365"] as const;
export type MobileOAuthProvider = (typeof MOBILE_OAUTH_PROVIDERS)[number];

export const MOBILE_OAUTH_PROVIDER = "google_workspace" as const;

export const MOBILE_OAUTH_INTERNAL_RETURN_PATH = "/api/mobile/integrations/oauth/return";
export const MOBILE_OAUTH_LAUNCH_TTL_SECONDS = 5 * 60;

export type MobileOAuthResult =
  | "connected"
  | "cancelled"
  | "permission_required"
  | "reconnect_required"
  | "failed";

export function isMobileOAuthProvider(value: unknown): value is MobileOAuthProvider {
  return typeof value === "string" && (MOBILE_OAUTH_PROVIDERS as readonly string[]).includes(value);
}

export function isOpaqueMobileOAuthCorrelation(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

export function createMobileOAuthLaunchSecrets() {
  return {
    ticket: randomBytes(32).toString("base64url"),
    correlation: randomBytes(18).toString("base64url")
  };
}

export function digestMobileOAuthTicket(ticket: string) {
  return createHash("sha256").update(ticket).digest("hex");
}

export function toSafeMobileOAuthResult(result: string): MobileOAuthResult {
  if (result === "connected" || result === "permission_required" || result === "reconnect_required") {
    return result;
  }
  if (result === "access_denied") return "cancelled";
  return "failed";
}

export function getApprovedMobileOAuthReturnUri(
  configured = process.env.MOBILE_OAUTH_RETURN_URI
) {
  const candidate = String(configured ?? "leadintelscan://oauth/callback").trim();
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("MOBILE_OAUTH_RETURN_URI is invalid.");
  }
  if (
    parsed.protocol !== "leadintelscan:" ||
    parsed.hostname !== "oauth" ||
    parsed.pathname !== "/callback" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("MOBILE_OAUTH_RETURN_URI must be leadintelscan://oauth/callback.");
  }
  return parsed;
}

export function buildMobileOAuthReturnUrl(input: {
  provider: MobileOAuthProvider;
  result: string;
  correlation: string;
  configuredReturnUri?: string;
}) {
  if (!isOpaqueMobileOAuthCorrelation(input.correlation)) {
    throw new Error("Invalid mobile OAuth correlation.");
  }
  const url = getApprovedMobileOAuthReturnUri(input.configuredReturnUri);
  url.searchParams.set("provider", input.provider);
  url.searchParams.set("result", toSafeMobileOAuthResult(input.result));
  url.searchParams.set("correlation", input.correlation);
  return url;
}

