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

/**
 * Phase 2 cutover posture.
 *
 * Production must authenticate against Platform Core. The legacy Orca project is only
 * permitted there as a deliberate, temporary rollback, opted into with
 * `ALLOW_LEGACY_ORCA_AUTH_AUTHORITY=true` — never as a silent fallback, so a missing or
 * mistyped Platform Core variable fails closed instead of quietly reverting to Orca auth.
 *
 * Outside production the legacy project stays usable so local development and the
 * Playwright suite keep working without a Platform Core project.
 */
export function isLegacyAuthAuthorityAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.ALLOW_LEGACY_ORCA_AUTH_AUTHORITY?.trim().toLowerCase() === "true";
}

export type AuthAuthorityPosture =
  | { status: "OK"; config: AuthAuthorityConfig }
  | { status: "BLOCKED"; reason: string; hint: string };

/**
 * Resolve the authority *and* assert it is acceptable for this environment.
 *
 * Session resolution uses this rather than `requireAuthAuthorityConfig` so that a
 * production deployment which has not been cut over refuses to authenticate anyone
 * instead of authenticating them against the wrong authority.
 */
export function resolveAuthAuthorityPosture(): AuthAuthorityPosture {
  let config: AuthAuthorityConfig | null;
  try {
    config = resolveAuthAuthorityConfig();
  } catch (error) {
    return {
      status: "BLOCKED",
      reason: "AUTH_AUTHORITY_MISCONFIGURED",
      hint: error instanceof Error ? error.message : "Authentication authority is misconfigured.",
    };
  }

  if (!config) {
    return {
      status: "BLOCKED",
      reason: "AUTH_AUTHORITY_NOT_CONFIGURED",
      hint: "Set NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL and NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY.",
    };
  }

  if (config.source === "legacy-orca" && !isLegacyAuthAuthorityAllowed()) {
    return {
      status: "BLOCKED",
      reason: "LEGACY_AUTH_AUTHORITY_NOT_PERMITTED",
      hint: "Production must authenticate against Platform Core. Configure the Platform Core Supabase variables, or set ALLOW_LEGACY_ORCA_AUTH_AUTHORITY=true to roll back deliberately.",
    };
  }

  return { status: "OK", config };
}
