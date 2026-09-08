import { redirect } from "next/navigation";
import { createPlatformServerClient } from "@/lib/supabase/server";
import { getOrganizationAccessForUser, isPlatformAdmin } from "@/lib/server/registry";
import { PlatformShell } from "@/app/_components/platform-shell";

export const dynamic = "force-dynamic";

/**
 * The authenticated Platform shell.
 *
 * Middleware already gates these routes, but the check is repeated here on
 * purpose: a layout that renders authenticated chrome must not depend on
 * middleware matcher configuration staying correct forever. `getUser()` verifies
 * with the auth server rather than trusting the cookie's contents.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createPlatformServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/signin");

  const [access, admin] = await Promise.all([getOrganizationAccessForUser(user.id), isPlatformAdmin(user.id)]);
  const organization = access.length === 1 ? { name: access[0].organizationName, role: access[0].organizationRole } : null;

  return (
    <PlatformShell
      email={user.email ?? null}
      organization={organization}
      organizationCount={access.length}
      admin={admin}
    >
      {children}
    </PlatformShell>
  );
}
