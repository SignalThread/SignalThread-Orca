import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  aggregateExhibitorSeatMetricsByScope,
  getExhibitorScopeKey
} from "@/lib/data/admin-exhibitors";
import { PlatformLeadsExportLink } from "@/components/leads/leads-export-csv-link";
import { DeleteExhibitorButton } from "./delete-exhibitor-button";

type AdminExhibitorDetailPageProps = {
  params: Promise<{ exhibitorId: string }>;
  searchParams?: Promise<{ eventId?: string }> | { eventId?: string };
};

type SupabaseErrorFields = {
  message: string | null;
  details: string | null;
  hint: string | null;
  code: string | null;
};

type ExhibitorLicenseRow = {
  id: string;
  event_id: string | null;
  exhibitor_company_id: string | null;
  company_id: string | null;
  seats_total: number | null;
  seats_used: number | null;
  status: string | null;
  starts_at: string | null;
  expires_at: string | null;
  price_cents: number | null;
  currency: string | null;
  created_at: string;
  license_plan_id: string | null;
  term_months: number | null;
};

function getErrorFields(error: unknown): SupabaseErrorFields {
  if (!error || typeof error !== "object") {
    return {
      message: String(error),
      details: null,
      hint: null,
      code: null
    };
  }

  const maybe = error as { message?: string; details?: string; hint?: string; code?: string };

  return {
    message: maybe.message ?? null,
    details: maybe.details ?? null,
    hint: maybe.hint ?? null,
    code: maybe.code ?? null
  };
}

function formatError(details: SupabaseErrorFields) {
  return [
    details.message ? `message=${details.message}` : null,
    details.details ? `details=${details.details}` : null,
    details.hint ? `hint=${details.hint}` : null,
    details.code ? `code=${details.code}` : null
  ]
    .filter(Boolean)
    .join(" | ");
}

function formatCurrency(priceCents: number | null | undefined, currency: string | null | undefined) {
  const amount = Math.max(0, Number(priceCents ?? 0)) / 100;
  const code = String(currency ?? "USD").toUpperCase();
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 2
  }).format(amount);
}

