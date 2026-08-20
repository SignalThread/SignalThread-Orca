import { getPrisma } from "@/lib/prisma";
import { InviteUserForm } from "./_components/invite-user-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PlatformUsersPage() {
  const organizations = await getPrisma().organization.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
    },
  });

  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-[24px] leading-[28px] font-semibold text-slate-900">Platform Users</h2>
        <p className="mt-2 text-sm text-slate-600">SUPER_ADMIN-only user invite and provisioning controls.</p>
      </header>

      <InviteUserForm organizations={organizations} />
    </section>
  );
}
