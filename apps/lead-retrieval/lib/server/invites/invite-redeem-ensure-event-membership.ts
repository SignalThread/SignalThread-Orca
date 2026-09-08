import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import {
  mergeEventUserPermissionsForInviteRedeem,
  toEventUserPermissionsJsonForRedeem
} from "@/lib/server/invites/invite-redeem-event-permissions";

/**
 * Create or update `event_users` for invite redeem/claim. Verifies the write
 * produced a row (insert/update) so the route cannot “succeed” with zero
 * `event_users` when Postgrest returns no error but affects 0 rows.
 */
export async function ensureEventMembershipForInviteRedeem(input: {
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  eventId: string;
  exhibitorCompanyId: string;
  permissions: unknown;
}): Promise<void> {
  const { data: scopedMembership, error: scopedLookupErr } = await (input.admin as any)
    .from("event_users")
    .select("id, permissions")
    .eq("user_id", input.userId)
    .eq("event_id", input.eventId)
    .eq("exhibitor_company_id", input.exhibitorCompanyId)
    .maybeSingle();

  if (scopedLookupErr) {
    throw new Error(scopedLookupErr.message ?? "Failed loading membership.");
  }

  if (scopedMembership?.id) {
    const merged = mergeEventUserPermissionsForInviteRedeem(
      scopedMembership.permissions,
      input.permissions
    );
    const { data: updated, error: upErr } = await (input.admin as any)
      .from("event_users")
      .update({ permissions: toEventUserPermissionsJsonForRedeem(merged) })
      .eq("id", scopedMembership.id)
      .select("id")
      .maybeSingle();

    if (upErr) {
      throw new Error(upErr.message ?? "Failed updating membership permissions.");
    }
    if (!updated?.id) {
      throw new Error("Failed updating membership (no row matched).");
    }
    return;
  }

  const { data: nullScoped, error: nullScopedErr } = await (input.admin as any)
    .from("event_users")
    .select("id, permissions")
    .eq("user_id", input.userId)
    .eq("event_id", input.eventId)
    .is("exhibitor_company_id", null)
    .maybeSingle();

  if (nullScopedErr) {
    throw new Error(nullScopedErr.message ?? "Failed loading membership scope.");
  }

  if (nullScoped?.id) {
    const merged = mergeEventUserPermissionsForInviteRedeem(nullScoped.permissions, input.permissions);
    const { data: updated, error: updateErr } = await (input.admin as any)
      .from("event_users")
      .update({
        exhibitor_company_id: input.exhibitorCompanyId,
        permissions: toEventUserPermissionsJsonForRedeem(merged)
      })
      .eq("id", nullScoped.id)
      .select("id")
      .maybeSingle();

    if (updateErr) {
      throw new Error(updateErr.message ?? "Failed updating membership scope.");
    }
    if (!updated?.id) {
      throw new Error("Failed updating membership scope (no row matched).");
    }
    return;
  }

  const { data: inserted, error: insertErr } = await (input.admin as any)
    .from("event_users")
    .insert({
      user_id: input.userId,
      event_id: input.eventId,
      exhibitor_company_id: input.exhibitorCompanyId,
      status: "invited",
      permissions: toEventUserPermissionsJsonForRedeem(input.permissions),
      created_at: new Date().toISOString()
    })
    .select("id")
    .maybeSingle();

  if (insertErr) {
    throw new Error(insertErr.message ?? "Failed creating membership.");
  }
  if (!inserted?.id) {
    throw new Error("Failed creating membership (no row returned).");
  }
}
