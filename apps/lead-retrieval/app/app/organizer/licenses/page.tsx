import { LicensesIndexClient } from "@/components/admin/licenses-index-client";
import { requireRole } from "@/lib/auth/session";
import { getAdminLicensesPageData } from "@/lib/data/admin-licenses";
import { getOrganizerScope } from "@/lib/data/organizer-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { filterAdminLicenseRowsForOrganizerScope } from "@/lib/server/organizer-scope-licenses";
import type { AdminLicenseExhibitorOption } from "@/lib/data/admin-licenses-types";

export default async function OrganizerLicensesPage() {
  const sessionUser = await requireRole("organizer_admin");

  const [scope, data] = await Promise.all([
    getOrganizerScope(sessionUser.id),
    getAdminLicensesPageData()
  ]);

  const supabase = createAdminClient();
  const licenses = await filterAdminLicenseRowsForOrganizerScope(supabase, scope, data.licenses);

  const selectedEvent = scope.events[0] ?? null;
  const defaultEventId = selectedEvent?.id ?? "";
  const scopedEventIds = new Set(scope.events.map((e) => e.id));

  const events = data.events.filter((event) => scopedEventIds.has(event.id));
  const hostCompanies = data.hostCompanies.filter((host) =>
    scope.events.some((event) => event.companyId === host.id)
  );

  const exhibitorFromEvents = data.exhibitors.filter(
    (row) => row.eventId && scopedEventIds.has(row.eventId)
  );
  const companyLicensedIds = new Set(
    licenses.filter((license) => license.scope === "company").map((license) => license.exhibitorCompanyId)
  );
  const synthetic: AdminLicenseExhibitorOption[] = [];
  for (const companyId of companyLicensedIds) {
    if (exhibitorFromEvents.some((row) => row.companyId === companyId)) continue;
    const license = licenses.find((l) => l.scope === "company" && l.exhibitorCompanyId === companyId);
    synthetic.push({
      id: `co-${companyId}`,
      eventId: "",
      companyId,
      name: license?.exhibitorName ?? "Exhibitor company"
    });
  }
  const exhibitors = [...exhibitorFromEvents, ...synthetic];

  if (!events.length) {
    return (
      <section className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">Licenses</h1>
        <p className="text-slate-600">No licenses are available for your organizer scope yet.</p>
      </section>
    );
  }

  return (
    <LicensesIndexClient
      events={events}
      exhibitors={exhibitors}
      hostCompanies={hostCompanies}
      licensePlans={data.licensePlans}
      licenses={licenses}
      defaultEventIdForCreate={defaultEventId}
      eventContextLabel={selectedEvent?.name}
      title="Licenses"
      subtitle="Manage exhibitor licenses and seat allocation"
      currencyMaximumFractionDigits={0}
      organizerFilterLayout
    />
  );
}
