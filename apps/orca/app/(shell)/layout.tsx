import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { ensureProvisionedUserAndContext, listAccessibleOrganizationsForUser } from "@/lib/request-user";
import { getActivePlatformOrgContext } from "@/src/server/services/platform-admin";
import { LogoutButton } from "./_components/logout-button";
import { ShellScaffold } from "./_components/shell-scaffold";

export default async function ShellLayout({ children }: { children: ReactNode }) {
  const authContext = await ensureProvisionedUserAndContext();
  if (authContext.status === "UNAUTHENTICATED") {
    redirect("/login");
  }

  if (authContext.status === "NEEDS_PROVISIONING") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-6">
        <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Access not provisioned</h1>
          <p className="mt-3 text-sm text-slate-600">
            Your account is authenticated, but it has not been provisioned for any organization yet.
            Contact your administrator to request access.
          </p>
          <p className="mt-2 text-xs text-slate-500">{authContext.hint}</p>
          <div className="mt-6">
            <LogoutButton />
          </div>
        </section>
      </main>
    );
  }

  if (authContext.status === "NEEDS_ORG_SELECTION") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-6">
        <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Choose an account</h1>
          <p className="mt-3 text-sm text-slate-600">
            Choose the account you want to use for this signed-in session.
          </p>
          <p className="mt-2 text-xs text-slate-500">{authContext.hint}</p>

          <div className="mt-6 space-y-3">
            {authContext.organizations.length > 0 ? (
              authContext.organizations.map((organization) => (
                <form key={organization.id} action="/api/me" method="post" className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{organization.name}</p>
                    <p className="text-xs text-slate-500">{organization.slug}</p>
                  </div>
                  <input type="hidden" name="activeOrgId" value={organization.id} />
                  <input type="hidden" name="redirectTo" value="/dashboard" />
                  <button
                    type="submit"
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Choose account
                  </button>
                </form>
              ))
            ) : (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                No organizations are available yet.
              </p>
            )}
          </div>

          <div className="mt-6">
            <LogoutButton />
          </div>
        </section>
      </main>
    );
  }

  if (authContext.status !== "OK") {
    redirect("/login");
  }

  const appUserId = authContext.appUserId;
  const userRole = authContext.role;
  if (!appUserId || !userRole) {
    redirect("/login");
  }

  const [organization, user, accessibleOrganizations] = await Promise.all([
    getPrisma().organization.findUnique({
      where: { id: authContext.activeOrgId },
      select: { name: true, slug: true },
    }),
    getPrisma().user.findUnique({
      where: { id: appUserId },
      select: { name: true, email: true },
    }),
    listAccessibleOrganizationsForUser({
      userId: appUserId,
      role: userRole,
    }),
  ]);
  const platformContext =
    authContext.role === "SUPER_ADMIN" ? await getActivePlatformOrgContext() : null;

  return (
    <ShellScaffold
      organization={
        organization
          ? {
              name: organization.name,
              slug: organization.slug,
            }
          : null
      }
      user={{
        name: user?.name ?? null,
        email: user?.email ?? authContext.email ?? "",
      }}
      canSwitchAccount={accessibleOrganizations.length > 1}
      platformContext={
        platformContext
          ? {
              accountName: platformContext.account.name,
              accountSlug: platformContext.account.slug,
            }
          : null
      }
    >
      {children}
    </ShellScaffold>
  );
}
