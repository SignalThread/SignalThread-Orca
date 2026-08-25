import { getPrisma } from "@/lib/prisma";
import { resolvePlatformInvitationCapability } from "@/lib/platform/invitations";
import { InviteUserForm } from "./_components/invite-user-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PlatformUsersPage() {
  // Mirror the API boundary in the UI: when Platform Core owns invitations, do not offer a
  // form whose only possible outcome is a 410.
  const invitationCapability = resolvePlatformInvitationCapability();

  const organizations =
    invitationCapability.status === "LEGACY_ORCA_INVITES"
      ? await getPrisma().organization.findMany({
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
          },
        })
      : [];

  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-[24px] leading-[28px] font-semibold text-slate-900">Platform Users</h2>
        <p className="mt-2 text-sm text-slate-600">SUPER_ADMIN-only user invite and provisioning controls.</p>
      </header>

      {invitationCapability.status === "PLATFORM_MANAGED" ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-slate-900">Invitations moved to SignalThread</h3>
          <p className="mt-2 text-sm text-slate-600">{invitationCapability.hint}</p>
          <p className="mt-2 text-xs text-slate-500">
            Orca no longer creates user accounts or organization memberships.
          </p>
        </div>
      ) : (
        <InviteUserForm organizations={organizations} />
      )}
    </section>
  );
}
