"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SignOutForm } from "@/components/auth/sign-out-form";
import type { SessionUser } from "@/lib/auth/session";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { ExhibitorAdminEventSwitcher } from "@/components/admin/exhibitor-admin-event-switcher";
import { ExhibitorAdminEventProvider } from "@/components/admin/exhibitor-admin-event-context";
import { AdminDashboardModeSwitcher } from "@/components/admin/admin-dashboard-mode-switcher";
import { LeadRetrievalBrandMark } from "@/components/layout/lead-retrieval-brand-mark";
import type { AdminSidebarMode } from "@/lib/admin/admin-dashboard-nav";

function getAdminSkinClass() {
  const skin = (process.env.NEXT_PUBLIC_ADMIN_SKIN ?? "modern").trim().toLowerCase();
  if (skin === "dark" || skin === "dark-analytics") return "admin-skin-dark";
  if (skin === "minimal" || skin === "minimal-enterprise") return "admin-skin-minimal";
  return "admin-skin-modern";
}

export function AdminShell({
  sessionUser,
  sidebarMode = "event_scoped",
  exhibitorAdminEventSwitcher,
  children
}: {
  sessionUser: SessionUser;
  sidebarMode?: AdminSidebarMode;
  exhibitorAdminEventSwitcher?: {
    accessibleEvents: Array<{ id: string; name: string }>;
    activeEventId: string | null;
  } | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const initials =
    sessionUser.fullName
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "PA";
  const adminSkinClass = getAdminSkinClass();
  const isExhibitor = sessionUser.role === "exhibitor_admin";
  const roleLabel = isExhibitor ? "Exhibitor Admin" : "Platform Admin";
  const eventChrome = exhibitorAdminEventSwitcher;

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

  const mainInner = (
    <main className="admin-content mx-auto w-full max-w-[1400px] space-y-6 p-4 md:space-y-7 md:px-6 md:py-6 lg:px-8">
      {children}
    </main>
  );

  return (
    <div className={`admin-shell ${adminSkinClass} min-h-screen bg-surface md:flex`}>
      <div className="hidden md:block">
        <AdminSidebar mode={sidebarMode} />
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
          className={`absolute inset-y-0 left-0 w-[min(22rem,88vw)] border-r border-border bg-white shadow-2xl transition duration-300 ease-out ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col">
            <AdminSidebar mode={sidebarMode} mobile onNavigate={() => setMobileNavOpen(false)} />
            <div className="border-t border-border bg-slate-50/80 p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full bg-accentSoft px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                    {roleLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMobileNavOpen(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
                    aria-label="Close navigation menu"
                  >
                    <CloseIcon />
                  </button>
                </div>

                <div className="rounded-2xl border border-border bg-white p-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="admin-avatar rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {sessionUser.fullName || "Platform admin"}
                      </p>
                      <p className="truncate text-xs text-slate-500">{roleLabel}</p>
                    </div>
                  </div>
                </div>

                {!isExhibitor ? (
                  <div className="rounded-2xl border border-border bg-white p-3 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      Dashboard mode
                    </p>
                    <div className="mt-2">
                      <AdminDashboardModeSwitcher />
                    </div>
                  </div>
                ) : null}

                {eventChrome ? (
                  <div className="rounded-2xl border border-border bg-white p-3 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      Active event
                    </p>
                    <div className="mt-2">
                      <ExhibitorAdminEventSwitcher
                        accessibleEvents={eventChrome.accessibleEvents}
                        activeEventId={eventChrome.activeEventId}
                      />
                    </div>
                  </div>
                ) : isExhibitor ? (
                  <div className="rounded-2xl border border-border bg-white p-3 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      Active event
                    </p>
                    <div className="mt-2">
                      <div className="admin-pill rounded-lg border border-border px-3 py-1.5 text-sm text-slate-700">
                        Global Event View
                      </div>
                    </div>
                  </div>
                ) : null}

                <SignOutForm
                  buttonClassName="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="admin-main flex min-w-0 flex-1 flex-col">
        <header className="admin-topbar border-b border-border bg-white">
          <div className="admin-topbar-inner mx-auto flex w-full max-w-[1680px] flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 md:hidden"
                aria-label="Open navigation menu"
              >
                <MenuIcon />
              </button>
              <span className="admin-brand-icon inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl">
                <LeadRetrievalBrandMark />
              </span>
              <span className="admin-role-pill rounded-lg bg-accentSoft px-3 py-1 text-sm font-semibold text-accent">
                {roleLabel}
              </span>
            </div>

            <div className="admin-topbar-controls flex items-center gap-3">
              {!isExhibitor ? <AdminDashboardModeSwitcher /> : null}
              {eventChrome ? (
                <ExhibitorAdminEventSwitcher
                  accessibleEvents={eventChrome.accessibleEvents}
                  activeEventId={eventChrome.activeEventId}
                />
              ) : isExhibitor ? (
                <div className="admin-pill hidden rounded-lg border border-border px-3 py-1.5 text-sm text-slate-700 sm:block">
                  Global Event View
                </div>
              ) : null}
              <div className="admin-avatar rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white">{initials}</div>
              <SignOutForm
                buttonClassName="admin-signout hidden rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 sm:inline-flex"
              />
            </div>
          </div>
        </header>

        {eventChrome ? (
          <ExhibitorAdminEventProvider value={{ activeEventId: eventChrome.activeEventId }}>
            {mainInner}
          </ExhibitorAdminEventProvider>
        ) : (
          mainInner
        )}
      </div>
    </div>
  );
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
