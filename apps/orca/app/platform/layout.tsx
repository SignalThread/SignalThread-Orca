import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, ShieldCheck } from "lucide-react";
import { ProductShell, RoleBadge, SidebarRail, TopBar } from "@signalthread/ui";
import { PlatformAdminAuthError, requirePlatformAdminFromContext } from "@/src/server/auth/platform-admin";
import { ensureProvisionedUserAndContext, listAccessibleOrganizationsForUser } from "@/lib/request-user";
import { LogoutButton } from "../(shell)/_components/logout-button";
import { SwitchAccountButton } from "../(shell)/_components/switch-account-button";
import { PlatformSidebarNav } from "./_components/platform-sidebar-nav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function initialsFromEmail(email: string | null): string {
  const localPart = email?.split("@")[0]?.trim() ?? "";
  const initials = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "AK";
}

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  let operatorEmail: string | null = null;
  let canSwitchAccount = false;

  try {
    const context = await ensureProvisionedUserAndContext();
    requirePlatformAdminFromContext(context);
    operatorEmail = context.email;
    if (context.appUserId && context.role) {
      canSwitchAccount = (
        await listAccessibleOrganizationsForUser({
          userId: context.appUserId,
          role: context.role,
        })
      ).length > 1;
    }
  } catch (error) {
    if (error instanceof PlatformAdminAuthError && error.status === 401) {
      redirect("/login");
    }

    return (
      <main className="flex min-h-screen items-center bg-[#f8f8fb] px-6 py-10 text-slate-800">
        <section className="mx-auto w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h1 className="text-[24px] leading-[30px] font-semibold text-slate-950">Platform Admin</h1>
          </div>
          <p className="mt-4 text-sm text-slate-700">Platform Admin access is required.</p>
          <p className="mt-2 text-sm text-slate-500">
            {error instanceof PlatformAdminAuthError ? error.hint : "This area is reserved for platform operators."}
          </p>
        </section>
      </main>
    );
  }

  return (
    <ProductShell
      contentClassName="max-w-[1100px]"
      sidebar={
        <SidebarRail
          brand={
            <Link href="/platform/accounts" className="flex min-h-14 items-center gap-3">
              <div className="relative h-14 w-[260px]">
                <Image
                  src="/brand/orcaos-logo.png"
                  alt="OrcaOS"
                  fill
                  priority
                  sizes="260px"
                  className="object-contain"
                />
              </div>
            </Link>
          }
          footer={
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-[12px] font-semibold tracking-wide text-slate-500 uppercase">Organization</p>
              <div className="mt-2 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500 text-[13px] font-bold text-white">
                  {initialsFromEmail(operatorEmail)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[18px] leading-[20px] font-semibold text-slate-900">Platform Admin</p>
                  <p className="truncate text-[15px] text-slate-500">{operatorEmail ?? "super-admin"}</p>
                </div>
              </div>
            </div>
          }
        >
          <PlatformSidebarNav />
        </SidebarRail>
      }
      topbar={
        <TopBar
          actions={
            <>
              <button
                type="button"
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                aria-label="Notifications"
                title="Notifications"
              >
                <Bell className="h-4 w-4" />
              </button>
              <RoleBadge role="SUPER_ADMIN">SUPER ADMIN</RoleBadge>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B1638] text-[12px] font-bold text-white">
                {initialsFromEmail(operatorEmail)}
              </div>
              <SwitchAccountButton canSwitchAccount={canSwitchAccount} />
              <LogoutButton />
            </>
          }
        />
      }
    >
      {children}
    </ProductShell>
  );
}
