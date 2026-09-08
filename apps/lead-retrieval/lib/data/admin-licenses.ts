import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AdminLicenseBilling,
  AdminLicenseBillingSource,
  AdminLicenseEventOption,
  AdminLicenseExhibitorOption,
  AdminLicenseHostCompanyOption,
  AdminLicensePlanOption,
  AdminLicenseRow,
  AdminLicenseScope,
  AdminLicenseStatus,
  AdminLicensesPageData
} from "@/lib/data/admin-licenses-types";

function normalizeLicenseStatus(value: string | null | undefined): AdminLicenseStatus {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "trial") return "trial";
  if (normalized === "active") return "active";
  return "expired";
}

function normalizeRowScope(value: string | null | undefined): AdminLicenseScope {
  return String(value ?? "").toLowerCase() === "company" ? "company" : "event";
}

function normalizeRowBilling(value: string | null | undefined): AdminLicenseBilling {
  return String(value ?? "").toLowerCase() === "monthly" ? "monthly" : "one_time";
}

function normalizeRowBillingSource(value: string | null | undefined): AdminLicenseBillingSource {
  const v = String(value ?? "").toLowerCase();
  if (v === "stripe") return "stripe";
  if (v === "app_store") return "app_store";
  if (v === "google_play") return "google_play";
  return "internal";
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const maybe = error as { message?: string; details?: string; hint?: string; code?: string };
    return [
      maybe.message ? `message=${maybe.message}` : null,
      maybe.details ? `details=${maybe.details}` : null,
      maybe.hint ? `hint=${maybe.hint}` : null,
      maybe.code ? `code=${maybe.code}` : null
    ]
      .filter(Boolean)
      .join(" | ");
  }
  return String(error);
}

