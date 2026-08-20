/**
 * Product token signing secrets.
 *
 * Orca signs several public, identity-independent tokens (speaker intake/portal links,
 * marketing unsubscribe links). Historically the speaker intake secret fell back to
 * `SUPABASE_SERVICE_ROLE_KEY`, which coupled product token validity to Orca's
 * authentication authority: repointing Supabase Auth at Platform Core would have
 * silently invalidated every outstanding speaker link.
 *
 * Platform Core migration rule: authentication authority and product signing secrets are
 * separate concerns. New tokens are always signed with a product-owned secret. Legacy
 * secrets are accepted for *verification only*, so links minted before the migration keep
 * working until they expire.
 */

export class ProductTokenSecretError extends Error {}

export type ProductTokenSecretPurpose = "speaker-intake";

type SecretResolution = Readonly<{
  /** Secret used to sign newly minted tokens. */
  signing: string;
  /**
   * Secrets accepted when verifying an existing token, signing secret first.
   * Includes transitional legacy secrets that must not be used for new tokens.
   */
  verification: readonly string[];
  /** True when signing still falls back to the auth-authority service-role key. */
  usesLegacyAuthAuthoritySecret: boolean;
}>;

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function dedupe(values: readonly (string | null)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

const warnedPurposes = new Set<ProductTokenSecretPurpose>();

function warnOnceAboutLegacySigning(purpose: ProductTokenSecretPurpose): void {
  if (warnedPurposes.has(purpose)) return;
  warnedPurposes.add(purpose);
  console.warn(
    `[platform-core] ${purpose} tokens are still signed with SUPABASE_SERVICE_ROLE_KEY. ` +
      "Set SPEAKER_INTAKE_TOKEN_SECRET before repointing authentication at Platform Core, " +
      "otherwise outstanding links will stop verifying.",
  );
}

/**
 * Resolve the speaker intake/portal token secrets.
 *
 * Precedence for signing:
 *   1. SPEAKER_INTAKE_TOKEN_SECRET        (product-owned, required post-migration)
 *   2. SUPABASE_SERVICE_ROLE_KEY          (deprecated transitional fallback; warns)
 *
 * Verification additionally accepts:
 *   - SPEAKER_INTAKE_TOKEN_SECRET_PREVIOUS (explicit rotation slot)
 *   - SUPABASE_SERVICE_ROLE_KEY            (tokens minted before the secret was split out)
 */
export function resolveSpeakerIntakeTokenSecrets(): SecretResolution {
  const explicitSecret = readEnv("SPEAKER_INTAKE_TOKEN_SECRET");
  const previousSecret = readEnv("SPEAKER_INTAKE_TOKEN_SECRET_PREVIOUS");
  const legacyAuthAuthoritySecret = readEnv("SUPABASE_SERVICE_ROLE_KEY");

  const signing = explicitSecret ?? legacyAuthAuthoritySecret;
  if (!signing) {
    throw new ProductTokenSecretError(
      "Missing SPEAKER_INTAKE_TOKEN_SECRET. Set a product-owned speaker intake signing secret.",
    );
  }

  const usesLegacyAuthAuthoritySecret = !explicitSecret;
  if (usesLegacyAuthAuthoritySecret) {
    warnOnceAboutLegacySigning("speaker-intake");
  }

  return {
    signing,
    verification: dedupe([signing, previousSecret, legacyAuthAuthoritySecret]),
    usesLegacyAuthAuthoritySecret,
  };
}

/** Test-only: reset the one-time warning latch. */
export function __resetProductTokenSecretWarnings(): void {
  warnedPurposes.clear();
}
