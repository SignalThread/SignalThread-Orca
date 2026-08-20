/**
 * Authentication authority configuration.
 *
 * Orca's authentication authority (the Supabase project that issues and validates
 * sessions) is a *separate* concern from Orca's operational database (`DATABASE_URL`,
 * reached directly through Prisma). Historically both happened to be the same Supabase
 * project, and the code assumed so by reading `NEXT_PUBLIC_SUPABASE_*` everywhere.
 *
 * Platform Core owns canonical authentication. This module is the single place that
 * answers "which project authenticates our users?", so the authority can be repointed at
 * Platform Core without touching operational database access, product signing secrets, or
 * any authorization logic.
 *
 * Precedence:
 *   1. NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL / ..._ANON_KEY  → Platform Core authority
 *   2. NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY → legacy Orca authority
 *
 * Both variables of a pair must be set together; a half-configured Platform Core authority
 * is a configuration error rather than a silent fallback to the legacy project.
 */

export type AuthAuthoritySource = "platform-core" | "legacy-orca";

export type AuthAuthorityConfig = Readonly<{
  url: string;
  anonKey: string;
  source: AuthAuthoritySource;
}>;

export class AuthAuthorityConfigError extends Error {}

function trimmed(value: string | undefined): string | null {
  const next = value?.trim();
  return next ? next : null;
}

/**
 * Resolve the configured authentication authority, or `null` when neither project is
 * configured. `NEXT_PUBLIC_*` names are referenced statically so Next can inline them
 * into the client bundle.
 */
export function resolveAuthAuthorityConfig(): AuthAuthorityConfig | null {
  const platformUrl = trimmed(process.env.NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL);
  const platformAnonKey = trimmed(process.env.NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY);

  if (platformUrl || platformAnonKey) {
    if (!platformUrl || !platformAnonKey) {
      throw new AuthAuthorityConfigError(
        "Platform Core auth is half-configured. Set both NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL and NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY.",
      );
    }
    return { url: platformUrl, anonKey: platformAnonKey, source: "platform-core" };
  }

  const legacyUrl = trimmed(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const legacyAnonKey = trimmed(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (legacyUrl && legacyAnonKey) {
    return { url: legacyUrl, anonKey: legacyAnonKey, source: "legacy-orca" };
  }

  return null;
}

export function requireAuthAuthorityConfig(): AuthAuthorityConfig {
  const config = resolveAuthAuthorityConfig();
  if (!config) {
    throw new AuthAuthorityConfigError(
      "No authentication authority configured. Set NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL/_ANON_KEY (preferred) or the legacy NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY.",
    );
  }
  return config;
}

/** True once authentication is served by Platform Core rather than the legacy Orca project. */
export function isPlatformCoreAuthAuthority(): boolean {
  return resolveAuthAuthorityConfig()?.source === "platform-core";
}
