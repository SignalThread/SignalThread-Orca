import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { getOrganizerScope } from "@/lib/data/organizer-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { isHotLead } from "@/lib/leads/lead-business-rules";

type OrganizerExhibitorDetailPageProps = {
  params: Promise<{ exhibitorId: string }>;
  searchParams?: Promise<{ eventId?: string }> | { eventId?: string };
};

type ExhibitorLicenseRow = {
  id: string;
  seats_total: number | null;
  seats_used: number | null;
  status: string | null;
  starts_at: string | null;
  expires_at: string | null;
  price_cents: number | null;
  currency: string | null;
  created_at: string;
  license_plan_id: string | null;
};

type EventUserRow = {
  user_id: string;
  status: string;
};

function formatMoney(cents: number | null | undefined, currency: string | null | undefined) {
  const amount = Math.max(0, Number(cents ?? 0)) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: String(currency ?? "USD").toUpperCase(),
    maximumFractionDigits: 0
  }).format(amount);
}

export default async function OrganizerExhibitorDetailPage({
  params,
  searchParams
}: OrganizerExhibitorDetailPageProps) {
  const sessionUser = await requireRole("organizer_admin");
  const { exhibitorId } = await params;
  const companyId = exhibitorId.trim();

  const resolvedSearchParams =
    searchParams && typeof (searchParams as Promise<{ eventId?: string }>).then === "function"
      ? await (searchParams as Promise<{ eventId?: string }>)
      : ((searchParams ?? {}) as { eventId?: string });
  const eventId = resolvedSearchParams.eventId?.trim() || "";

  if (!eventId) {
    return (
      <section className="space-y-3">
        <p className="text-sm font-medium text-slate-700">Missing event scope for exhibitor detail.</p>
        {process.env.NODE_ENV !== "production" ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            Missing `eventId` query parameter for organizer exhibitor detail route.
          </p>
        ) : null}
      </section>
    );
  }

  const scope = await getOrganizerScope(sessionUser.id);
  const scopedEventIds = new Set(scope.events.map((event) => event.id));
  if (!scopedEventIds.has(eventId)) {
    return (
      <section className="space-y-3">
        <p>Not found</p>
        {process.env.NODE_ENV !== "production" ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            Event {eventId} is outside organizer scope.
          </p>
        ) : null}
      </section>
    );
  }

  const supabase = createAdminClient();

  const { data: exhibitor, error: exhibitorError } = await (supabase as any)
    .from("exhibitors")
    .select("id, event_id, company_id, status, created_at")
    .eq("event_id", eventId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (exhibitorError) {
    console.error("[organizer exhibitor detail] exhibitor fetch failed:", exhibitorError.message, exhibitorError.code);
    return (
      <section className="space-y-4">
        <p className="text-sm font-medium text-rose-700">{exhibitorError.message ?? "Failed loading exhibitor."}</p>
      </section>
    );
  }

  if (!exhibitor) {
    return (
      <section className="space-y-3">
        <p>Not found</p>
        {process.env.NODE_ENV !== "production" ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            No exhibitor found for company {companyId} in event {eventId}.
          </p>
        ) : null}
      </section>
    );
  }

  const [companyResponse, licenseResponse, leadsResponse, eventUsersResponse] = await Promise.all([
    (supabase as any).from("companies").select("name").eq("id", exhibitor.company_id).maybeSingle(),
    (supabase as any)
      .from("licenses")
      .select(
        "id, seats_total, seats_used, status, starts_at, expires_at, price_cents, currency, created_at, license_plan_id"
      )
      .eq("event_id", eventId)
      .or(`exhibitor_company_id.eq.${exhibitor.company_id},company_id.eq.${exhibitor.company_id}`)
      .order("created_at", { ascending: false }),
    (supabase as any)
      .from("leads")
      .select("id, priority_score, temperature", { count: "exact" })
      .eq("event_id", eventId)
      .eq("company_id", exhibitor.company_id),
    (supabase as any)
      .from("event_users")
      .select("user_id, status")
      .eq("event_id", eventId)
      .eq("exhibitor_company_id", exhibitor.company_id)
      .in("status", ["active", "invited"])
  ]);

  if (companyResponse.error) console.error("[organizer exhibitor detail] company fetch failed:", companyResponse.error.message, companyResponse.error.code);
  if (licenseResponse.error) console.error("[organizer exhibitor detail] licenses fetch failed:", licenseResponse.error.message, licenseResponse.error.code);
  if (leadsResponse.error) console.error("[organizer exhibitor detail] leads fetch failed:", leadsResponse.error.message, leadsResponse.error.code);
  if (eventUsersResponse.error) console.error("[organizer exhibitor detail] event_users fetch failed:", eventUsersResponse.error.message, eventUsersResponse.error.code);

  const licenses = (licenseResponse.data ?? []) as ExhibitorLicenseRow[];
  const leads = (leadsResponse.data ?? []) as Array<{ id: string; priority_score: number; temperature: string | null }>;
  const scopedUsers = (eventUsersResponse.data ?? []) as EventUserRow[];

  const seatsPurchased = licenses.reduce((sum, row) => sum + Math.max(0, Number(row.seats_total ?? 0)), 0);
  const seatsUsed = licenses.reduce((sum, row) => sum + Math.max(0, Number(row.seats_used ?? 0)), 0);
  const revenue = licenses.reduce((sum, row) => sum + Math.max(0, Number(row.price_cents ?? 0)), 0) / 100;
  const hotLeads = leads.filter(isHotLead).length;
  const activeUsers = scopedUsers.length;

  return (
    <section className="space-y-6">
      <Link
        href={`/app/organizer/exhibitors?eventId=${encodeURIComponent(eventId)}`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-accent"
      >
        <span aria-hidden="true">←</span>
        Back to Exhibitors
      </Link>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-950">
            {companyResponse.data?.name ?? "Unknown Exhibitor"}
          </h1>
          <p className="mt-1 text-slate-600">Organizer exhibitor detail</p>
        </div>

        <dl className="grid grid-cols-1 gap-3 text-sm text-slate-700 md:grid-cols-2">
          <div>
            <dt className="font-semibold text-slate-900">Status</dt>
            <dd>{exhibitor.status ?? "-"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Leads Captured</dt>
            <dd>{leadsResponse.count ?? leads.length}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Seat Usage</dt>
            <dd>
              {seatsUsed} / {seatsPurchased}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Active Users</dt>
            <dd>{activeUsers}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Hot Leads</dt>
            <dd>{hotLeads}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Sync Health</dt>
            <dd>No data yet</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Revenue</dt>
            <dd>
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0
              }).format(revenue)}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Created</dt>
            <dd>{exhibitor.created_at ? new Date(exhibitor.created_at).toLocaleString() : "-"}</dd>
          </div>
        </dl>

        <div className="rounded-xl border border-border bg-slate-50 p-4">
          <h2 className="text-lg font-semibold text-slate-900">License Records</h2>
          {licenseResponse.error ? (
            <p className="mt-2 text-sm text-rose-700">{licenseResponse.error.message ?? "Failed loading licenses."}</p>
          ) : licenses.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No license records found for this exhibitor and event.</p>
          ) : (
            <div className="mt-3 w-full overflow-hidden">
              <table className="w-full table-fixed text-left text-sm text-slate-700">
                <thead className="border-b border-border text-xs uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="w-[30%] px-3 py-2">License ID</th>
                    <th className="w-[18%] px-3 py-2">Status</th>
                    <th className="w-[18%] px-3 py-2">Seats</th>
                    <th className="w-[18%] px-3 py-2">Expires</th>
                    <th className="hidden w-[16%] px-3 py-2 md:table-cell">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {licenses.map((license) => (
                    <tr key={license.id} className="border-b border-border/70 last:border-none">
                      <td className="px-3 py-2 font-medium text-slate-900">
                        <span className="block truncate" title={license.id}>
                          {license.id}
                        </span>
                      </td>
                      <td className="px-3 py-2">{license.status ?? "-"}</td>
                      <td className="px-3 py-2">
                        {Number(license.seats_used ?? 0)} / {Number(license.seats_total ?? 0)}
                      </td>
                      <td className="px-3 py-2">
                        {license.expires_at ? new Date(license.expires_at).toLocaleDateString() : "-"}
                      </td>
                      <td className="hidden px-3 py-2 font-semibold text-emerald-700 md:table-cell">
                        {formatMoney(license.price_cents, license.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
