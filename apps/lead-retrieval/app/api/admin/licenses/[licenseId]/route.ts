import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getOrganizerScope } from "@/lib/data/organizer-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  countConsumedAppSeatsForCompanyScope,
  reconcileCompanyLicenseSeatsUsed,
  reconcileLicenseSeatsUsed
} from "@/lib/server/event-user-access";
import type { AdminLicenseStatus } from "@/lib/data/admin-licenses-types";
import {
  normalizeLicenseBilling,
  normalizeLicenseBillingSource,
  normalizeLicenseScope
} from "@/lib/licenses/admin-license-create-validation";

type EditLicensePayload = {
  action: "edit";
  licensePlanId?: string | null;
  status?: AdminLicenseStatus;
  expiration?: string;
  priceCents?: number;
  scope?: string;
  billing?: string;
  billingSource?: string;
  /** Required when changing scope to `event` from a company-scoped row. */
  eventId?: string;
};

type AddSeatsPayload = {
  action: "add_seats";
  seatsToAdd?: number;
};

type DeactivatePayload = {
  action: "deactivate";
};

type LicenseMutationPayload = EditLicensePayload | AddSeatsPayload | DeactivatePayload;

function normalizeStatus(input: unknown): AdminLicenseStatus | null {
  const value = String(input ?? "").toLowerCase();
  if (value === "active" || value === "trial" || value === "expired") {
    return value;
  }
  return null;
}

function isOrganizerDeniedForLicense(
  role: string,
  license: { event_id: string | null; exhibitor_company_id: string | null },
  orgScope: Awaited<ReturnType<typeof getOrganizerScope>>
): boolean {
  if (role !== "organizer_admin") return false;
  const exhibitorId = String(license.exhibitor_company_id ?? "");
  if (!orgScope.companyIds.includes(exhibitorId)) return true;
  const evt = license.event_id ? String(license.event_id) : "";
  if (!evt) return false;
  return !orgScope.events.some((e) => e.id === evt);
}

