import "server-only";

import { getPlatformAdminClient } from "./admin-client";
import { getOrganizationAccessForUser, isPlatformAdmin } from "./registry";

/**
 * Canonical derivation of `app_metadata.signalthread`.
 *
 * Authorization context is *derived* from the registry, never hand-edited. The
 * shape is org-scoped on purpose: two flat arrays (`products[]`, `organizations[]`)
 * cannot express "entitled in org A but not in org B", so a product reading them
 * must either over-grant or guess.
 *
 *   {
 *     "signalthread": {
 *       "v": 1,
 *       "access": [
 *         { "organization_id": "...", "organization_role": "ADMIN", "products": ["orca"] },
 *         { "organization_id": "...", "organization_role": "MEMBER", "products": [] }
 *       ],
 *       "platform_admin": false,
 *       "synced_at": "2026-08-25T12:00:00.000Z"
 *     }
 *   }
 *
 * An organization the user belongs to WITHOUT an entitlement still appears, with
 * an empty `products` array. That is load-bearing: it is how a product tells
 * "you are not in this org" apart from "your org has not bought this product",
 * which are different answers with different remedies.
 *
 * Event ids are deliberately absent. They are unbounded and churn constantly;
 * the organization entry is the ceiling, and each product validates the specific
 * event against its own data.
 */

export const SIGNALTHREAD_CLAIM_VERSION = 1;
export const CLAIMS_NAMESPACE = "signalthread";

export type OrgAccessClaim = {
  organization_id: string;
  organization_role: string;
  products: string[];
};

export type SignalThreadClaims = {
  v: number;
  access: OrgAccessClaim[];
  platform_admin: boolean;
  synced_at: string;
};

/**
 * Build the claim for one user from canonical registry state.
 *
 * `syncedAt` is injected rather than read from the clock so the builder is a
 * pure function of (registry state, timestamp) and can be asserted exactly.
 */
export async function buildSignalThreadClaims(
  userId: string,
  syncedAt: string,
): Promise<SignalThreadClaims> {
  const [access, platformAdmin] = await Promise.all([
    getOrganizationAccessForUser(userId),
    isPlatformAdmin(userId),
  ]);

  return {
    v: SIGNALTHREAD_CLAIM_VERSION,
    access: access.map((entry) => ({
      organization_id: entry.organizationId,
      organization_role: entry.organizationRole,
      products: entry.products,
    })),
    platform_admin: platformAdmin,
    synced_at: syncedAt,
  };
}

/** Order-insensitive comparison so a no-op sync is detectable. */
function claimsEqual(a: unknown, b: SignalThreadClaims): boolean {
  if (typeof a !== "object" || a === null) return false;
  const prev = a as Partial<SignalThreadClaims>;
  if (prev.v !== b.v || prev.platform_admin !== b.platform_admin) return false;
  const norm = (list: OrgAccessClaim[] | undefined) =>
    JSON.stringify(
      (list ?? [])
        .map((e) => ({ ...e, products: [...(e.products ?? [])].sort() }))
        .sort((x, y) => x.organization_id.localeCompare(y.organization_id)),
    );
  return norm(prev.access) === norm(b.access);
}

export type ClaimSyncResult = {
  userId: string;
  claims: SignalThreadClaims;
  /** False when the derived claim already matched what was stored. */
  changed: boolean;
};

/**
 * Write the derived claim to `app_metadata`, replacing whatever was there.
 *
 * Idempotent: re-running with an unchanged registry reports `changed: false` and
 * skips the write, so a sync loop cannot churn tokens. The whole namespace is
 * replaced rather than merged -- a stale legacy key left behind would be exactly
 * the kind of thing that silently widens access later.
 *
 * `user_metadata` is never read or written here. It is user-editable and must
 * never carry authorization.
 */
export async function syncSignalThreadClaims(
  userId: string,
  syncedAt: string,
): Promise<ClaimSyncResult> {
  const supabase = getPlatformAdminClient();
  const claims = await buildSignalThreadClaims(userId, syncedAt);

  const { data: existing, error: readError } = await supabase.auth.admin.getUserById(userId);
  if (readError) throw new Error(`Failed to read user ${userId}: ${readError.message}`);

  const current = (existing.user?.app_metadata ?? {}) as Record<string, unknown>;
  if (claimsEqual(current[CLAIMS_NAMESPACE], claims)) {
    return { userId, claims, changed: false };
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { ...current, [CLAIMS_NAMESPACE]: claims },
  });
  if (updateError) throw new Error(`Failed to sync claims for ${userId}: ${updateError.message}`);

  return { userId, claims, changed: true };
}

/**
 * Re-sync every member of an organization.
 *
 * Entitlement changes are org-wide, so granting or revoking a product must
 * refresh every member's claim, not just the actor's.
 */
export async function syncClaimsForOrganization(
  organizationId: string,
  syncedAt: string,
): Promise<ClaimSyncResult[]> {
  const supabase = getPlatformAdminClient();
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("user_id")
    .eq("organization_id", organizationId);

  if (error) throw new Error(`Failed to list members of ${organizationId}: ${error.message}`);

  const results: ClaimSyncResult[] = [];
  for (const row of data ?? []) {
    results.push(await syncSignalThreadClaims(String(row.user_id), syncedAt));
  }
  return results;
}
