import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeEventUserPermissions,
  reconcileLicenseSeatsUsed,
  toEventUserPermissionsJson
} from "@/lib/server/event-user-access";

export type AccountSelfDeleteResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * Self-serve account deletion for the authenticated user only (mobile contract).
 * Does not delete companies, events, leads, or other users.
 */
export async function deleteAccountForSessionUser(userId: string): Promise<AccountSelfDeleteResult> {
  const supabase = createAdminClient() as any;

  const { data: organizerCompanies, error: organizerErr } = await supabase
    .from("companies")
    .select("id")
    .eq("organizer_id", userId)
    .limit(1);

  if (organizerErr) {
    return { ok: false, error: organizerErr.message ?? "Could not verify account scope.", status: 500 };
  }
  if (organizerCompanies?.length) {
    return {
      ok: false,
      error:
        "This account is the organizer for one or more companies. Transfer ownership or contact support before deleting your account.",
      status: 403
    };
  }

  const { data: profile, error: profileErr } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr) {
    return { ok: false, error: profileErr.message ?? "Could not load your profile.", status: 500 };
  }

  if (profile?.id) {
    const { data: deletedEventUsers, error: eventUserDeleteError } = await supabase
      .from("event_users")
      .delete()
      .eq("user_id", userId)
      .select("id, event_id, user_id, exhibitor_company_id, status, permissions, created_at");

    if (eventUserDeleteError) {
      return {
        ok: false,
        error: eventUserDeleteError.message ?? "Failed removing event memberships.",
        status: 400
      };
    }

    type DeletedEventUserRow = {
      id?: string;
      event_id?: string;
      user_id?: string;
      exhibitor_company_id?: string | null;
      status?: string | null;
      permissions?: unknown;
      created_at?: string | null;
    };

    const restoredShape = ((deletedEventUsers ?? []) as DeletedEventUserRow[]).map((row) => ({
      ...row,
      permissions: toEventUserPermissionsJson(row.permissions)
    }));

    const reconcileScopeSet = new Set<string>();
    for (const row of restoredShape) {
      const isActive = String(row.status ?? "").toLowerCase() === "active";
      const hasAppAccess = normalizeEventUserPermissions(row.permissions).app;
      const exhibitorCompanyId = row.exhibitor_company_id;
      if (!isActive || !hasAppAccess || !exhibitorCompanyId) {
        continue;
      }
      reconcileScopeSet.add(`${String(row.event_id)}::${exhibitorCompanyId}`);
    }

    for (const scope of reconcileScopeSet) {
      const [scopeEventId, scopeExhibitorCompanyId] = scope.split("::");
      if (!scopeEventId || !scopeExhibitorCompanyId) {
        continue;
      }
      try {
        await reconcileLicenseSeatsUsed({
          eventId: scopeEventId,
          exhibitorCompanyId: scopeExhibitorCompanyId
        });
      } catch (reconcileError) {
        if (restoredShape.length > 0) {
          await supabase.from("event_users").insert(restoredShape);
        }
        const message =
          reconcileError instanceof Error
            ? reconcileError.message
            : "Failed reconciling license seats after removing memberships.";
        return { ok: false, error: message, status: 500 };
      }
    }

    const { error: clearReviewErr } = await supabase
      .from("import_batch_row_briefings")
      .update({ reviewed_by: null })
      .eq("reviewed_by", userId);

    if (clearReviewErr) {
      return {
        ok: false,
        error: clearReviewErr.message ?? "Could not clear briefing review references.",
        status: 500
      };
    }

    const { error: userDeleteError } = await supabase.from("users").delete().eq("id", userId);
    if (userDeleteError) {
      return {
        ok: false,
        error: userDeleteError.message ?? "Could not remove your profile.",
        status: 400
      };
    }
  }

  const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
  if (authDeleteError) {
    return {
      ok: false,
      error: authDeleteError.message ?? "Could not remove login credentials.",
      status: 500
    };
  }

  return { ok: true };
}
