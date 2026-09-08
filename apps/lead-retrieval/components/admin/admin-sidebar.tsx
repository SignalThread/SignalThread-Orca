"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getAdminSidebarNavItems,
  isAdminNavItemActive,
  resolveAdminDashboardModeForPath,
  type AdminNavIcon,
  type AdminSidebarMode
} from "@/lib/admin/admin-dashboard-nav";
import { LeadRetrievalBrandMark } from "@/components/layout/lead-retrieval-brand-mark";

const STORAGE_KEY = "leadintel.admin.sidebar.collapsed";

export function AdminSidebar({
  mode = "event_scoped",
  mobile = false,
  onNavigate
}: {
  mode?: AdminSidebarMode;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const effectiveCollapsed = mobile ? false : collapsed;

  const resolvedMode =
    mode === "exhibitor_multi" || mode === "exhibitor_integrations"
      ? mode
      : resolveAdminDashboardModeForPath(pathname);
  const navItems = getAdminSidebarNavItems(resolvedMode);

  useEffect(() => {
    if (mobile) {
      setCollapsed(false);
      return;
    }
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      setCollapsed(saved === "1");
    } catch {
      setCollapsed(false);
    }
  }, [mobile]);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Ignore persistence failures.
      }
      return next;
    });
  };

  return (
    <aside
      className={`admin-sidebar w-full bg-white ${
        mobile
          ? "h-full border-0"
          : `border-b border-border md:sticky md:top-0 md:h-screen md:shrink-0 md:border-b-0 md:border-r md:transition-[width] md:duration-200 ${
              effectiveCollapsed ? "md:w-20" : "md:w-64"
            }`
      }`}
    >
      <div
        className={`admin-sidebar-header flex h-16 items-center border-b border-border px-3 ${
          effectiveCollapsed ? "md:justify-center" : "justify-between"
        }`}
      >
        <div className={`admin-sidebar-brand items-center gap-3 text-xl font-bold ${effectiveCollapsed ? "hidden" : "flex"}`}>
          <span className="admin-sidebar-brand-icon flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl">
            <LeadRetrievalBrandMark />
          </span>
          <span>SignalThread LR</span>
        </div>

        {!mobile ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="admin-sidebar-toggle hidden h-9 w-9 items-center justify-center rounded-lg border border-border text-slate-700 hover:bg-slate-50 md:inline-flex"
            aria-label={effectiveCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={effectiveCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronIcon collapsed={effectiveCollapsed} />
          </button>
        ) : null}
      </div>

      <nav
        className={
          mobile
            ? "admin-sidebar-nav flex flex-col gap-1 px-3 py-3"
            : "admin-sidebar-nav grid grid-cols-2 gap-2 px-3 py-3 sm:grid-cols-3 md:grid-cols-1 md:gap-1.5"
        }
      >
        {navItems.map((item) => {
          const active = isAdminNavItemActive(item, pathname);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={effectiveCollapsed ? item.label : undefined}
              onClick={onNavigate}
              className={`admin-sidebar-link group relative flex items-center gap-3 rounded-xl py-2 text-sm font-medium md:min-h-11 ${
                effectiveCollapsed ? "md:justify-center md:px-0" : "px-3"
              } ${active ? "is-active bg-accent text-white shadow-sm" : "text-slate-700 hover:bg-slate-100"}`}
            >
              <span className="shrink-0">
                <NavIcon name={item.icon} />
              </span>
              <span className={`${effectiveCollapsed ? "md:hidden" : ""}`}>{item.label}</span>

              {effectiveCollapsed ? (
                <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition md:block md:group-hover:opacity-100">
                  {item.label}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"}
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavIcon({ name }: { name: AdminNavIcon }) {
  if (name === "dashboard") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "events") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="2" />
        <path d="M8 3.5v4M16 3.5v4M3.5 9.5h17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "exhibitors") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="3" width="10" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M8 8h4M8 12h4M8 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M15 10h4v9h-4" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "users") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="2" />
        <path d="M3.5 18c1-2.4 2.8-3.8 5.5-3.8S13.6 15.6 14.5 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M17 9v6M14 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "integrations") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="6" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="2" />
        <rect x="13" y="13" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="2" />
        <path d="M11 8.5h2.5a2.5 2.5 0 0 1 2.5 2.5v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M16 10.5 14.2 8.7M16 10.5l-1.8 1.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "companies") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 20V7.5A1.5 1.5 0 0 1 5.5 6h6A1.5 1.5 0 0 1 13 7.5V20" stroke="currentColor" strokeWidth="2" />
        <path d="M13 20v-9.5A1.5 1.5 0 0 1 14.5 9h4A1.5 1.5 0 0 1 20 10.5V20" stroke="currentColor" strokeWidth="2" />
        <path d="M7.5 9.5h2M7.5 13h2M16 12h1.5M16 15.5h1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "activity") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 12h3l2-5 4 10 2-5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === "settings") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
        <path
          d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.6Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 12h5.5a4.5 4.5 0 0 0 0-9H9.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 6.5L7.5 9 10 11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17.5" cy="16.5" r="3.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
