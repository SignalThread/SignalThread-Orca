import { ExhibitorsIndexClient } from "@/components/admin/exhibitors-index-client";
import { getAdminExhibitorsIndexData } from "@/lib/data/admin-exhibitors";

type AdminExhibitorsPageProps = {
  searchParams?: Promise<{ eventId?: string }> | { eventId?: string };
};

export default async function AdminExhibitorsPage({ searchParams }: AdminExhibitorsPageProps) {
  const resolvedSearchParams =
    searchParams && typeof (searchParams as Promise<{ eventId?: string }>).then === "function"
      ? await (searchParams as Promise<{ eventId?: string }>)
      : ((searchParams ?? {}) as { eventId?: string });
  const data = await getAdminExhibitorsIndexData({ selectedEventId: resolvedSearchParams.eventId });

  return (
    <ExhibitorsIndexClient
      events={data.events}
      exhibitors={data.exhibitors}
      hostCompanies={data.hostCompanies}
      defaultEventId={data.defaultEventId}
      serverEventFiltering
    />
  );
}
