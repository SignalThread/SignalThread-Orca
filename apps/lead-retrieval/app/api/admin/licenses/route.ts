import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getOrganizerScope } from "@/lib/data/organizer-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminLicenseStatus } from "@/lib/data/admin-licenses-types";
import { generateLicenseKey } from "@/lib/licenses/utils";
import {
  normalizeLicenseBilling,
  normalizeLicenseBillingSource,
  normalizeLicenseScope,
  type AdminLicenseBilling,
  type AdminLicenseBillingSource,
  type AdminLicenseScope
} from "@/lib/licenses/admin-license-create-validation";
import { organizerAdminMayAccessExhibitorCompany } from "@/lib/server/organizer-exhibitor-company-access";
import { resolveCompanyScopedLicenseOwnerServer } from "@/lib/server/resolve-company-scoped-license-owner-server";
import { resolveCanCreateEventsForNewLicense } from "@/lib/licenses/license-can-create-events-default";

type CreateLicensePayload = {
  eventId?: string;
  exhibitorCompanyId?: string;
  /** Billing / host company for company-scoped licenses when there is no exhibitors row yet. */
  hostCompanyId?: string;
  licensePlanId?: string | null;
  termMonths?: number;
  seatsTotal?: number;
  priceCents?: number;
  currency?: string;
  startsAt?: string | null;
  expiresAt?: string;
  status?: AdminLicenseStatus;
  scope?: string;
  billing?: string;
  billingSource?: string;
  /** Default true for company-scoped licenses (product policy). */
  canCreateEvents?: boolean;
};

