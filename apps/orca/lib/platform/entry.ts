/**
 * Platform Core → Orca entry and exit routing.
 *
 * Orca is no longer an authentication entry point. Users sign in at Platform Core and
 * arrive already authenticated; signing out returns them to Platform Core rather than to a
 * local Orca login screen.
 *
 * Every destination is configuration, never a hardcoded project or domain, so the same
 * build works across environments.
 */

const DEFAULT_SIGN_IN_PATH = "/signin";
const DEFAULT_SIGN_OUT_PATH = "/signout";

/**
 * Supabase's managed API domains. A project URL such as
 * `https://<ref>.supabase.co` is an auth/REST API origin -- it serves no `/signin` page and
 * never will, so it is not a candidate Platform frontend under any configuration.
 */
const SUPABASE_MANAGED_API_HOST = /(^|\.)supabase\.(co|in)$/i;

function trimmed(value: string | undefined): string | null {
  const next = value?.trim();
  return next ? next : null;
}

function originOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Why Platform Core entry/exit routing is unavailable, so callers can say something more
 * useful than "not configured" when the value is present but pointing at the wrong service.
 */
export type PlatformBaseUrlResolution =
  | { status: "ok"; baseUrl: string }
  | { status: "unset" }
  | { status: "invalid"; value: string }
  | { status: "auth-host-rejected"; value: string };

/**
 * Resolve the Platform Core *frontend* base URL.
 *
 * `NEXT_PUBLIC_PLATFORM_CORE_APP_URL` (the SignalThread Platform web app) and
 * `NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL` (the Supabase auth/API project) are different
 * services and must never be interchanged. Pointing the frontend variable at the Supabase
 * project sends unauthenticated users to `https://<ref>.supabase.co/signin`, which answers
 * `{"error":"requested path is invalid"}` -- a dead end that looks like a broken login.
 *
 * There is deliberately no fallback: when the frontend URL is absent or points at an auth
 * host, this fails closed and Orca renders its "not configured" state instead of guessing.
 */
export function resolvePlatformCoreBaseUrl(): PlatformBaseUrlResolution {
  const configured = trimmed(process.env.NEXT_PUBLIC_PLATFORM_CORE_APP_URL);
  if (!configured) return { status: "unset" };

  const origin = originOf(configured);
  if (!origin) return { status: "invalid", value: configured };

  let host: string;
  try {
    host = new URL(configured).hostname;
  } catch {
    return { status: "invalid", value: configured };
  }

  // Reject the managed Supabase API domain outright...
  if (SUPABASE_MANAGED_API_HOST.test(host)) {
    return { status: "auth-host-rejected", value: configured };
  }

  // ...and any origin that matches a configured auth authority, which also covers
  // self-hosted GoTrue on a custom domain.
  const authOrigins = [
    originOf(trimmed(process.env.NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL)),
    originOf(trimmed(process.env.NEXT_PUBLIC_SUPABASE_URL)),
  ].filter((value): value is string => value !== null);

  if (authOrigins.includes(origin)) {
    return { status: "auth-host-rejected", value: configured };
  }

  return { status: "ok", baseUrl: configured };
}

/** Base URL of the Platform Core web app, e.g. `https://platform.example.com`. */
export function getPlatformCoreBaseUrl(): string | null {
  const resolution = resolvePlatformCoreBaseUrl();
  return resolution.status === "ok" ? resolution.baseUrl : null;
}

/** Absolute URL of this Orca deployment, used to build return-to links. */
export function getOrcaAppUrl(): string | null {
  return trimmed(process.env.NEXT_PUBLIC_ORCA_APP_URL);
}

function buildPlatformUrl(
  path: string,
  returnTo: string | null,
  returnParam: string,
): string | null {
  const base = getPlatformCoreBaseUrl();
  if (!base) return null;

  let url: URL;
  try {
    url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  } catch {
    return null;
  }

  if (returnTo) {
    url.searchParams.set(returnParam, returnTo);
  }
  return url.toString();
}

/**
 * Build an absolute return-to URL for a relative Orca path.
 *
 * Only same-origin relative paths are accepted, so a crafted `?next=` can never turn the
 * Platform Core round trip into an open redirect back to an attacker's site.
 */
export function buildOrcaReturnToUrl(relativePath: string | null): string | null {
  const appUrl = getOrcaAppUrl();
  if (!appUrl) return null;
  if (!relativePath || !relativePath.startsWith("/") || relativePath.startsWith("//")) {
    return appUrl;
  }

  try {
    return new URL(relativePath, appUrl.endsWith("/") ? appUrl : `${appUrl}/`).toString();
  } catch {
    return appUrl;
  }
}

/**
 * Where an unauthenticated visitor should be sent to sign in.
 * Returns null when Platform Core routing is not configured yet.
 */
export function getPlatformSignInUrl(returnToPath: string | null = null): string | null {
  const signInPath = trimmed(process.env.NEXT_PUBLIC_PLATFORM_CORE_SIGN_IN_PATH) ?? DEFAULT_SIGN_IN_PATH;
  return buildPlatformUrl(signInPath, buildOrcaReturnToUrl(returnToPath), "redirect_to");
}

/**
 * Where a signing-out user should land so the Platform Core session ends too.
 *
 * Clearing only Orca's cookies would leave the user still signed in at Platform Core and
 * bounce them straight back in — the confusing re-entry this exists to prevent.
 */
export function getPlatformSignOutUrl(): string | null {
  const signOutPath = trimmed(process.env.NEXT_PUBLIC_PLATFORM_CORE_SIGN_OUT_PATH) ?? DEFAULT_SIGN_OUT_PATH;
  return buildPlatformUrl(signOutPath, getOrcaAppUrl(), "redirect_to");
}

/** True when Platform Core entry/exit routing is configured. */
export function isPlatformEntryRoutingConfigured(): boolean {
  return getPlatformCoreBaseUrl() !== null;
}