export async function getAdminLicensesPageData(): Promise<AdminLicensesPageData> {
  const supabase = createAdminClient();

  const [eventsResponse, exhibitorsResponse, licensesResponse, plansResponse] = await Promise.all([
    (supabase as any)
      .from("events")
      .select("id, name, company_id")
      .order("start_date", { ascending: false }),
    (supabase as any)
      .from("exhibitors")
      .select("id, event_id, company_id, created_at"),
    // Global system of record: no event_id / scope filtering here. Optional event lens is client-only.
    (supabase as any)
      .from("licenses")
      .select(
        "id, license_key, event_id, company_id, exhibitor_company_id, license_plan_id, term_months, price_cents, currency, starts_at, expires_at, seats_total, seats_used, status, created_at, scope, billing, billing_source"
      )
      .order("created_at", { ascending: false }),
    (supabase as any)
      .from("license_plans")
      .select("id, code, name, default_term_months, created_at")
      .order("created_at", { ascending: true })
  ]);

  if (eventsResponse.error) {
    throw new Error(`Failed loading events: ${toErrorMessage(eventsResponse.error)}`);
  }
  if (exhibitorsResponse.error) {
    throw new Error(`Failed loading exhibitors: ${toErrorMessage(exhibitorsResponse.error)}`);
  }
  if (licensesResponse.error) {
    throw new Error(`Failed loading licenses: ${toErrorMessage(licensesResponse.error)}`);
  }
  if (plansResponse.error) {
    throw new Error(`Failed loading license plans: ${toErrorMessage(plansResponse.error)}`);
  }

  const events: AdminLicenseEventOption[] = (
    (eventsResponse.data ?? []) as Array<{
      id: string;
      name: string;
      company_id: string | null;
    }>
  ).map((row) => ({
    id: row.id,
    name: row.name,
    companyId: row.company_id ?? null
  }));
  const eventNameById = new Map(events.map((e) => [e.id, e.name]));

  const exhibitorRows = (exhibitorsResponse.data ?? []) as Array<{
    id: string;
    event_id: string;
    company_id: string;
    created_at: string;
  }>;

  const licenseRows = (licensesResponse.data ?? []) as Array<{
    id: string;
    license_key?: string | null;
    event_id: string | null;
    company_id: string;
    exhibitor_company_id: string | null;
    license_plan_id: string | null;
    term_months: number | null;
    price_cents: number | null;
    currency: string | null;
    starts_at: string | null;
    expires_at: string;
    seats_total: number;
    seats_used: number;
    status: string;
    created_at: string;
    scope?: string | null;
    billing?: string | null;
    billing_source?: string | null;
  }>;

  const licensePlans = ((plansResponse.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    default_term_months: number;
  }>).map(
    (row): AdminLicensePlanOption => ({
      id: row.id,
      code: row.code,
      name: row.name,
      defaultTermMonths: Number(row.default_term_months ?? 0)
    })
  );

  const { data: companiesData, error: companiesError } = await (supabase as any)
    .from("companies")
    .select("id, name")
    .order("name", { ascending: true });

  if (companiesError) {
    throw new Error(`Failed loading companies: ${toErrorMessage(companiesError)}`);
  }

  const companyNameById = new Map<string, string>(
    ((companiesData ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name])
  );

  const exhibitorsByEventCompany = new Map<string, AdminLicenseExhibitorOption>();
  for (const row of exhibitorRows) {
    const key = `${row.event_id}:${row.company_id}`;
    if (exhibitorsByEventCompany.has(key)) continue;
    exhibitorsByEventCompany.set(key, {
      id: row.id,
      eventId: row.event_id,
      companyId: row.company_id,
      name: companyNameById.get(row.company_id) ?? "Unknown Exhibitor"
    });
  }

  for (const row of (companiesData ?? []) as Array<{ id: string; name: string }>) {
    const key = `:${row.id}`;
    if (exhibitorsByEventCompany.has(key)) continue;
    exhibitorsByEventCompany.set(key, {
      id: `co-${row.id}`,
      eventId: "",
      companyId: row.id,
      name: row.name
    });
  }

  for (const row of licenseRows) {
    if (normalizeRowScope(row.scope) !== "company") continue;
    const ec = String(row.exhibitor_company_id ?? "").trim();
    if (!ec) continue;
    const key = `:${ec}`;
    if (exhibitorsByEventCompany.has(key)) continue;
    exhibitorsByEventCompany.set(key, {
      id: `co-${ec}`,
      eventId: "",
      companyId: ec,
      name: companyNameById.get(ec) ?? "Unknown Exhibitor"
    });
  }

  const hostCompanyIds = Array.from(
    new Set(
      events
        .map((e) => e.companyId)
        .filter((value): value is string => Boolean(value && String(value).trim()))
    )
  );

  const { data: hostCompanyRows, error: hostCompaniesError } =
    hostCompanyIds.length > 0
      ? await (supabase as any)
          .from("companies")
          .select("id, name")
          .in("id", hostCompanyIds)
          .order("name", { ascending: true })
      : { data: [], error: null };

  if (hostCompaniesError) {
    throw new Error(`Failed loading host companies: ${toErrorMessage(hostCompaniesError)}`);
  }

  const hostCompanies: AdminLicenseHostCompanyOption[] = ((hostCompanyRows ?? []) as AdminLicenseHostCompanyOption[]).map(
    (row) => ({
      id: row.id,
      name: row.name
    })
  );

  const planById = new Map(licensePlans.map((row) => [row.id, row]));

  const licenses: AdminLicenseRow[] = licenseRows.map((row) => {
    const exhibitorCompanyId = row.exhibitor_company_id ?? row.company_id;
    const plan = row.license_plan_id ? planById.get(row.license_plan_id) : null;
    const scope = normalizeRowScope(row.scope);
    const eventId = row.event_id ?? null;

    return {
      id: row.id,
      licenseKey: String(row.license_key ?? "").trim() || row.id.slice(0, 8).toUpperCase(),
      eventId,
      eventName: eventId ? eventNameById.get(eventId) ?? null : null,
      scope,
      billing: normalizeRowBilling(row.billing),
      billingSource: normalizeRowBillingSource(row.billing_source),
      companyId: row.company_id,
      exhibitorCompanyId,
      exhibitorName: companyNameById.get(exhibitorCompanyId) ?? "Unknown Exhibitor",
      licensePlanId: row.license_plan_id,
      licensePlanCode: plan?.code ?? null,
      licensePlanName: plan?.name ?? null,
      termMonths: row.term_months,
      seatsTotal: Math.max(0, Number(row.seats_total ?? 0)),
      seatsUsed: Math.max(0, Number(row.seats_used ?? 0)),
      status: normalizeLicenseStatus(row.status),
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      priceCents: Math.max(0, Number(row.price_cents ?? 0)),
      currency: String(row.currency ?? "USD").toUpperCase(),
      createdAt: row.created_at
    };
  });

  /** First event (by start_date desc) for Create License default when the table filter is “All Events”. */
  const defaultEventId = events[0]?.id ?? exhibitorsByEventCompany.values().next().value?.eventId ?? "";

  return {
    events,
    exhibitors: Array.from(exhibitorsByEventCompany.values()),
    hostCompanies,
    licensePlans,
    licenses,
    defaultEventId
  };
}
