/**
 * Orca product entitlement boundary.
 *
 * Platform Core owns product entitlements. Authentication proves *who* someone is; an
 * entitlement proves they may enter Orca at all. Phase 2 makes that a separate, explicit
 * gate so a valid Platform Core session can never by itself become Orca access.
 *
 * ## The claim contract Platform Core must satisfy
 *
 * Entitlements arrive as verified claims on the authenticated user, so no per-request call
 * back to Platform Core is needed (audit: Platform Core must not be a hot-path dependency):
 *
 * ```jsonc
 * // Supabase auth.users.app_metadata
 * {
 *   "signalthread": {
 *     "products": ["orca"],          // product keys this user may enter
 *     "organizations": ["<uuid>"]    // optional; canonical org ids (consumed in Phase 3)
 *   }
 * }
 * ```
 *
 * `app_metadata` is chosen deliberately: it is server-controlled and cannot be edited by
 * the user, unlike `user_metadata`.
 *
 * ## Until Platform Core populates those claims
 *
 * The Platform Core Supabase project exists, so nothing external blocks this contract:
 * `app_metadata` can be set on Platform Core users today, through the Supabase admin API
 * or dashboard. What does not exist yet is a *systematic issuer* that keeps the claim in
 * step with entitlement changes.
 *
 * `PLATFORM_ENTITLEMENT_MODE` therefore covers the window before every user carries the
 * claim — not an absent Platform Core:
 *
 * - `claims` (default in production) — claims are required. Absent or non-entitling claims
 *   deny access. This is the fail-closed production posture.
 * - `migration` (default outside production) — claims still win when present. When absent,
 *   access is granted only to a user who is **already linked and provisioned in Orca**
 *   (a canonical `platformUserId` plus at least one organization membership). That is
 *   explicit backfilled state, never an approval derived from authentication alone.
 */

export type EntitlementMode = "claims" | "migration";

export type PlatformEntitlementClaims = Readonly<{
  products: readonly string[];
  organizations: readonly string[];
}> | null;

export type EntitlementSubject = Readonly<{
  /** Canonical Platform Core user id on the Orca row, or null when still unlinked. */
  platformUserId: string | null;
  /**
   * Whether a human already provisioned Orca access for this user — an organization
   * membership, or an elevated Orca role such as `SUPER_ADMIN`. This is state someone
   * deliberately created; it is never inferred from the fact of authenticating.
   */
  hasProvisionedOrcaAccess: boolean;
}>;

export type EntitlementGrantSource = "platform-claims" | "migration-provisioned";

export type EntitlementDecision =
  | {
      status: "GRANTED";
      source: EntitlementGrantSource;
      /** Canonical organization ids named by the claims, when present. */
      organizationIds: readonly string[];
    }
  | {
      status: "DENIED";
      reason: string;
      hint: string;
    };

const CLAIMS_NAMESPACE = "signalthread";
const DEFAULT_PRODUCT_KEY = "orca";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Product key this deployment presents to Platform Core. */
export function getOrcaProductKey(): string {
  return process.env.PLATFORM_PRODUCT_KEY?.trim() || DEFAULT_PRODUCT_KEY;
}