export default async function AdminExhibitorDetailPage({
  params,
  searchParams
}: AdminExhibitorDetailPageProps) {
  const { exhibitorId } = await params;
  const resolvedSearchParams =
    searchParams && typeof (searchParams as Promise<{ eventId?: string }>).then === "function"
      ? await (searchParams as Promise<{ eventId?: string }>)
      : ((searchParams ?? {}) as { eventId?: string });
  const eventId = resolvedSearchParams.eventId?.trim() || "";

  async function deleteExhibitorAction(
    _previousState: string | null,
    formData: FormData
  ): Promise<string | null> {
    "use server";

    const targetExhibitorId = String(formData.get("exhibitorId") ?? "").trim();
    const targetEventId = String(formData.get("eventId") ?? "").trim();

    if (!targetExhibitorId) {
      return "Missing exhibitor id.";
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await (supabase as any)
      .from("exhibitors")
      .delete()
      .eq("id", targetExhibitorId);

    if (error) {
      return error.message ?? "Failed deleting exhibitor.";
    }

    const redirectPath = targetEventId
      ? `/admin/exhibitors?eventId=${encodeURIComponent(targetEventId)}`
      : "/admin/exhibitors";
    redirect(redirectPath);
  }

  const supabase = createAdminClient();

  let exhibitorQuery = (supabase as any)
    .from("exhibitors")
    .select("id, event_id, company_id, status, created_at")
    .eq("id", exhibitorId);

  if (eventId) {
    exhibitorQuery = exhibitorQuery.eq("event_id", eventId);
  }

  const { data: exhibitor, error } = await exhibitorQuery.maybeSingle();

  let visibleError: string | null = null;

  if (error) {
    const details = getErrorFields(error);
    console.error("adminExhibitorDetail load failed", {
      exhibitorId,
      eventId: eventId || null,
      message: details.message,
      details: details.details,
      hint: details.hint,
      code: details.code
    });

    visibleError = formatError(details);
  }

  if (!exhibitor) {
    const notFoundMessage = `No exhibitor found for id ${exhibitorId}. Are we passing company_id instead of exhibitors.id?`;
    console.error("adminExhibitorDetail not found", { exhibitorId, eventId: eventId || null });
    return (
      <section className="space-y-4">
        <p>Not found</p>
        {process.env.NODE_ENV !== "production" ? (
          <pre className="whitespace-pre-wrap rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {notFoundMessage}
          </pre>
        ) : null}
        {process.env.NODE_ENV !== "production" && visibleError ? (
          <pre className="whitespace-pre-wrap rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            {visibleError}
          </pre>
        ) : null}
      </section>
    );
  }

  let companyName = "Unknown";
  if (exhibitor.company_id) {
    const { data: company, error: companyError } = await (supabase as any)
      .from("companies")
      .select("name")
      .eq("id", exhibitor.company_id)
      .maybeSingle();

    if (companyError) {
      const details = getErrorFields(companyError);
      console.error("adminExhibitorDetail company load failed", {
        exhibitorId,
        companyId: exhibitor.company_id,
        message: details.message,
        details: details.details,
        hint: details.hint,
        code: details.code
      });

      if (!visibleError) {
        visibleError = formatError(details);
      }
    } else {
      companyName = String(company?.name ?? "").trim() || "Unknown";
    }
  }

  const scopedEventId = eventId || exhibitor.event_id || "";
  let missingEventMessage: string | null = null;
  if (!eventId) {
    missingEventMessage = "Missing eventId query parameter; using exhibitor.event_id for license lookup.";
  }

  let licenses: ExhibitorLicenseRow[] = [];
  if (scopedEventId && exhibitor.company_id) {
    const { data: licenseRows, error: licenseError } = await (supabase as any)
      .from("licenses")
      .select(
        "id, event_id, exhibitor_company_id, company_id, seats_total, seats_used, status, starts_at, expires_at, price_cents, currency, created_at, license_plan_id, term_months"
      )
      .eq("event_id", scopedEventId)
      .eq("exhibitor_company_id", exhibitor.company_id)
      .order("created_at", { ascending: false });

    if (licenseError) {
      const details = getErrorFields(licenseError);
      console.error("adminExhibitorDetail license load failed", {
        exhibitorId,
        eventId: scopedEventId,
        companyId: exhibitor.company_id,
        message: details.message,
        details: details.details,
        hint: details.hint,
        code: details.code
      });

      if (!visibleError) {
        visibleError = formatError(details);
      }
    } else {
      licenses = (licenseRows ?? []) as ExhibitorLicenseRow[];
    }
  }

  const metricsByScope = aggregateExhibitorSeatMetricsByScope(licenses);
  const scopeMetrics = exhibitor.company_id
    ? metricsByScope.get(getExhibitorScopeKey(scopedEventId, exhibitor.company_id))
    : null;
  const seatsPurchased = scopeMetrics?.seatsPurchased ?? 0;
  const seatsUsed = scopeMetrics?.seatsUsed ?? 0;
  const revenue = scopeMetrics?.revenue ?? 0;

  return (
    <section className="space-y-7">
      <Link href="/admin/exhibitors" className="inline-flex items-center gap-2 text-base font-semibold text-slate-600 hover:text-accent">
        <span aria-hidden="true">←</span>
        Back to Exhibitors
      </Link>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">{companyName}</h1>
            <p className="text-base text-slate-600 md:text-lg">Exhibitor Details</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {exhibitor.company_id ? (
              <PlatformLeadsExportLink companyId={exhibitor.company_id} eventId={scopedEventId || null} />
            ) : null}
            <DeleteExhibitorButton
              action={deleteExhibitorAction}
              exhibitorId={exhibitorId}
              eventId={eventId || null}
            />
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-3 text-sm text-slate-700 md:grid-cols-2">
          <div>
            <dt className="font-semibold text-slate-900">Exhibitor ID</dt>
            <dd>{exhibitor.id}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Company Name</dt>
            <dd>{companyName}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Company ID</dt>
            <dd>{exhibitor.company_id ?? "-"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Event ID</dt>
            <dd>{exhibitor.event_id ?? "-"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Status</dt>
            <dd>{exhibitor.status ?? "-"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Created</dt>
            <dd>{exhibitor.created_at ? new Date(exhibitor.created_at).toLocaleString() : "-"}</dd>
          </div>
        </dl>

        <div className="mt-6 rounded-xl border border-border bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Backing License Records</h2>
            <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-700">
              <span>Seats Purchased: {seatsPurchased}</span>
              <span>Seats Used: {seatsUsed}</span>
              <span>
                Revenue: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(revenue)}
              </span>
            </div>
          </div>

          {licenses.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-sm text-slate-700">
                <thead className="border-b border-border bg-white/80 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="px-3 py-2">License ID</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Seats</th>
                    <th className="px-3 py-2">Starts</th>
                    <th className="px-3 py-2">Expires</th>
                    <th className="px-3 py-2">Plan ID</th>
                    <th className="px-3 py-2">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {licenses.map((license) => (
                    <tr key={license.id} className="border-b border-border/70 last:border-none">
                      <td className="px-3 py-2 font-medium text-slate-900">{license.id}</td>
                      <td className="px-3 py-2">{license.status ?? "-"}</td>
                      <td className="px-3 py-2">
                        {(license.seats_used ?? 0).toString()} / {(license.seats_total ?? 0).toString()}
                      </td>
                      <td className="px-3 py-2">{license.starts_at ? new Date(license.starts_at).toLocaleDateString() : "-"}</td>
                      <td className="px-3 py-2">{license.expires_at ? new Date(license.expires_at).toLocaleDateString() : "-"}</td>
                      <td className="px-3 py-2">{license.license_plan_id ?? "-"}</td>
                      <td className="px-3 py-2 font-semibold text-emerald-700">
                        {formatCurrency(license.price_cents, license.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No license found for this exhibitor and event.</p>
          )}
        </div>

        {process.env.NODE_ENV !== "production" && missingEventMessage ? (
          <pre className="mt-4 whitespace-pre-wrap rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {missingEventMessage}
          </pre>
        ) : null}
        {process.env.NODE_ENV !== "production" && visibleError ? (
          <pre className="mt-4 whitespace-pre-wrap rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            {visibleError}
          </pre>
        ) : null}
      </section>
    </section>
  );
}