function normalizeStatus(input: unknown): AdminLicenseStatus | null {
  const value = String(input ?? "").toLowerCase();
  if (value === "active" || value === "trial" || value === "expired") {
    return value;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (sessionUser.role !== "platform_admin" && sessionUser.role !== "organizer_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let payload: CreateLicensePayload;
    try {
      payload = (await request.json()) as CreateLicensePayload;
    } catch {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const scope: AdminLicenseScope = normalizeLicenseScope(payload.scope ?? "event") ?? "event";
    const billing: AdminLicenseBilling = normalizeLicenseBilling(payload.billing ?? "one_time") ?? "one_time";
    const billingSource: AdminLicenseBillingSource =
      normalizeLicenseBillingSource(payload.billingSource ?? "internal") ?? "internal";

    const eventId = String(payload.eventId ?? "").trim();
    const companyId = String(payload.exhibitorCompanyId ?? "").trim();
    const hostCompanyId = String(payload.hostCompanyId ?? "").trim();
    const canCreateEventsExplicit = payload.canCreateEvents;
    const termMonths = Number(payload.termMonths ?? 0);
    const seatsTotal = Number(payload.seatsTotal ?? 0);
    const priceCents = Number(payload.priceCents ?? 0);
    const currency = String(payload.currency ?? "USD").trim().toUpperCase() || "USD";
    const startsAt = payload.startsAt ? String(payload.startsAt).trim() : null;
    const expiresAt = String(payload.expiresAt ?? "").trim();
    const status = normalizeStatus(payload.status ?? "active");

    if (!companyId) {
      return NextResponse.json({ error: "exhibitorCompanyId is required" }, { status: 400 });
    }
    if (scope === "company" && sessionUser.role !== "platform_admin") {
      return NextResponse.json(
        { error: "Only platform admins can create company-scoped licenses." },
        { status: 403 }
      );
    }
    if (scope === "event" && !eventId) {
      return NextResponse.json({ error: "eventId is required for event-scoped licenses" }, { status: 400 });
    }
    if (!Number.isInteger(seatsTotal) || seatsTotal <= 0) {
      return NextResponse.json({ error: "seatsTotal must be a whole number greater than 0" }, { status: 400 });
    }
    if (!Number.isInteger(termMonths) || termMonths <= 0) {
      return NextResponse.json({ error: "termMonths must be a whole number greater than 0" }, { status: 400 });
    }
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      return NextResponse.json({ error: "priceCents must be a positive number" }, { status: 400 });
    }
    if (!expiresAt) {
      return NextResponse.json({ error: "expiresAt is required" }, { status: 400 });
    }
    if (!status) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const supabase = createAdminClient();

    if (sessionUser.role === "organizer_admin") {
      const orgScope = await getOrganizerScope(sessionUser.id);
      const mayAccess = await organizerAdminMayAccessExhibitorCompany(supabase, orgScope, companyId);
      if (!mayAccess) {
        return NextResponse.json({ error: "Exhibitor company is outside organizer scope" }, { status: 403 });
      }
      if (scope === "event") {
        const scopedEventIds = new Set(orgScope.events.map((event) => event.id));
        if (!scopedEventIds.has(eventId)) {
          return NextResponse.json({ error: "Selected event is outside organizer scope" }, { status: 403 });
        }
      }
      if (scope === "company" && hostCompanyId) {
        const allowedHost = orgScope.events.some((e) => e.companyId === hostCompanyId);
        if (!allowedHost) {
          return NextResponse.json({ error: "Host company is outside organizer scope" }, { status: 403 });
        }
      }
    }

    let licenseOwnerCompanyId: string;

    if (scope === "event") {
      const { data: eventRow, error: eventError } = await (supabase as any)
        .from("events")
        .select("id, company_id")
        .eq("id", eventId)
        .maybeSingle();

      if (eventError || !eventRow) {
        return NextResponse.json(
          { error: eventError?.message ?? "Selected event does not exist" },
          { status: 404 }
        );
      }

      licenseOwnerCompanyId = String(eventRow.company_id);

      const { data: exhibitorScope, error: exhibitorScopeError } = await (supabase as any)
        .from("exhibitors")
        .select("id")
        .eq("event_id", eventId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (exhibitorScopeError || !exhibitorScope) {
        return NextResponse.json(
          { error: exhibitorScopeError?.message ?? "Exhibitor is not scoped to the selected event" },
          { status: 400 }
        );
      }

      const { data: existingLicense } = await (supabase as any)
        .from("licenses")
        .select("id")
        .eq("event_id", eventId)
        .eq("exhibitor_company_id", companyId)
        .eq("scope", "event")
        .limit(1)
        .maybeSingle();

      if (existingLicense) {
        return NextResponse.json(
          { error: "A license already exists for this exhibitor on this event. Edit the existing license instead." },
          { status: 409 }
        );
      }
    } else {
      const resolved = await resolveCompanyScopedLicenseOwnerServer(
        supabase,
        companyId,
        hostCompanyId || null
      );
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.error }, { status: 400 });
      }
      licenseOwnerCompanyId = resolved.licenseOwnerCompanyId;

      const { data: existingCompanyLicense } = await (supabase as any)
        .from("licenses")
        .select("id")
        .eq("exhibitor_company_id", companyId)
        .eq("scope", "company")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingCompanyLicense) {
        return NextResponse.json(
          { error: "A company-scoped license already exists for this exhibitor. Edit the existing license instead." },
          { status: 409 }
        );
      }
    }

    const canCreateEvents = resolveCanCreateEventsForNewLicense(scope, canCreateEventsExplicit);

    const { data, error } = await (supabase as any)
      .from("licenses")
      .insert({
        event_id: scope === "event" ? eventId : null,
        company_id: licenseOwnerCompanyId,
        exhibitor_company_id: companyId,
        license_key: generateLicenseKey(),
        license_plan_id: payload.licensePlanId || null,
        term_months: termMonths,
        seats_total: seatsTotal,
        price_cents: Math.round(priceCents),
        currency,
        starts_at: startsAt,
        expires_at: expiresAt,
        status,
        scope,
        billing,
        billing_source: billingSource,
        can_create_events: canCreateEvents
      })
      .select(
        "id, event_id, company_id, exhibitor_company_id, license_plan_id, term_months, price_cents, currency, starts_at, expires_at, seats_total, seats_used, status, created_at, scope, billing, billing_source"
      )
      .maybeSingle();

    if (error) {
      const pgCode = String((error as { code?: string }).code ?? "");
      if (pgCode === "23505") {
        return NextResponse.json(
          {
            error: "A conflicting license already exists for this exhibitor (unique constraint)."
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message ?? "Failed to create license" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, license: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
