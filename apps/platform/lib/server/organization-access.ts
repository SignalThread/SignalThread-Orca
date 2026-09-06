/**
 * Derivation of a user's organization access from raw registry rows.
 *
 * Pure and free of `server-only` so the filtering rules -- which memberships,
 * organizations and entitlements count -- can be asserted directly. `registry.ts`
 * performs the reads and delegates here.
 */

export type OrgRole = "OWNER" | "ADMIN" | "MEMBER";
export type MembershipStatus = "ACTIVE" | "INVITED" | "SUSPENDED";

export type OrganizationAccess = {
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  organizationRole: OrgRole;
  /** Product keys entitled to this organization, lowercased and sorted. */
  products: string[];
};

export type MembershipRow = {
  organization_id: string;
  role: string;
  status: string;
  organization: { id: string; slug: string; name: string; status: string } | null;
};

export type EntitlementRow = {
  organization_id: string;
  product_key: string;
  status: string;
};

/**
 * Only `ACTIVE` memberships of `ACTIVE` organizations count, and only `ACTIVE`
 * entitlements contribute products. An org the user belongs to without any
 * entitlement is still returned, with an empty `products` array -- that
 * distinction is what lets a product tell "not a member" apart from "member but
 * not entitled".
 */
export function deriveOrganizationAccess(
  memberships: readonly MembershipRow[],
  entitlements: readonly EntitlementRow[],
): OrganizationAccess[] {
  const active = memberships.filter(
    (row) => row.status === "ACTIVE" && row.organization?.status === "ACTIVE",
  );
  if (active.length === 0) return [];

  const productsByOrg = new Map<string, string[]>();
  for (const row of entitlements) {
    if (row.status !== "ACTIVE") continue;
    const key = String(row.organization_id);
    const list = productsByOrg.get(key) ?? [];
    list.push(String(row.product_key).trim().toLowerCase());
    productsByOrg.set(key, list);
  }

  return active
    .map((row) => ({
      organizationId: String(row.organization_id),
      organizationSlug: row.organization!.slug,
      organizationName: row.organization!.name,
      organizationRole: row.role as OrgRole,
      products: [...new Set(productsByOrg.get(String(row.organization_id)) ?? [])].sort(),
    }))
    // Deterministic ordering so an unchanged registry always yields byte-identical claims.
    .sort((a, b) => a.organizationId.localeCompare(b.organizationId));
}
