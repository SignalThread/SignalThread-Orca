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

/** One organization's access as named by Platform Core. */
export type OrgScopedAccess = Readonly<{
  organizationId: string;
  organizationRole: string;
  /** Product keys entitled to this organization. Empty means member-but-not-entitled. */
  products: readonly string[];
}>;

export type PlatformEntitlementClaims = Readonly<{
  /** 1 = structured org-scoped contract. 0 = legacy flat arrays. */
  version: number;
  access: readonly OrgScopedAccess[];
  /** True when this was projected from the legacy flat shape. */
  legacy: boolean;
  /** Platform admin authority. Derived from canonical state only, never from legacy claims. */
  platformAdmin: boolean;
  /** ISO timestamp Platform Core derived this claim, when it supplied one. */
  syncedAt?: string | null;
  /**
   * Set only by `createDevelopmentEntitlementClaims`, which returns null in production.
   *
   * The development identity fallback needs to satisfy the entry gate without naming an
   * organization. Rather than reintroducing a product list that is not organization-scoped,
   * the bypass is marked explicitly: `readEntitlementClaims` never sets this, so no claim
   * arriving from Platform Core can carry it.
   */
  developmentBypass?: boolean;
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
      /**
       * Organizations in which this product is actually entitled -- the ceiling Orca
       * narrows its own access against.
       *
       * This used to be every organization the claim mentioned, which meant an
       * entitlement held by one organization produced a ceiling covering all of
       * them. It is now only the entitled subset.
       */
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

  // Structured org-scoped contract. Authoritative whenever present: if Platform Core
  // speaks the current language, the legacy arrays beside it are ignored entirely,
  // which is what stops a stale flat claim widening anything.
  if (Array.isArray(scoped.access)) {
    const access: OrgScopedAccess[] = [];
    for (const entry of scoped.access) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
      const row = entry as Record<string, unknown>;
      const organizationId = typeof row.organization_id === "string" ? row.organization_id.trim() : "";
      if (!organizationId) continue;
      access.push({
        organizationId,
        organizationRole:
          typeof row.organization_role === "string" ? row.organization_role.trim() : "",
        products: toStringArray(row.products).map((product) => product.toLowerCase()),
      });
    }
    return {
      version: typeof scoped.v === "number" ? scoped.v : 1,
      access,
      legacy: false,
      platformAdmin: scoped.platform_admin === true,
      syncedAt: typeof scoped.synced_at === "string" ? scoped.synced_at : null,
    };
  }

  // Legacy flat contract: two independent arrays that cannot express per-organization
  // entitlement. Retained only so sessions issued before the cutover keep working.
  if (!("products" in scoped) && !("organizations" in scoped)) {
    return null;
  }

  const products = toStringArray(scoped.products).map((product) => product.toLowerCase());
  const organizations = toStringArray(scoped.organizations);

  return {
    version: 0,
    // The legacy shape genuinely cannot say which organization an entitlement belongs
    // to, so every named organization is projected with the named products. That is
    // the literal meaning of the old contract and no wider -- and because a structured
    // claim short-circuits above, this projection can never add to one.
    access: organizations.map((organizationId) => ({
      organizationId,
      organizationRole: "",
      products,
    })),
    legacy: true,
    // Legacy claims never confer Platform admin authority.
    platformAdmin: false,
    // The legacy contract carries no derivation timestamp.
    syncedAt: null,
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
  /**
   * The organization the request is scoped to.
   *
   * When supplied, entitlement is decided for that organization alone, which is the
   * only correct question: the same user can be entitled in one organization and not
   * in another. When omitted this answers the entry-gate question -- "may this account
   * open Orca at all" -- and returns every entitled organization as the ceiling.
   */
  organizationId?: string | null;
}): EntitlementDecision {
  const productKey = getOrcaProductKey();
  const mode = resolveEntitlementMode();

  if (input.claims) {
    const wanted = productKey.toLowerCase();
    const target = input.claims.access.filter(
      (entry) => entry.products.includes(wanted),
    );

    if (input.organizationId) {
      const scoped = input.claims.access.find(
        (entry) => entry.organizationId === input.organizationId,
      );

      if (!scoped) {
        // The claim never mentions this organization: the user is not a member of it.
        return {
          status: "DENIED",
          reason: "PLATFORM_ORG_NOT_MEMBER",
          hint: "This account is not a member of that organization in SignalThread Platform Core.",
        };
      }

      if (!scoped.products.includes(wanted)) {
        // Member, but the organization holds no entitlement to this product. A
        // distinct answer from "not a member": the remedy is an entitlement grant,
        // not a membership.
        return {
          status: "DENIED",
          reason: "PLATFORM_PRODUCT_NOT_ENTITLED",
          hint: `That organization is not entitled to ${productKey}. Request access in SignalThread Platform Core.`,
        };
      }

      return {
        status: "GRANTED",
        source: "platform-claims",
        organizationIds: [scoped.organizationId],
      };
    }

    if (target.length > 0) {
      return {
        status: "GRANTED",
        source: "platform-claims",
        // Only the entitled organizations, never every organization named by the claim.
        organizationIds: target.map((entry) => entry.organizationId),
      };
    }

    // The development identity fallback entitles the product without naming an
    // organization. Guarded twice: the marker is only ever set by the dev fallback,
    // and that function already returns null in production -- this second check means
    // a forged marker still cannot grant entry in a production build.
    if (input.claims.developmentBypass === true && !isProduction()) {
      return { status: "GRANTED", source: "platform-claims", organizationIds: [] };
    }

    // Platform Core spoke and did not entitle this product anywhere. Always authoritative.
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

/**
 * How long a claim may be trusted after Platform Core derived it.
 *
 * `app_metadata` is embedded in the access token at issue time. When Platform Core
 * re-derives a claim -- an entitlement granted or revoked, a membership changed --
 * sessions already holding a token keep the OLD claim until that token is refreshed.
 * Supabase refreshes automatically when the access token expires (one hour by
 * default), so the worst-case staleness window is one token lifetime.
 *
 * That window is acceptable for grants (a user waits at most an hour for new access)
 * but not always for revocations. `PLATFORM_CLAIM_MAX_AGE_SECONDS` lets a deployment
 * bound it explicitly: past that age the claim is treated as unusable and the user
 * must present a refreshed token.
 *
 * Unset means "trust the token lifetime", which is the default and changes nothing.
 */
export function getClaimMaxAgeSeconds(): number | null {
  const raw = process.env.PLATFORM_CLAIM_MAX_AGE_SECONDS?.trim();
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export type ClaimFreshness =
  | { status: "FRESH" }
  | { status: "UNKNOWN" }
  | { status: "STALE"; ageSeconds: number; maxAgeSeconds: number };

/**
 * Assess how old a claim is, using the `synced_at` stamp Platform Core writes.
 *
 * Returns `UNKNOWN` when no bound is configured or the stamp is absent or
 * unparseable -- a missing stamp must not be treated as fresh *or* as expired,
 * because legacy claims carry none.
 */
export function assessClaimFreshness(
  claims: PlatformEntitlementClaims,
  now: Date = new Date(),
): ClaimFreshness {
  const maxAgeSeconds = getClaimMaxAgeSeconds();
  if (!claims || maxAgeSeconds === null) return { status: "UNKNOWN" };

  const syncedAt = claims.syncedAt;
  if (!syncedAt) return { status: "UNKNOWN" };

  const issued = Date.parse(syncedAt);
  if (Number.isNaN(issued)) return { status: "UNKNOWN" };

  const ageSeconds = Math.max(0, Math.floor((now.getTime() - issued) / 1000));
  return ageSeconds > maxAgeSeconds
    ? { status: "STALE", ageSeconds, maxAgeSeconds }
    : { status: "FRESH" };
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
  // No organization entries: the fallback satisfies the entry gate without naming an
  // organization ceiling, so Orca's own membership remains the only scope.
  return { version: 1, access: [], legacy: false, platformAdmin: false, developmentBypass: true };
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

  // The ceiling is the organizations in which this product is actually entitled --
  // not every organization the claim mentions. Under the structured contract a user
  // can be a member of an organization that holds no Orca entitlement, and that
  // organization must not enter the ceiling.
  const productKey = getOrcaProductKey().toLowerCase();
  const claimed = [
    ...new Set(
      input.claims.access
        .filter((entry) => entry.products.includes(productKey))
        .map((entry) => entry.organizationId),
    ),
  ];

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
