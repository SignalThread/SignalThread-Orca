import { UsersIndexClient } from "@/components/admin/users-index-client";
import { ADMIN_USERS_ALL_EVENTS_ID, getAdminUsersPageData } from "@/lib/data/platform-admin";
import { addUserInviteAction, deleteUserAction, resendInviteAction } from "./actions";

export default async function AdminUsersPage() {
  const data = await getAdminUsersPageData();

  return (
    <UsersIndexClient
      events={data.events}
      exhibitors={data.exhibitors}
      users={data.users}
      activeCompanyLicensedCompanyIds={data.activeCompanyLicensedCompanyIds}
      addUserAction={addUserInviteAction}
      deleteUserAction={deleteUserAction}
      resendInviteAction={resendInviteAction}
      includeAllEvents
      defaultEventId={ADMIN_USERS_ALL_EVENTS_ID}
    />
  );
}
