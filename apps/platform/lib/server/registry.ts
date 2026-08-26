import "server-only";

import { getPlatformAdminClient } from "./admin-client";

/**
 * Read models over the Platform Core registry.
 *
 * These run with the service role, so RLS does not filter them — every function
 * here must therefore scope its own queries explicitly. Route handlers stay thin
 * and call these rather than querying Supabase directly.
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

/**
 * Everything the claim builder needs, in one pass.
 *
 * Only `ACTIVE` memberships of `ACTIVE` organizations count, and only `ACTIVE`
 * entitlements contribute products. An org the user belongs to without any
 * entitlement is still returned, with an empty `products` array -- that
 * distinction is what lets a product tell "not a member" apart from "member but
 * not entitled".
 */
export async function getOrganizationAccessForUser(userId: string): Promise<OrganizationAccess[]> {
  const supabase = getPlatformAdminClient();

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("organization_id, role, status, organizations!inner(id, slug, name, status)")
    .eq("user_id", userId)
    .eq("status", "ACTIVE");

  if (membershipError) throw new Error(`Failed to read memberships: ${membershipError.message}`);

  const active = (memberships ?? []).filter((row) => {
    const org = row.organizations as unknown as { status?: string } | null;
    return org?.status === "ACTIVE";
  });

  if (active.length === 0) return [];

  const orgIds = active.map((row) => row.organization_id as string);

  const { data: entitlements, error: entitlementError } = await supabase
    .from("organization_product_entitlements")
    .select("organization_id, product_key, status")
    .in("organization_id", orgIds)
    .eq("status", "ACTIVE");

  if (entitlementError) throw new Error(`Failed to read entitlements: ${entitlementError.message}`);

  const productsByOrg = new Map<string, string[]>();
  for (const row of entitlements ?? []) {
    const key = String(row.organization_id);
    const list = productsByOrg.get(key) ?? [];
    list.push(String(row.product_key).trim().toLowerCase());
    productsByOrg.set(key, list);
  }

  return active
    .map((row) => {
      const org = row.organizations as unknown as { id: string; slug: string; name: string };
      return {
        organizationId: row.organization_id as string,
        organizationSlug: org.slug,
        organizationName: org.name,
        organizationRole: row.role as OrgRole,
        products: [...new Set(productsByOrg.get(row.organization_id as string) ?? [])].sort(),
      };
    })
    // Deterministic ordering so an unchanged registry always yields byte-identical claims.
    .sort((a, b) => a.organizationId.localeCompare(b.organizationId));
}

/** Platform admin authority, read only from the canonical table. */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const supabase = getPlatformAdminClient();
  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to read platform admin authority: ${error.message}`);
  return data !== null;
}

/** Events the user can reach, derived from org membership. Never placed in a JWT. */
export async function getEventsForUser(userId: string) {
  const access = await getOrganizationAccessForUser(userId);
  if (access.length === 0) return [];

  const supabase = getPlatformAdminClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, slug, name, status, organization_id")
    .in("organization_id", access.map((entry) => entry.organizationId))
    .neq("status", "ARCHIVED")
    .order("name");

  if (error) throw new Error(`Failed to read events: ${error.message}`);
  return data ?? [];
}
