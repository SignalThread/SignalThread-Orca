import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getOrganizerScope } from "@/lib/data/organizer-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateLicenseKey } from "@/lib/licenses/utils";
import { resolveCanCreateEventsForNewLicense } from "@/lib/licenses/license-can-create-events-default";

type CreateExhibitorPayload = {
  /** When set, creates an `exhibitors` row and an event-scoped license. */
  eventId?: string;
  /**
   * Billing / host company (organizer account) when `eventId` is omitted.
   * Required for company-only creation so the new company gets a valid `organizer_id`.
   */
  hostCompanyId?: string;
  exhibitorName?: string;
  seatsPurchased?: number;
  licenseStatus?: "active" | "trial" | "expired";
  revenue?: number | null;
};

function getErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return String(error);
  }

  const maybe = error as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  };

  return {
    message: maybe.message ?? null,
    details: maybe.details ?? null,
    hint: maybe.hint ?? null,
    code: maybe.code ?? null
  };
}

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const maybe = error as { code?: string };
  return maybe.code ?? null;
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }
    if (sessionUser.role !== "platform_admin" && sessionUser.role !== "organizer_admin") {
      return NextResponse.json({ message: "Only admin users can create exhibitors." }, { status: 403 });
    }

    let payload: CreateExhibitorPayload;
    try {
      payload = (await request.json()) as CreateExhibitorPayload;
    } catch {
      return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
    }

    const eventId = String(payload.eventId ?? "").trim();
    const hostCompanyIdInput = String(payload.hostCompanyId ?? "").trim();
    const exhibitorName = String(payload.exhibitorName ?? "").trim();
    const seatsPurchased = Number(payload.seatsPurchased ?? 0);
    const licenseStatus = payload.licenseStatus ?? "active";
    const revenue = payload.revenue == null ? 0 : Number(payload.revenue);

    if (!exhibitorName) {
      return NextResponse.json({ message: "exhibitorName is required." }, { status: 400 });
    }
    if (!Number.isInteger(seatsPurchased) || seatsPurchased <= 0) {
      return NextResponse.json({ message: "seatsPurchased must be a positive integer." }, { status: 400 });
    }
    if (!Number.isFinite(revenue) || revenue < 0) {
      return NextResponse.json({ message: "revenue must be a positive number." }, { status: 400 });
    }
    if (!eventId && sessionUser.role !== "platform_admin") {
      return NextResponse.json(
        { message: "Only platform admins can create company-scoped exhibitor accounts." },
        { status: 403 }
      );
    }

    const supabase = createAdminClient();

    let billingHostCompanyId: string;
    let companyOrganizerId: string;
    let expiresAt: string;
    let resolvedEventId: string | null = eventId || null;

    if (eventId) {
      const { data: eventRow, error: eventError } = await (supabase as any)
        .from("events")
        .select("id, end_date, company_id")
        .eq("id", eventId)
        .maybeSingle();

      if (eventError) {
        console.error("createExhibitor event lookup failed", {
          eventId,
          error: getErrorDetails(eventError)
        });
        return NextResponse.json({ message: "Failed validating selected event." }, { status: 500 });
      }
      if (!eventRow) {
        return NextResponse.json({ message: "Selected event was not found." }, { status: 404 });
      }

      if (sessionUser.role === "organizer_admin") {
        const scope = await getOrganizerScope(sessionUser.id);
        const scopedEventIds = new Set(scope.events.map((event) => event.id));
        if (!scopedEventIds.has(eventId)) {
          return NextResponse.json({ message: "Selected event is outside organizer scope." }, { status: 403 });
        }
      }

      billingHostCompanyId = String((eventRow as { company_id: string }).company_id);
      expiresAt =
        (eventRow as { end_date: string | null }).end_date ??
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const { data: eventCompanyRow, error: eventCompanyError } = await (supabase as any)
        .from("companies")
        .select("id, organizer_id")
        .eq("id", billingHostCompanyId)
        .maybeSingle();

      if (eventCompanyError || !eventCompanyRow) {
        return NextResponse.json(
          { message: eventCompanyError?.message ?? "Event company was not found." },
          { status: 400 }
        );
      }

      companyOrganizerId = String((eventCompanyRow as { organizer_id: string }).organizer_id);
    } else {
      if (!hostCompanyIdInput) {
        return NextResponse.json(
          { message: "hostCompanyId is required when eventId is omitted (company-only creation)." },
          { status: 400 }
        );
      }

      if (sessionUser.role === "organizer_admin") {
        const scope = await getOrganizerScope(sessionUser.id);
        const allowedHost = scope.events.some((e) => e.companyId === hostCompanyIdInput);
        if (!allowedHost) {
          return NextResponse.json({ message: "Host company is outside organizer scope." }, { status: 403 });
        }
      }

      const { data: hostRow, error: hostErr } = await (supabase as any)
        .from("companies")
        .select("id, organizer_id")
        .eq("id", hostCompanyIdInput)
        .maybeSingle();

      if (hostErr || !hostRow?.organizer_id) {
        return NextResponse.json(
          { message: hostErr?.message ?? "Host company was not found." },
          { status: 400 }
        );
      }

      billingHostCompanyId = String(hostRow.id);
      companyOrganizerId = String(hostRow.organizer_id);
      expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    }

    const { data: existingCompanies, error: existingCompanyError } = await (supabase as any)
      .from("companies")
      .select("id")
      .ilike("name", exhibitorName)
      .eq("organizer_id", companyOrganizerId)
      .limit(1);

    if (existingCompanyError) {
      console.error("createExhibitor company lookup failed", {
        eventId,
        payload,
        error: getErrorDetails(existingCompanyError)
      });
      return NextResponse.json({ message: "Failed checking for existing exhibitor company." }, { status: 500 });
    }

    const existingCompanyId = (existingCompanies as Array<{ id: string }> | null)?.[0]?.id;

    let companyId = existingCompanyId ?? null;
    if (!companyId) {
      const { data: insertedCompany, error: companyInsertError } = await (supabase as any)
        .from("companies")
        .insert({
          name: exhibitorName,
          organizer_id: companyOrganizerId
        })
        .select("id")
        .single();

      if (companyInsertError || !insertedCompany) {
        return NextResponse.json(
          { message: companyInsertError?.message ?? "Failed creating exhibitor company." },
          { status: 500 }
        );
      }
      companyId = String((insertedCompany as { id: string }).id);
    }

    const priceCents = Math.round(revenue * 100);

    if (eventId) {
      const { data: existingLicense, error: existingLicenseError } = await (supabase as any)
        .from("licenses")
        .select("id")
        .eq("event_id", eventId)
        .eq("exhibitor_company_id", companyId)
        .eq("scope", "event")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingLicenseError) {
        return NextResponse.json(
          { message: existingLicenseError.message ?? "Failed checking existing exhibitor license." },
          { status: 500 }
        );
      }

      if (existingLicense?.id) {
        const { error: updateLicenseError } = await (supabase as any)
          .from("licenses")
          .update({
            company_id: billingHostCompanyId,
            exhibitor_company_id: companyId,
            seats_total: seatsPurchased,
            status: licenseStatus,
            expires_at: expiresAt,
            price_cents: priceCents,
            scope: "event",
            can_create_events: false
          })
          .eq("id", existingLicense.id);

        if (updateLicenseError) {
          return NextResponse.json(
            { message: updateLicenseError.message ?? "Failed updating exhibitor license." },
            { status: 500 }
          );
        }
      } else {
        const { error: insertLicenseError } = await (supabase as any)
          .from("licenses")
          .insert({
            company_id: billingHostCompanyId,
            exhibitor_company_id: companyId,
            event_id: eventId,
            license_key: generateLicenseKey(),
            seats_total: seatsPurchased,
            status: licenseStatus,
            expires_at: expiresAt,
            price_cents: priceCents,
            currency: "USD",
            scope: "event",
            can_create_events: resolveCanCreateEventsForNewLicense("event")
          });

        if (insertLicenseError) {
          return NextResponse.json(
            { message: insertLicenseError.message ?? "Company created, but license creation failed." },
            { status: 500 }
          );
        }
      }
    } else {
      const { data: existingLicense, error: existingLicenseError } = await (supabase as any)
        .from("licenses")
        .select("id")
        .eq("exhibitor_company_id", companyId)
        .eq("scope", "company")
        .is("event_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingLicenseError) {
        return NextResponse.json(
          { message: existingLicenseError.message ?? "Failed checking existing company license." },
          { status: 500 }
        );
      }

      if (existingLicense?.id) {
        const { error: updateLicenseError } = await (supabase as any)
          .from("licenses")
          .update({
            company_id: billingHostCompanyId,
            exhibitor_company_id: companyId,
            seats_total: seatsPurchased,
            status: licenseStatus,
            expires_at: expiresAt,
            price_cents: priceCents,
            scope: "company",
            can_create_events: resolveCanCreateEventsForNewLicense("company")
          })
          .eq("id", existingLicense.id);

        if (updateLicenseError) {
          return NextResponse.json(
            { message: updateLicenseError.message ?? "Failed updating company license." },
            { status: 500 }
          );
        }
      } else {
        const { error: insertLicenseError } = await (supabase as any)
          .from("licenses")
          .insert({
            company_id: billingHostCompanyId,
            exhibitor_company_id: companyId,
            event_id: null,
            license_key: generateLicenseKey(),
            seats_total: seatsPurchased,
            status: licenseStatus,
            expires_at: expiresAt,
            price_cents: priceCents,
            currency: "USD",
            scope: "company",
            can_create_events: resolveCanCreateEventsForNewLicense("company")
          });

        if (insertLicenseError) {
          return NextResponse.json(
            { message: insertLicenseError.message ?? "Company created, but license creation failed." },
            { status: 500 }
          );
        }
      }
    }

    let exhibitorRowId: string | null = null;
    if (eventId) {
      const { data: insertedExhibitorRow, error: exhibitorInsertError } = await (supabase as any)
        .from("exhibitors")
        .insert({
          event_id: eventId,
          company_id: companyId,
          status: "active"
        })
        .select("id")
        .maybeSingle();

      if (!exhibitorInsertError) {
        exhibitorRowId = (insertedExhibitorRow as { id: string } | null)?.id ?? null;
      } else if (getErrorCode(exhibitorInsertError) === "23505") {
        const { data: existingExhibitorRow } = await (supabase as any)
          .from("exhibitors")
          .select("id")
          .eq("event_id", eventId)
          .eq("company_id", companyId)
          .maybeSingle();
        exhibitorRowId = (existingExhibitorRow as { id: string } | null)?.id ?? null;
      } else {
        console.error("createExhibitor exhibitor insert failed", {
          eventId,
          companyId,
          payload,
          error: getErrorDetails(exhibitorInsertError)
        });
        return NextResponse.json({ message: "Failed linking exhibitor to event." }, { status: 500 });
      }
    }

    return NextResponse.json(
      {
        message: eventId
          ? "Exhibitor company linked to the event successfully."
          : "Exhibitor company created successfully.",
        exhibitor: {
          id: exhibitorRowId,
          companyId,
          eventId: resolvedEventId
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("createExhibitor unexpected error", getErrorDetails(error));
    return NextResponse.json({ message: "Unexpected server error while creating exhibitor." }, { status: 500 });
  }
}
