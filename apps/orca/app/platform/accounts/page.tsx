import { PageHeader } from "@signalthread/ui";
import { AccountsTable } from "../_components/platform-admin-tables";

export default async function PlatformAccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const resolvedSearchParams = await searchParams;
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Accounts"
        title="Manage accounts"
        description="Review client accounts, primary admins, users, events, and operator actions."
      />
      <AccountsTable searchParams={resolvedSearchParams} />
    </div>
  );
}
