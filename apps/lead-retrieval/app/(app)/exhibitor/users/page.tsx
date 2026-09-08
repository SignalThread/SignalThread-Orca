import { requireRole } from "@/lib/auth/session";
import { getExhibitorUsersManagementData } from "@/lib/data/users";
import { PageHeader, PageShell } from "@/components/layout/page-header";
import { ExhibitorUsersClient } from "./users-client";

export default async function ExhibitorUsersPage() {
  await requireRole("exhibitor_admin");

  try {
    const data = await getExhibitorUsersManagementData();

    return (
      <ExhibitorUsersClient
        users={data.users}
        licenses={data.licenses}
        scopedEventId={data.scopedEventId}
      />
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return (
      <PageShell>
        <PageHeader title="Users" subtitle="Visible users in your scope." />
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm font-medium text-slate-900">Couldn&apos;t load users</p>
          <p className="mt-2 text-xs text-slate-500">{message}</p>
        </div>
      </PageShell>
    );
  }
}
