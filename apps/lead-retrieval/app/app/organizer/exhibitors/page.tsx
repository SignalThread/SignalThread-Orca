import { ExhibitorsIndexClient } from "@/components/admin/exhibitors-index-client";
import { requireRole } from "@/lib/auth/session";
import { getAdminExhibitorsIndexData } from "@/lib/data/admin-exhibitors";
import { getOrganizerScope } from "@/lib/data/organizer-scope";

export default async function OrganizerExhibitorsPage() {
  const sessionUser = await requireRole("organizer_admin");

  const scope = await getOrganizerScope(sessionUser.id);
  const defaultEventId = scope.events[0]?.id ?? "";

  if (!defaultEventId) {
    return (
      <section className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">Exhibitors</h1>
        <p className="text-slate-600">No exhibitor scope found for your organizer account.</p>
      </section>
    );
  }

  const indexData = await getAdminExhibitorsIndexData();

  const scopedEventIds = new Set(scope.events.map((event) => event.id));
  const events = indexData.events.filter((event) => scopedEventIds.has(event.id));
  const exhibitors = indexData.exhibitors.filter((row) => scopedEventIds.has(row.eventId));
  const hostCompanies = indexData.hostCompanies.filter((host) =>
    scope.events.some((event) => event.companyId === host.id)
  );

  if (!events.length) {
    return (
      <section className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">Exhibitors</h1>
        <p className="text-slate-600">No exhibitor scope found for your organizer account.</p>
      </section>
    );
  }

  return (
    <ExhibitorsIndexClient
      events={events}
      exhibitors={exhibitors}
      hostCompanies={hostCompanies}
      defaultEventId={defaultEventId}
      detailBasePath="/app/organizer/exhibitors"
      allowCreate
      eventStorageKey="leadintel.organizer.selectedEventId"
      currencyMaximumFractionDigits={0}
      showEventFilter
      toolbarVariant="default"
    />
  );
}