const LICENSE_SELECT =
  "id, event_id, company_id, exhibitor_company_id, license_plan_id, term_months, price_cents, currency, starts_at, expires_at, seats_total, seats_used, status, created_at, scope, billing, billing_source";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ licenseId: string }> }
) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (sessionUser.role !== "platform_admin" && sessionUser.role !== "organizer_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { licenseId: rawLicenseId } = await params;
    const licenseId = rawLicenseId.trim();
    if (!licenseId) {
      return NextResponse.json({ error: "Missing license id in route" }, { status: 400 });
    }

    let payload = {} as Partial<LicenseMutationPayload>;
    try {
      payload = (await request.json()) as Partial<LicenseMutationPayload>;
    } catch {
      payload = {};
    }

    if (!payload.action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    if (sessionUser.role === "organizer_admin") {
      const [orgScope, licenseLookup] = await Promise.all([
        getOrganizerScope(sessionUser.id),
        (supabase as any)
          .from("licenses")
          .select("id, event_id, company_id, exhibitor_company_id")
          .eq("id", licenseId)
          .maybeSingle()
      ]);

      if (licenseLookup.error || !licenseLookup.data) {
        return NextResponse.json({ error: licenseLookup.error?.message ?? "License not found" }, { status: 404 });
      }

      if (isOrganizerDeniedForLicense(sessionUser.role, licenseLookup.data, orgScope)) {
        return NextResponse.json({ error: "License is outside organizer scope" }, { status: 403 });
      }
    }

    if (payload.action === "deactivate") {
      const { data, error } = await (supabase as any)
        .from("licenses")
        .update({ status: "expired" })
        .eq("id", licenseId)
        .select(LICENSE_SELECT)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message ?? "Failed to deactivate license" }, { status: 400 });
      }
      if (!data) {
        return NextResponse.json({ error: "License not found" }, { status: 404 });
      }

      return NextResponse.json({ ok: true, license: data });
    }

    if (payload.action === "add_seats") {
      const seatsToAdd = Number(payload.seatsToAdd ?? 0);
      if (!Number.isInteger(seatsToAdd) || seatsToAdd <= 0) {
        return NextResponse.json({ error: "seatsToAdd must be greater than 0" }, { status: 400 });
      }

      const { data: currentRow, error: currentError } = await (supabase as any)
        .from("licenses")
        .select("id, seats_total")
        .eq("id", licenseId)
        .maybeSingle();

      if (currentError) {
        return NextResponse.json({ error: currentError.message ?? "Failed loading license" }, { status: 400 });
      }
      if (!currentRow) {
        return NextResponse.json({ error: "License not found" }, { status: 404 });
      }

      const nextSeatsTotal = Math.max(0, Number(currentRow.seats_total ?? 0)) + seatsToAdd;

      const { data, error } = await (supabase as any)
        .from("licenses")
        .update({ seats_total: nextSeatsTotal })
        .eq("id", licenseId)
        .select(LICENSE_SELECT)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message ?? "Failed to add seats" }, { status: 400 });
      }
      if (!data) {
        return NextResponse.json({ error: "License not found" }, { status: 404 });
      }

      return NextResponse.json({ ok: true, license: data });
    }

    const patch: Record<string, unknown> = {};

    if (payload.action === "edit") {
      if ("licensePlanId" in payload) {
        patch.license_plan_id = payload.licensePlanId || null;
      }

      if ("status" in payload) {
        const status = normalizeStatus(payload.status);
        if (!status) {
          return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }
        patch.status = status;
      }

      if ("expiration" in payload) {
        const expiration = String(payload.expiration ?? "").trim();
        if (!expiration) {
          return NextResponse.json({ error: "Expiration is required" }, { status: 400 });
        }
        patch.expires_at = expiration;
      }

      if ("priceCents" in payload) {
        const priceCents = Number(payload.priceCents ?? 0);
        if (!Number.isFinite(priceCents) || priceCents < 0) {
          return NextResponse.json({ error: "priceCents must be a positive number" }, { status: 400 });
        }
        patch.price_cents = Math.round(priceCents);
      }

      if ("billing" in payload) {
        const billing = normalizeLicenseBilling(payload.billing);
        if (!billing) {
          return NextResponse.json({ error: "Invalid billing" }, { status: 400 });
        }
        patch.billing = billing;
      }

      if ("billingSource" in payload) {
        const billingSource = normalizeLicenseBillingSource(payload.billingSource);
        if (!billingSource) {
          return NextResponse.json({ error: "Invalid billingSource" }, { status: 400 });
        }
        patch.billing_source = billingSource;
      }

      if ("scope" in payload) {
        const nextScope = normalizeLicenseScope(payload.scope);
        if (!nextScope) {
          return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
        }
        patch.scope = nextScope;
        if (nextScope === "company") {
          patch.event_id = null;
        } else {
          const nextEventId = String(payload.eventId ?? "").trim();
          if (!nextEventId) {
            return NextResponse.json(
              { error: "eventId is required when changing scope to event" },
              { status: 400 }
            );
          }
          const { data: licRow } = await (supabase as any)
            .from("licenses")
            .select("exhibitor_company_id")
            .eq("id", licenseId)
            .maybeSingle();
          const exhibitorCompanyId = String(licRow?.exhibitor_company_id ?? "").trim();
          if (exhibitorCompanyId) {
            const { data: exhRow } = await (supabase as any)
              .from("exhibitors")
              .select("id")
              .eq("event_id", nextEventId)
              .eq("company_id", exhibitorCompanyId)
              .maybeSingle();
            if (!exhRow) {
              return NextResponse.json(
                { error: "Exhibitor is not scoped to the selected event" },
                { status: 400 }
              );
            }
          }
          patch.event_id = nextEventId;
        }
      }

      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: "No fields supplied for edit" }, { status: 400 });
      }

      const { data, error } = await (supabase as any)
        .from("licenses")
        .update(patch)
        .eq("id", licenseId)
        .select(LICENSE_SELECT)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message ?? "Failed to update license" }, { status: 400 });
      }
      if (!data) {
        return NextResponse.json({ error: "License not found" }, { status: 404 });
      }

      return NextResponse.json({ ok: true, license: data });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Hard-delete a license row. Guarded: blocks if active event_users hold
 * app seats under this license's (event_id, exhibitor_company_id) scope.
 *
 * Query param ?force=true will revoke app access on dependent event_users,
 * clear stale users.license_id references, and then delete.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ licenseId: string }> }
) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (sessionUser.role !== "platform_admin" && sessionUser.role !== "organizer_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { licenseId: rawLicenseId } = await params;
    const licenseId = rawLicenseId.trim();
    if (!licenseId) {
      return NextResponse.json({ error: "Missing license id in route" }, { status: 400 });
    }

    const url = new URL(request.url);
    const forceDelete = url.searchParams.get("force") === "true";

    const supabase = createAdminClient();

    const { data: licenseRow, error: lookupError } = await (supabase as any)
      .from("licenses")
      .select("id, event_id, company_id, exhibitor_company_id, seats_total, seats_used, status, scope")
      .eq("id", licenseId)
      .maybeSingle();

    if (lookupError || !licenseRow) {
      return NextResponse.json(
        { error: lookupError?.message ?? "License not found" },
        { status: 404 }
      );
    }

    if (sessionUser.role === "organizer_admin") {
      const orgScope = await getOrganizerScope(sessionUser.id);
      const scopedEventIds = new Set(orgScope.events.map((e) => e.id));
      const scopedCompanyIds = new Set(orgScope.companyIds);
      const evtId = String(licenseRow.event_id ?? "").trim();
      const exhibitorCo = String(licenseRow.exhibitor_company_id ?? "").trim();
      if (!scopedCompanyIds.has(exhibitorCo)) {
        return NextResponse.json({ error: "License is outside organizer scope" }, { status: 403 });
      }
      if (evtId && !scopedEventIds.has(evtId)) {
        return NextResponse.json({ error: "License is outside organizer scope" }, { status: 403 });
      }
    }

    const eventId = String(licenseRow.event_id ?? "").trim();
    const exhibitorCompanyId = String(licenseRow.exhibitor_company_id ?? "").trim();
    const licenseScope =
      String(licenseRow.scope ?? "event").toLowerCase() === "company" ? "company" : "event";

    let dependentCount = 0;
    if (licenseScope === "company") {
      try {
        dependentCount = await countConsumedAppSeatsForCompanyScope({ exhibitorCompanyId });
      } catch (countErr) {
        return NextResponse.json(
          { error: countErr instanceof Error ? countErr.message : "Failed checking seat dependencies" },
          { status: 500 }
        );
      }
    } else {
      const { count: activeAppUsers, error: countError } = await (supabase as any)
        .from("event_users")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("exhibitor_company_id", exhibitorCompanyId)
        .eq("status", "active")
        .filter("permissions->>app", "eq", "true");

      if (countError) {
        return NextResponse.json(
          { error: countError.message ?? "Failed checking seat dependencies" },
          { status: 500 }
        );
      }

      dependentCount = Number(activeAppUsers ?? 0);
    }

    if (dependentCount > 0 && !forceDelete) {
      return NextResponse.json(
        {
          error: `Cannot delete: ${dependentCount} active app user(s) hold seats under this license. Remove their app access first, or use force delete.`,
          dependentCount
        },
        { status: 409 }
      );
    }

    if (dependentCount > 0 && forceDelete) {
      let appEventUsersQuery = (supabase as any)
        .from("event_users")
        .select("id, user_id, permissions")
        .eq("exhibitor_company_id", exhibitorCompanyId)
        .eq("status", "active")
        .filter("permissions->>app", "eq", "true");

      if (licenseScope !== "company") {
        appEventUsersQuery = appEventUsersQuery.eq("event_id", eventId);
      }

      const { data: appEventUsers, error: fetchError } = await appEventUsersQuery;

      if (fetchError) {
        return NextResponse.json(
          { error: fetchError.message ?? "Failed loading dependent event_users" },
          { status: 500 }
        );
      }

      for (const eu of (appEventUsers ?? []) as Array<{ id: string; user_id: string; permissions: Record<string, unknown> }>) {
        const updatedPerms = { ...(eu.permissions ?? {}), app: false };
        await (supabase as any)
          .from("event_users")
          .update({ permissions: updatedPerms })
          .eq("id", eu.id);
      }
    }

    await (supabase as any)
      .from("users")
      .update({ license_id: null })
      .eq("license_id", licenseId);

    const { data: deletedRows, error: deleteError } = await (supabase as any)
      .from("licenses")
      .delete()
      .eq("id", licenseId)
      .select("id");

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message ?? "Failed to delete license" },
        { status: 500 }
      );
    }

    if (!Array.isArray(deletedRows) || deletedRows.length === 0) {
      return NextResponse.json(
        {
          error:
            "License delete did not remove a row; the license may still exist or the delete was a no-op."
        },
        { status: 500 }
      );
    }

    if (licenseScope === "company" && exhibitorCompanyId) {
      await reconcileCompanyLicenseSeatsUsed({ exhibitorCompanyId }).catch(() => {});
    } else if (eventId && exhibitorCompanyId) {
      await reconcileLicenseSeatsUsed({ eventId, exhibitorCompanyId }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      deleted: licenseId,
      revokedAppAccess: dependentCount > 0 ? dependentCount : 0
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
