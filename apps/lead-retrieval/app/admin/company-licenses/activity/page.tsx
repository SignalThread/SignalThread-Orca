import { CompanyLicensesPageShell } from "@/components/admin/company-licenses-page-shell";

export default function CompanyScopedActivityPage() {
  return (
    <CompanyLicensesPageShell
      title="Activity"
      subtitle="Audit company-scoped license operations, seat changes, and access activity over time."
    />
  );
}
