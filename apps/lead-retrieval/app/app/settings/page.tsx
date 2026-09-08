import Link from "next/link";
import { redirect } from "next/navigation";
import { hasActivePlatformAdminAccountContext, normalizeSessionRole, requireAuth } from "@/lib/auth/session";
import { getExhibitorSettingsSnapshot } from "@/lib/data/settings";
import { getCompanySettingsTeamPageData } from "@/lib/server/company-team-management";
import { getCachedExhibitorAccessibleEventResolution } from "@/lib/server/exhibitor-app-access";
import { EXHIBITOR_EVENTS_ENTRY_HREF, EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF } from "@/lib/exhibitor/exhibitor-app-nav";
import { exhibitorAdminMayUseAppEventManagementRoutes } from "@/lib/exhibitor/exhibitor-event-management-access";
import { isExhibitorEventLevelTenantUiResolution } from "@/lib/access/event-access-mode";
import { CompanyTeamSettingsClient } from "./company-team-settings-client";

export const dynamic = "force-dynamic";

export default async function CompanyAccountSettingsPage() {
  const sessionUser = await requireAuth();
  const role = normalizeSessionRole(sessionUser.role);

  const platformAdminAccountContextActive = hasActivePlatformAdminAccountContext(sessionUser);
  if (role === "platform_admin" && !platformAdminAccountContextActive) {
    redirect("/admin");
  }
  if (role === "organizer_admin") {
    redirect("/app/organizer");
  }
  if (role !== "exhibitor_admin" && role !== "viewer" && !platformAdminAccountContextActive) {
    redirect("/app");
  }

  const access = await getCachedExhibitorAccessibleEventResolution(sessionUser.id);
  if (isExhibitorEventLevelTenantUiResolution(access.resolution)) {
    redirect(EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF);
  }

  const companyId = String(sessionUser.company_id ?? "").trim();
  if (!companyId) {
    return (
      <section className="mx-auto w-full max-w-[920px] space-y-6 pb-12">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Account</h1>
        <p className="text-sm text-slate-600">Your account is not assigned to a company yet.</p>
      </section>
    );
  }

  const [snapshot, teamData] = await Promise.all([
    getExhibitorSettingsSnapshot(),
    getCompanySettingsTeamPageData(companyId, {
      settingsViewerUserId: sessionUser.id,
      settingsViewerEventAccessMode: access.eventAccessMode
    })
  ]);

  const isAdmin = role === "exhibitor_admin" || platformAdminAccountContextActive;
  const portfolioManagement = exhibitorAdminMayUseAppEventManagementRoutes({
    role: access.role,
    resolution: access.resolution
  });
  const accountBackHref = portfolioManagement
    ? EXHIBITOR_EVENTS_ENTRY_HREF
    : access.eventIds[0]
      ? `/exhibitor/dashboard?eventId=${encodeURIComponent(access.eventIds[0])}`
      : "/exhibitor/dashboard";
  const accountBackLabel = portfolioManagement ? "Events" : "Dashboard";

  return (
    <section className="mx-auto w-full max-w-[920px] space-y-6 pb-12">
      <header className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          <Link href={accountBackHref} className="hover:text-slate-600">
            ← {accountBackLabel}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Account</h1>
        <p className="max-w-[52ch] text-sm leading-relaxed text-slate-600">
          Manage your company team and event access.
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Account</h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Company</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{snapshot.company?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Your role</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{snapshot.sessionUser?.roleLabel ?? "—"}</dd>
          </div>
        </dl>
      </div>

      <CompanyTeamSettingsClient
        licenseEligible={teamData.licenseEligible}
        members={teamData.members}
        companyEvents={teamData.companyEvents}
        canManageTeam={isAdmin}
      />

      <div className="rounded-2xl border border-rose-200/90 bg-rose-50/50 p-5">
        <h2 className="text-sm font-semibold text-rose-900">Danger zone</h2>
        <p className="mt-1 max-w-[52ch] text-sm text-rose-800/90">
          Account deletion and workspace removal require support. Self-serve deletion is not enabled.
        </p>
        <button
          type="button"
          disabled
          className="mt-4 inline-flex h-10 cursor-not-allowed items-center justify-center rounded-lg border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-700 opacity-70"
        >
          Delete account
        </button>
      </div>
    </section>
  );
}
