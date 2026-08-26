/**
 * Platform Core auth configuration.
 *
 * Two URLs exist in this system and they are never interchangeable:
 *
 *   NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL  -> the Supabase Auth/API project
 *   NEXT_PUBLIC_PLATFORM_APP_URL            -> this Next.js frontend
 *
 * Orca previously conflated them and redirected users to
 * `https://<ref>.supabase.co/signin`, which answers `{"error":"requested path is
 * invalid"}`. The guard below makes that class of mistake impossible here too:
 * a frontend URL that names a Supabase API host is rejected rather than used.
 */

const SUPABASE_MANAGED_API_HOST = /(^|\.)supabase\.(co|in)$/i;

function trimmed(value: string | undefined): string | null {
  const next = value?.trim();
  return next ? next : null;
}

export type PlatformAuthConfig = {
  /** Supabase project URL — Auth and API only, never a page destination. */
  url: string;
  anonKey: string;
};

/**
 * Auth authority for Platform Core. Throws rather than falling back: a half
 * configured authority must fail closed, never silently authenticate elsewhere.
 */
export function requirePlatformAuthConfig(): PlatformAuthConfig {
  const url = trimmed(process.env.NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL);
  const anonKey = trimmed(process.env.NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY);

  if (!url || !anonKey) {
    throw new Error(
      "Platform Core auth is not configured. Set NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL and NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY.",
    );
  }
  return { url, anonKey };
}

/**
 * Absolute URL of this frontend, used to build auth redirect targets.
 *
 * Returns null when unset or when it names a Supabase API host, so callers fall
 * back to the request's own origin instead of sending a user somewhere that
 * cannot render a page.
 */
export function getPlatformAppUrl(): string | null {
  const configured = trimmed(process.env.NEXT_PUBLIC_PLATFORM_APP_URL);
  if (!configured) return null;

  let host: string;
  try {
    host = new URL(configured).hostname;
  } catch {
    return null;
  }
  if (SUPABASE_MANAGED_API_HOST.test(host)) return null;

  // Also reject the configured auth origin itself, which covers a self-hosted
  // GoTrue on a custom domain that no `*.supabase.co` pattern would catch.
  const authUrl = trimmed(process.env.NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL);
  if (authUrl) {
    try {
      if (new URL(configured).origin.toLowerCase() === new URL(authUrl).origin.toLowerCase()) {
        return null;
      }
    } catch {
      return null;
    }
  }
  return configured;
}

/**
 * Where auth redirects should land. Prefers the configured frontend URL and
 * falls back to the origin the request actually arrived on.
 */
export function resolveAppOrigin(requestUrl: string | URL): string {
  return getPlatformAppUrl() ?? new URL(requestUrl).origin;
}
