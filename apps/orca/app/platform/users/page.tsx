import { PageHeader } from "@signalthread/ui";
import { UsersTable } from "../_components/platform-admin-tables";

export default async function PlatformUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <div className="space-y-5"><PageHeader eyebrow="Users" title="Platform users" description="Search every user and inspect their actual memberships and event access." /><UsersTable searchParams={await searchParams} /></div>;
}