export function resolveEntitlementMode(): EntitlementMode {
  const configured = process.env.PLATFORM_ENTITLEMENT_MODE?.trim().toLowerCase();
  if (configured === "claims") return "claims";
  if (configured === "migration") return "migration";
  // Unset: fail closed in production, permit the migration path everywhere else.
  return isProduction() ? "claims" : "migration";
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Read Platform Core entitlement claims off a verified session's `app_metadata`.
 * Returns null when the namespace is absent — meaning "Platform Core said nothing",
 * which is distinct from "Platform Core said no".
 */
export function readEntitlementClaims(appMetadata: unknown): PlatformEntitlementClaims {
  if (typeof appMetadata !== "object" || appMetadata === null || Array.isArray(appMetadata)) {
    return null;
  }

  const namespace = (appMetadata as Record<string, unknown>)[CLAIMS_NAMESPACE];
  if (typeof namespace !== "object" || namespace === null || Array.isArray(namespace)) {
    return null;
  }

  const scoped = namespace as Record<string, unknown>;
  if (!("products" in scoped) && !("organizations" in scoped)) {
    return null;
  }

  return {
    products: toStringArray(scoped.products).map((product) => product.toLowerCase()),
    organizations: toStringArray(scoped.organizations),
  };
}

/**
 * Decide whether an authenticated Platform Core identity may enter Orca.
 *
 * This answers entry only. What the user may *do* inside Orca is still decided by Orca's
 * own organization scope, `EventMember` rows, and `EventMemberRole`.
 */
export function resolveOrcaEntitlement(input: {
  claims: PlatformEntitlementClaims;
  subject: EntitlementSubject;
}): EntitlementDecision {
  const productKey = getOrcaProductKey();
  const mode = resolveEntitlementMode();

  if (input.claims) {
    if (input.claims.products.includes(productKey.toLowerCase())) {
      return {
        status: "GRANTED",
        source: "platform-claims",
        organizationIds: input.claims.organizations,
      };
    }

    // Platform Core spoke and did not include this product. Always authoritative.
    return {
      status: "DENIED",
      reason: "PLATFORM_ENTITLEMENT_MISSING_PRODUCT",
      hint: `This account is not entitled to ${productKey}. Request access in SignalThread Platform Core.`,
    };
  }

  if (mode === "claims") {
    // Fail closed: no entitlement data means no entry, never "assume yes".
    return {
      status: "DENIED",
      reason: "PLATFORM_ENTITLEMENT_UNAVAILABLE",
      hint: "Platform Core did not supply product entitlements for this session.",
    };
  }

  // Migration mode: entry requires state that a human already provisioned in Orca.
  if (!input.subject.platformUserId) {
    return {
      status: "DENIED",
      reason: "PLATFORM_IDENTITY_NOT_LINKED",
      hint: "This account is not linked to a Platform Core identity yet. Run the platform user id backfill.",
    };
  }

  if (!input.subject.hasProvisionedOrcaAccess) {
    return {
      status: "DENIED",
      reason: "ORCA_ACCESS_NOT_PROVISIONED",
      hint: "This account has no Orca organization access. An administrator must provision it.",
    };
  }

  return { status: "GRANTED", source: "migration-provisioned", organizationIds: [] };
}

/** True when entitlements are being satisfied by pre-Platform-Core migration state. */
export function isMigrationEntitlementModeActive(): boolean {
  return resolveEntitlementMode() === "migration";
}

/**
 * Entitlement claims for the development identity fallback (`DEV_USER_ID`/`DEV_USER_EMAIL`).
 *
 * The fallback is an explicit development-only bypass of the authentication authority, and
 * it needs a matching entitlement or every local and Playwright session would be denied.
 * This returns null outside development, so it can never grant entry in production even if
 * it were reached by mistake.
 */
export function createDevelopmentEntitlementClaims(): PlatformEntitlementClaims {
  if (process.env.NODE_ENV === "production") return null;
  return { products: [getOrcaProductKey().toLowerCase()], organizations: [] };
}

/**
 * Whether a denial may be waived by the development-only bypass.
 *
 * Only *absent* entitlement data is waivable. When Platform Core has spoken and excluded
 * this product, that answer is authoritative everywhere — a local flag must never override
 * an explicit "no".
 */
export function isEntitlementDenialWaivableInDevelopment(reason: string): boolean {
  return reason !== "PLATFORM_ENTITLEMENT_MISSING_PRODUCT";
}

/**
 * Whether Platform Core organization claims are authoritative for Orca access.
 *
 * Phase 2 hard-coded this to `false`: `claims.organizations` carried **canonical Platform
 * Core** organization ids while Orca's `Organization.id` values were still locally
 * generated, so the two id spaces were not comparable and intersecting them would have
 * denied everyone.
 *
 * Phase 3 adopted the Platform organization uuid *as* `Organization.id`. The id spaces are
 * now the same, so the claim can finally be enforced. Production is authoritative by
 * default; `PLATFORM_ORG_CLAIMS_AUTHORITATIVE` allows an explicit override in either
 * direction for a controlled rollout or rollback.
 */
export function arePlatformOrganizationClaimsAuthoritative(): boolean {
  const raw = process.env.PLATFORM_ORG_CLAIMS_AUTHORITATIVE?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "on") return true;
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return true;
}

export type OrganizationRestriction =
  | { status: "UNRESTRICTED"; orgIds: string[]; source: "claims-not-authoritative" | "no-org-claim" }
  | { status: "RESTRICTED"; orgIds: string[] }
  | { status: "DENIED"; reason: string; hint: string };

/**
 * Narrow the organizations a user may act in to those Platform Core has granted.
 *
 * This is a **ceiling, never a grant**. A Platform organization claim can only remove
 * organizations from the set Orca already knows the user can reach; it can never add one.
 * Orca product access (an `Organization` row plus a `Membership`) is still required, so a
 * claim naming an organization Orca has never heard of grants nothing.
 *
 * Because the caller passes the already-computed accessible set, a client-supplied cookie
 * or query parameter cannot widen access: selection happens *within* whatever this returns.
 */
export function restrictOrganizationsToPlatformClaims(input: {
  accessibleOrgIds: readonly string[];
  claims: PlatformEntitlementClaims;
}): OrganizationRestriction {
  const accessible = [...new Set(input.accessibleOrgIds)];

  if (!arePlatformOrganizationClaimsAuthoritative()) {
    return { status: "UNRESTRICTED", orgIds: accessible, source: "claims-not-authoritative" };
  }

  // No claims at all means Platform Core said nothing. In production the entitlement gate
  // has already denied this request, so reaching here means migration mode.
  if (!input.claims) {
    return { status: "UNRESTRICTED", orgIds: accessible, source: "no-org-claim" };
  }

  const claimed = [...new Set(input.claims.organizations)];

  if (claimed.length === 0) {
    // Entitled to the product but granted no organization. In production that is an
    // incomplete grant and must fail closed; elsewhere (dev fallback, fixtures) the
    // organization claim is simply not part of the harness.
    if (process.env.NODE_ENV === "production") {
      return {
        status: "DENIED",
        reason: "PLATFORM_ORGANIZATION_CLAIM_MISSING",
        hint: "Platform Core granted Orca access but named no organization for this account.",
      };
    }
    return { status: "UNRESTRICTED", orgIds: accessible, source: "no-org-claim" };
  }

  const claimedSet = new Set(claimed);
  const intersection = accessible.filter((id) => claimedSet.has(id));

  if (intersection.length === 0) {
    return {
      status: "DENIED",
      reason: "PLATFORM_ORGANIZATION_CONTEXT_MISMATCH",
      hint: "The organizations Platform Core granted do not match any Orca organization this account can reach.",
    };
  }

  return { status: "RESTRICTED", orgIds: intersection };
}
