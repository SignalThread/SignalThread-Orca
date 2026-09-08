"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { ExhibitorAppTopBarEventSlot } from "@/components/layout/exhibitor-app-top-bar-event-slot";
import { PersonaToggle } from "@/components/layout/persona-toggle";
import { Sidebar } from "@/components/layout/sidebar";
import type { SessionUser } from "@/lib/auth/session";
import type { ExhibitorAppShellEventChrome } from "@/lib/exhibitor/exhibitor-app-shell-types";

function getDashboardSkinClass() {
  const skin = (process.env.NEXT_PUBLIC_DASHBOARD_SKIN ?? "linear").trim().toLowerCase();
  if (skin === "dark") return "skin-dark";
  if (skin === "minimal") return "skin-minimal";
  return "skin-linear";
}

function ExhibitorTopBarEventFallback({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <span className="max-w-[min(100%,14rem)] truncate rounded-lg border border-slate-200/90 bg-slate-50/80 px-3 py-1.5 text-sm font-medium text-slate-800">
      {label}
    </span>
  );
}

export function AppShell({
  children,
  sessionUser,
  exhibitorHasAccessibleEvents,
  exhibitorActiveEventName,
  exhibitorEventChrome,
  exhibitorAllowsAppEventsManagementSurfaces,
  exhibitorEventLevelTenantUi,
  platformAdminAccountContext
}: {
  children: React.ReactNode;
  sessionUser: SessionUser;
  /** When false, exhibitor shell hides the event chip. Null = not applicable. */
  exhibitorHasAccessibleEvents?: boolean | null;
  /** Fallback label while the interactive top bar hydrates (exhibitor only). */
  exhibitorActiveEventName?: string | null;
  /** When set, exhibitor top bar shows the event menu (always interactive when user has ≥1 event). */
  exhibitorEventChrome?: ExhibitorAppShellEventChrome | null;
  /**
   * Direct (`company_all_events`) exhibitor admins: true. Event-level: false.
   * Omit for non-exhibitor personas (ignored).
   */
  exhibitorAllowsAppEventsManagementSurfaces?: boolean;
  /** Resolver indicates assigned-only or legacy event-scoped access (simplified settings + locked event chip). */
  exhibitorEventLevelTenantUi?: boolean;
  platformAdminAccountContext?: { companyId: string; companyName: string } | null;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const skinClass = getDashboardSkinClass();
  const isExhibitor = sessionUser.role === "exhibitor_admin" || Boolean(platformAdminAccountContext);
  const navigationRole = platformAdminAccountContext ? "exhibitor_admin" : sessionUser.role;
  const exhibitorHasEvents = exhibitorHasAccessibleEvents !== false;
  const exhibitorChipLabel = exhibitorActiveEventName ?? null;
  const exhibitorActiveEventId = exhibitorEventChrome?.activeEventId ?? null;
  const roleLabel = getAppRoleLabel(sessionUser.role);
  const showLegacyChip = isExhibitor
    ? exhibitorHasEvents && Boolean(exhibitorChipLabel) && !exhibitorEventChrome
    : false;

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileNavOpen]);

  return (
    <div
      className={`app-shell ${skinClass} min-h-screen overflow-x-hidden md:flex md:items-stretch`}
    >
      <div className="hidden md:block">
        <Sidebar
          role={navigationRole}
          exhibitorHasAccessibleEvents={exhibitorHasAccessibleEvents}
          exhibitorActiveEventId={exhibitorActiveEventId}
          exhibitorAllowsAppEventsManagementSurfaces={exhibitorAllowsAppEventsManagementSurfaces}
          exhibitorEventLevelTenantUi={exhibitorEventLevelTenantUi}
        />
      </div>

      <div
        className={`fixed inset-0 z-50 md:hidden ${mobileNavOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!mobileNavOpen}
      >
        <button
          type="button"
          className={`absolute inset-0 bg-slate-950/45 backdrop-blur-[1px] transition duration-200 ${
            mobileNavOpen ? "opacity-100" : "opacity-0"
          }`}
          aria-label="Close navigation menu"
          onClick={() => setMobileNavOpen(false)}
        />
        <div
          className={`absolute inset-y-0 left-0 w-[min(22rem,88vw)] border-r border-slate-200 bg-white shadow-2xl transition duration-300 ease-out ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col">
            <Sidebar
              mobile
              onNavigate={() => setMobileNavOpen(false)}
              role={navigationRole}
              exhibitorHasAccessibleEvents={exhibitorHasAccessibleEvents}
              exhibitorActiveEventId={exhibitorActiveEventId}
              exhibitorAllowsAppEventsManagementSurfaces={exhibitorAllowsAppEventsManagementSurfaces}
              exhibitorEventLevelTenantUi={exhibitorEventLevelTenantUi}
            />
            <div className="border-t border-slate-200 bg-slate-50/80 p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-700">
                    {roleLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMobileNavOpen(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
                    aria-label="Close navigation menu"
                  >
                    <CloseIcon />
                  </button>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white">
                      {sessionUser.fullName?.slice(0, 2).toUpperCase() || "U"}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {sessionUser.fullName || "User"}
                      </p>
                      <p className="truncate text-xs text-slate-500">{roleLabel}</p>
                    </div>
                  </div>
                </div>

                {exhibitorEventChrome ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      Active event
                    </p>
                    <div className="mt-2">
                      <ExhibitorAppTopBarEventSlot {...exhibitorEventChrome} />
                    </div>
                  </div>
                ) : showLegacyChip && exhibitorChipLabel ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      Active event
                    </p>
                    <div className="mt-2">
                      <div className="app-pill rounded-lg border px-3 py-1.5 text-sm text-slate-700">
                        {exhibitorChipLabel}
                      </div>
                    </div>
                  </div>
                ) : null}

                <SignOutForm buttonClassName="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="app-main flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="app-topbar border-b bg-white">
          <div className="app-topbar-inner flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 md:hidden"
                aria-label="Open navigation menu"
              >
                <MenuIcon />
              </button>
              <PersonaToggle role={sessionUser.role} />
            </div>

            <div className="app-topbar-controls flex min-w-0 items-center gap-3">
              {exhibitorEventChrome ? (
                <Suspense fallback={<ExhibitorTopBarEventFallback label={exhibitorChipLabel} />}>
                  <ExhibitorAppTopBarEventSlot {...exhibitorEventChrome} />
                </Suspense>
              ) : showLegacyChip && exhibitorChipLabel ? (
                <div className="app-pill hidden rounded-lg border px-3 py-1.5 text-sm text-slate-700 sm:block">
                  {exhibitorChipLabel}
                </div>
              ) : null}
              <div className="app-avatar rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white">
                {sessionUser.fullName?.slice(0, 2).toUpperCase() || "U"}
              </div>
              <SignOutForm buttonClassName="app-signout hidden rounded-lg border px-3 py-1.5 text-sm sm:inline-flex" />
            </div>
          </div>
        </header>

        {platformAdminAccountContext ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-950 md:px-6"
            role="status"
            data-testid="platform-admin-account-context-banner"
          >
            <span className="font-semibold">
              Platform Admin · Viewing {platformAdminAccountContext.companyName}
            </span>
            <form action="/api/admin/account-context" method="post">
              <input type="hidden" name="action" value="exit" />
              <button
                type="submit"
                className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 font-semibold text-violet-800 shadow-sm hover:bg-violet-100"
              >
                Exit company
              </button>
            </form>
          </div>
        ) : null}

        <main className="app-content min-w-0 max-w-full p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

function getAppRoleLabel(role: SessionUser["role"]) {
  switch (role) {
    case "organizer_admin":
      return "Organizer admin";
    case "exhibitor_viewer":
      return "Exhibitor viewer";
    case "exhibitor_admin":
      return "Exhibitor admin";
    case "platform_admin":
      return "Platform admin";
    default:
      return "User";
  }
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
