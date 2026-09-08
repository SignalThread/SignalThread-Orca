import { LicensesIndexClient } from "@/components/admin/licenses-index-client";
import { getAdminLicensesPageData } from "@/lib/data/admin-licenses";

export default async function AdminLicensesPage() {
  const data = await getAdminLicensesPageData();

  return (
    <LicensesIndexClient
      events={data.events}
      exhibitors={data.exhibitors}
      hostCompanies={data.hostCompanies}
      licenses={data.licenses}
      licensePlans={data.licensePlans}
      defaultEventIdForCreate={data.defaultEventId}
    />
  );
}
