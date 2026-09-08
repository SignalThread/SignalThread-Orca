import { UsersIndexClient } from "@/components/admin/users-index-client";
import { requireRole } from "@/lib/auth/session";
import { getAdminUsersPageData } from "@/lib/data/platform-admin";
import { getOrganizerScope } from "@/lib/data/organizer-scope";
import { addUserInviteAction, deleteUserAction, resendInviteAction } from "@/app/admin/users/actions";

export default async function OrganizerUsersPage() {
  const sessionUser = await requireRole("organizer_admin");

  const [scope, data] = await Promise.all([
    getOrganizerScope(sessionUser.id),
    getAdminUsersPageData()
  ]);

  const selectedEvent = scope.events[0] ?? null;
  const defaultEventId = selectedEvent?.id ?? "";
  const scopedEventIds = new Set(defaultEventId ? [defaultEventId] : []);
  const scopedCompanyIds = new Set(scope.companyIds);

  const events = data.events.filter((event) => scopedEventIds.has(event.id));
  const exhibitors = data.exhibitors.filter(
    (row) => scopedEventIds.has(row.eventId) && scopedCompanyIds.has(row.id)
  );
  const exhibitorIds = new Set(exhibitors.map((row) => row.id));

  const users = data.users.filter((user) => {
    if (!scopedEventIds.has(user.eventId)) return false;
    if (!user.exhibitorId) return true;
    return exhibitorIds.has(user.exhibitorId);
  });

  if (!events.length) {
    return (
      <section className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">Users &amp; Invites</h1>
        <p className="text-slate-600">No event scope found. Assign this organizer to an event first.</p>
      </section>
    );
  }

  return (
    <UsersIndexClient
      events={events}
      exhibitors={exhibitors}
      users={users}
      activeCompanyLicensedCompanyIds={data.activeCompanyLicensedCompanyIds}
      addUserAction={addUserInviteAction}
      deleteUserAction={deleteUserAction}
      resendInviteAction={resendInviteAction}
      title="Users"
      subtitle="Invite exhibitor users and assign event access"
      defaultEventId={defaultEventId}
      eventStorageKey="leadintel.organizer.selectedEventId"
      allowedRoles={["exhibitor_admin"]}
      showEventFilter={false}
      organizerFilterLayout
    />
  );
}
