"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Building2,
  CalendarDays,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  Mail,
  Megaphone,
  PlugZap,
  Scale,
  Settings,
  Sparkles,
  Upload,
  Users,
  UsersRound,
  Workflow,
} from "lucide-react";
import type { AppRole } from "@/types/app";
import { EXHIBITOR_BRIEFINGS_PATH, IMPORT_WIZARD_BASE_PATH } from "@/lib/import-wizard/paths";
import type { ExhibitorSidebarIcon } from "@/lib/exhibitor/exhibitor-app-nav";
import {
  EXHIBITOR_ACCOUNT_HREF,
  EXHIBITOR_EVENTS_ENTRY_HREF,
  EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF,
  getExhibitorNavItemsForSidebar,
  resolveExhibitorSidebarMode
} from "@/lib/exhibitor/exhibitor-app-nav";
import { LeadRetrievalBrandMark } from "@/components/layout/lead-retrieval-brand-mark";

type NavIconName = ExhibitorSidebarIcon | "companies" | "licenses" | "help";

type NavSubItem = { href: string; label: string; icon?: NavIconName };

type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  /** Shown under this item (e.g. Import Wizard under Leads). */
  subItems?: readonly NavSubItem[];
};

type NavSection = { title: string | null; items: NavItem[] };

type FlatNavItem = NavItem & { isSubordinate?: boolean };

const organizerNav: NavItem[] = [
  { href: "/app/organizer", label: "Overview", icon: "dashboard" },
  { href: "/app/organizer/events", label: "Events", icon: "events" },
  { href: "/app/organizer/exhibitors", label: "Exhibitors", icon: "companies" },
  { href: "/app/organizer/performance", label: "Performance", icon: "leads" },
  { href: "/app/organizer/licenses", label: "Licenses", icon: "licenses" },
  { href: "/app/organizer/users", label: "Invites", icon: "users" },
  { href: "/help", label: "Help", icon: "help" }
];

/** Organizer destinations reuse the established organizer routes. */
function buildOrganizerSections(navItems: NavItem[]): NavSection[] {
  const byHref = new Map(navItems.map((item) => [item.href, item]));
  const take = (href: string) => byHref.get(href);
  const primary = [
    take("/app/organizer"),
    take("/app/organizer/events"),
    take("/app/organizer/exhibitors"),
    take("/app/organizer/performance")
  ].filter(Boolean) as NavItem[];
  const administration = [take("/app/organizer/licenses"), take("/app/organizer/users")].filter(Boolean) as NavItem[];

  return [
    { title: "Primary", items: primary },
    { title: "Administration", items: administration }
  ].filter((section) => section.items.length);
}

function buildExhibitorSections(navItems: NavItem[]): NavSection[] {
  if (
    navItems.length === 2 &&
    navItems.some((i) => i.href === EXHIBITOR_EVENTS_ENTRY_HREF) &&
    navItems.some((i) => i.href === EXHIBITOR_ACCOUNT_HREF)
  ) {
    const events = navItems.find((i) => i.href === EXHIBITOR_EVENTS_ENTRY_HREF)!;
    const account = navItems.find((i) => i.href === EXHIBITOR_ACCOUNT_HREF)!;
    return [{ title: null, items: [events, account] }];
  }

  const byHref = new Map(navItems.map((item) => [item.href, item]));
  const consumed = new Set<string>();

  const take = (href: string) => {
    const next = byHref.get(href) ?? null;
    if (next) consumed.add(href);
    return next;
  };
  const takeWhere = (predicate: (item: NavItem) => boolean) => {
    const next = navItems.find((item) => !consumed.has(item.href) && predicate(item)) ?? null;
    if (next) consumed.add(next.href);
    return next;
  };

  const dashboardItem = take("/exhibitor/dashboard") ?? take(EXHIBITOR_EVENTS_ENTRY_HREF);
  const leadsSection = [take("/exhibitor/leads")].filter(Boolean) as NavItem[];
  const engagementSection = [
    take("/exhibitor/signals"),
    take("/exhibitor/documents"),
    take("/exhibitor/campaigns"),
    take("/exhibitor/workflows")
  ].filter(Boolean) as NavItem[];
  const systemSection = [
    take("/exhibitor/users"),
    take("/exhibitor/integrations"),
    takeWhere((item) => item.label === "Settings")
  ].filter(Boolean) as NavItem[];
  const remainingItems = navItems.filter((item) => !consumed.has(item.href));

  const sections: NavSection[] = [];
  if (dashboardItem) {
    sections.push({ title: null, items: [dashboardItem] });
  }
  if (leadsSection.length) {
    sections.push({ title: "Leads", items: leadsSection });
  }
  if (engagementSection.length) {
    sections.push({ title: "Engagement", items: engagementSection });
  }
  if (systemSection.length) {
    sections.push({ title: "System", items: systemSection });
  }
  if (remainingItems.length) {
    sections.push({ title: "More", items: remainingItems });
  }

  return sections;
}

function normalizePathForNav(p: string): string {
  return p.endsWith("/") && p.length > 1 ? p.slice(0, -1) : p;
}

function isExhibitorSubLinkActive(subHref: string, currentPath: string): boolean {
  const normalizedPath = normalizePathForNav(currentPath);
  const normalizedSub = normalizePathForNav(subHref);
  return normalizedPath === normalizedSub || normalizedPath.startsWith(`${normalizedSub}/`);
}

/** True when the Leads workflow section should show nested links (route-driven). */
function isLeadsNavSectionExpanded(currentPath: string): boolean {
  return (
    isLeadsParentExactActive(currentPath) ||
    isExhibitorSubLinkActive(IMPORT_WIZARD_BASE_PATH, currentPath) ||
    isExhibitorSubLinkActive(EXHIBITOR_BRIEFINGS_PATH, currentPath)
  );
}

function isLeadsParentExactActive(currentPath: string): boolean {
  const normalizedPath = normalizePathForNav(currentPath);
  return normalizedPath === "/exhibitor/leads" || normalizedPath.startsWith("/exhibitor/leads/");
}

function isExhibitorActive(item: NavItem, currentPath: string): boolean {
  const normalizedPath = normalizePathForNav(currentPath);
  const normalizedHref = normalizePathForNav(item.href);
  if (normalizedHref === "/exhibitor/dashboard") {
    return normalizedPath === normalizedHref;
  }
  if (normalizedHref === "/exhibitor/integrations") {
    return normalizedPath.startsWith(normalizedHref) || normalizedPath.startsWith("/admin/integrations/");
  }
  return normalizedPath.startsWith(normalizedHref);
}

function isExhibitorParentRowActive(item: NavItem, pathname: string): boolean {
  if (item.href !== "/exhibitor/leads") {
    return isExhibitorActive(item, pathname);
  }
  const normalizedPath = normalizePathForNav(pathname);
  const onLeadsIndex = normalizedPath === "/exhibitor/leads" || normalizedPath.startsWith("/exhibitor/leads/");
  const onChild = item.subItems?.some((sub) => isExhibitorSubLinkActive(sub.href, pathname)) ?? false;
  return onLeadsIndex || onChild;
}

/** Strong parent highlight: only when no child route is active (e.g. on /exhibitor/leads). */
function isLeadsParentStrong(pathname: string, item: NavItem): boolean {
  if (item.href !== "/exhibitor/leads" || !item.subItems?.length) return false;
  const childActive = item.subItems.some((s) => isExhibitorSubLinkActive(s.href, pathname));
  if (childActive) return false;
  return isLeadsParentExactActive(pathname);
}

/** Subtle parent when a child destination is active — section context only. */
function isLeadsParentSubtle(pathname: string, item: NavItem): boolean {
  if (item.href !== "/exhibitor/leads" || !item.subItems?.length) return false;
  if (!isLeadsNavSectionExpanded(pathname)) return false;
  return item.subItems.some((s) => isExhibitorSubLinkActive(s.href, pathname));
}

function exhibitorParentRowClass(item: NavItem, pathname: string): string {
  const base =
    "app-sidebar-link group relative flex min-h-9 items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition border-l-2";
  if (item.href === "/exhibitor/leads" && item.subItems?.length) {
    if (isLeadsParentStrong(pathname, item)) {
      return `${base} border-indigo-600 bg-slate-100 text-slate-900 shadow-none`;
    }
    if (isLeadsParentSubtle(pathname, item)) {
      return `${base} border-indigo-200/70 bg-indigo-50/50 text-slate-700`;
    }
    return `${base} border-transparent text-slate-600 hover:bg-slate-100/90 hover:text-slate-900`;
  }
  if (isExhibitorActive(item, pathname)) {
    return `${base} border-indigo-600 bg-slate-100 text-slate-900 shadow-none`;
  }
  return `${base} border-transparent text-slate-600 hover:bg-slate-100/90 hover:text-slate-900`;
}

function exhibitorSubRowClass(subActive: boolean): string {
  const base =
    "app-sidebar-link group relative ml-1 flex min-h-8 items-center gap-2 rounded-md py-1 pr-2 pl-2.5 text-[12px] font-medium transition border-l-2";
  if (subActive) {
    return `${base} border-indigo-600 bg-slate-100 text-slate-900`;
  }
  return `${base} border-transparent text-slate-500 hover:bg-slate-100/85 hover:text-slate-900`;
}

function isOrganizerActive(item: NavItem, currentPath: string): boolean {
  const normalizedPath = normalizePathForNav(currentPath);
  if (item.href === "/app/organizer") {
    return normalizedPath === "/app/organizer";
  }
  if (item.href === "/app/organizer/exhibitors") {
    return normalizedPath.startsWith("/app/organizer/exhibitors");
  }
  if (item.href === "/app/organizer/events") {
    return normalizedPath.startsWith("/app/organizer/events");
  }
  if (item.href === "/app/organizer/performance") {
    return normalizedPath.startsWith("/app/organizer/performance");
  }
  if (item.href === "/app/organizer/licenses") {
    return normalizedPath.startsWith("/app/organizer/licenses");
  }
  if (item.href === "/app/organizer/users") {
    return normalizedPath.startsWith("/app/organizer/invites") || normalizedPath.startsWith("/app/organizer/users");
  }
  if (item.href === "/help") {
    return normalizedPath === "/help";
  }
  return false;
}

/** Collapsed (icon-only): one row per top-level item; no left rail, no stacked sub-rows. */
function collapsedIconRowClass(isActive: boolean): string {
  const base =
    "app-sidebar-link group relative flex w-full min-h-10 shrink-0 items-center justify-center rounded-lg border-0 px-0 py-0 text-[13px] font-medium transition outline-none";
  return isActive
    ? `${base} bg-indigo-100/90 text-indigo-800`
    : `${base} text-slate-500 hover:bg-slate-100/90 hover:text-slate-900`;
}

function isCollapsedExhibitorTopItemActive(item: NavItem, pathname: string): boolean {
  if (item.subItems?.length) {
    return isExhibitorParentRowActive(item, pathname);
  }
  return isExhibitorActive(item, pathname);
}

function collapsedExhibitorRowClass(item: NavItem, flat: FlatNavItem, pathname: string, role: AppRole | null): string {
  const base =
    "app-sidebar-link group relative flex items-center gap-2 rounded-md border-l-2 py-1.5 text-[13px] font-medium md:min-h-9";
  if (role === "platform_admin" || role === "organizer_admin") {
    return isOrganizerActive(item, pathname)
      ? `${base} is-active border-indigo-600 bg-slate-100 text-slate-900`
      : `${base} border-transparent text-slate-600 hover:bg-slate-100/90 hover:text-slate-900`;
  }
  if (flat.isSubordinate) {
    return isExhibitorSubLinkActive(item.href, pathname)
      ? `${base} border-indigo-600 bg-slate-100 text-slate-900`
      : `${base} border-transparent text-slate-500 hover:bg-slate-100/85 hover:text-slate-900`;
  }
  if (item.href === "/exhibitor/leads" && item.subItems?.length) {
    if (isLeadsParentStrong(pathname, item)) {
      return `${base} border-indigo-600 bg-slate-100 text-slate-900`;
    }
    if (isLeadsParentSubtle(pathname, item)) {
      return `${base} border-indigo-200/70 bg-indigo-50/50 text-slate-700`;
    }
    return `${base} border-transparent text-slate-600 hover:bg-slate-100/90 hover:text-slate-900`;
  }
  return isExhibitorActive(item, pathname)
    ? `${base} border-indigo-600 bg-slate-100 text-slate-900`
    : `${base} border-transparent text-slate-600 hover:bg-slate-100/90 hover:text-slate-900`;
}

function organizerRowClass(item: NavItem, pathname: string): string {
  const base =
    "app-sidebar-link group relative flex h-11 items-center gap-2.5 rounded-lg border-l-2 px-3 text-[13px] font-medium transition";
  return isOrganizerActive(item, pathname)
    ? `${base} border-indigo-600 bg-indigo-50 text-indigo-900`
    : `${base} border-transparent text-slate-600 hover:bg-slate-100/90 hover:text-slate-900`;
}

const STORAGE_KEY = "leadintel.sidebar.collapsed";

export function Sidebar({
  role,
  mobile = false,
  onNavigate,
  exhibitorHasAccessibleEvents,
  exhibitorActiveEventId,
  exhibitorAllowsAppEventsManagementSurfaces,
  exhibitorEventLevelTenantUi
}: {
  role: AppRole | null;
  mobile?: boolean;
  onNavigate?: () => void;
  /** When false, exhibitor sidebar shows only Events. When null/undefined, treated as full nav (safe default). */
  exhibitorHasAccessibleEvents?: boolean | null;
  /** Canonical selected active event id from server resolver (used for event-mode Settings href). */
  exhibitorActiveEventId?: string | null;
  /** Direct license (admin): management surfaces allowed. Event-level: false. See body for viewer nuance. */
  exhibitorAllowsAppEventsManagementSurfaces?: boolean;
  /** Assigned-only / legacy event-scoped resolver branch (simplified settings + nav). */
  exhibitorEventLevelTenantUi?: boolean;
}) {
  const pathname = usePathname();
  const isExhibitorSidebar = role !== "platform_admin" && role !== "organizer_admin";
  const organizerNavItems: NavItem[] =
    role === "organizer_admin"
      ? organizerNav
      : role === "platform_admin"
        ? organizerNav.filter((item) => item.href !== "/app/organizer/performance")
        : [];
  const exhibitorHasEvents = exhibitorHasAccessibleEvents !== false;
  const portfolioManagement = exhibitorAllowsAppEventsManagementSurfaces !== false;
  /** Portfolio viewers need event-mode Settings → `/app/events/{id}/settings` while admins stay server-accurate. */
  const viewerPortfolioNavHack =
    role === "exhibitor_viewer" && exhibitorEventLevelTenantUi !== true;
  const navPortfolioManagement = portfolioManagement || viewerPortfolioNavHack;
  // Two-mode sidebar: pure URL → mode resolver. Account routes (/app/events,
  // /app/events/new, /app/settings/*) get a minimal [Events, Settings] nav; everything else
  // gets the full event app nav. See lib/exhibitor/exhibitor-app-nav.ts for the canonical rules.
  const exhibitorSidebarMode = resolveExhibitorSidebarMode({
    pathname,
    hasAccessibleEvents: exhibitorHasEvents
  });
  const fullExhibitorNavItems: NavItem[] = isExhibitorSidebar
    ? getExhibitorNavItemsForSidebar({
        mode: exhibitorSidebarMode,
        activeEventId: exhibitorActiveEventId,
        allowsAppEventsManagementSurfaces: navPortfolioManagement,
        eventLevelTenantUi: exhibitorEventLevelTenantUi === true
      })
    : [];
  /**
   * `exhibitor_viewer` is the limited read-only exhibitor role: only Dashboard +
   * Leads (no Import / Briefings subitems, no Campaign Agents,
   * Campaigns, Email Templates, Users, Integrations, or account-mode Events nav).
   * Assigned-only / legacy scoped viewers also get simplified Settings (`/exhibitor/settings`).
   * Everything else is exhibitor_admin-only.
   */
  const exhibitorNavItems: NavItem[] =
    isExhibitorSidebar && role === "exhibitor_viewer"
      ? fullExhibitorNavItems
          .filter(
            (item) =>
              item.href === "/exhibitor/dashboard" ||
              item.href === "/exhibitor/leads" ||
              item.href === "/help" ||
              (exhibitorEventLevelTenantUi === true && item.href === EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF)
          )
          .map((item) =>
            item.href === "/exhibitor/leads" ? { ...item, subItems: undefined } : item
          )
      : fullExhibitorNavItems;
  /** Use canonical tree (not flattened) so Leads retains sub-items like Import Wizard. */
  const exhibitorSections = isExhibitorSidebar ? buildExhibitorSections(exhibitorNavItems) : [];
  const organizerSections = role === "organizer_admin" ? buildOrganizerSections(organizerNavItems) : [];
  const organizerHelpItem = role === "organizer_admin" ? organizerNavItems.find((item) => item.href === "/help") : null;
  const [collapsed, setCollapsed] = useState(false);
  const effectiveCollapsed = mobile ? false : collapsed;

  useEffect(() => {
    if (mobile) {
      setCollapsed(false);
      return;
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      setCollapsed(raw === "1");
    } catch {
      setCollapsed(false);
    }
  }, [mobile]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Ignore persistence errors; UI still toggles.
      }
      return next;
    });
  }

  return (
    <aside
      className={`app-sidebar flex w-full flex-col border-slate-200 bg-slate-50 ${
        mobile
          ? "h-full border-0"
          : `border-b md:min-h-screen md:shrink-0 md:border-b-0 md:border-r md:transition-[width] md:duration-200 ${
              effectiveCollapsed ? "md:w-[4.5rem]" : "md:w-60"
            }`
      }`}
    >
      <div
        className={`app-sidebar-header flex shrink-0 border-b border-slate-200/90 bg-white/60 px-2 md:px-2 ${
          effectiveCollapsed
            ? "flex-col items-center gap-2 py-2.5 md:py-3"
            : mobile
              ? "h-16 items-center justify-between gap-2 px-4"
              : "h-14 items-center justify-between gap-2 md:px-3"
        }`}
      >
        <div
          className={`app-sidebar-brand flex min-w-0 items-center gap-2.5 ${effectiveCollapsed ? "w-full justify-center" : "flex-1"}`}
        >
          <div className="app-sidebar-brand-icon flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-sm">
            <LeadRetrievalBrandMark />
          </div>
          <span
            className={`truncate text-[15px] font-semibold tracking-tight text-slate-900 ${
              effectiveCollapsed ? "md:hidden" : ""
            }`}
          >
            SignalThread LR
          </span>
        </div>

        {!mobile ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="app-sidebar-toggle hidden h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200/90 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 md:inline-flex"
            aria-label={effectiveCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={effectiveCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronIcon collapsed={effectiveCollapsed} />
          </button>
        ) : null}
      </div>

      {isExhibitorSidebar && effectiveCollapsed ? (
        <nav
          className="app-sidebar-nav flex flex-1 flex-col gap-1 overflow-y-auto px-1.5 py-2 md:gap-1.5 md:py-2"
          aria-label="Exhibitor navigation"
        >
          {exhibitorNavItems.map((item) => {
            const active = isCollapsedExhibitorTopItemActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={collapsedIconRowClass(active)}
                onClick={onNavigate}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                    active ? "text-indigo-700" : "text-slate-400 group-hover:text-slate-600"
                  }`}
                >
                  <NavIcon name={item.icon} />
                </span>
                <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition md:group-hover:opacity-100">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      ) : isExhibitorSidebar && !effectiveCollapsed ? (
        <nav className={`app-sidebar-nav flex-1 overflow-y-auto px-2 py-3 ${mobile ? "pb-5" : "md:py-3"}`}>
          {exhibitorSections.map((section, sectionIndex) => (
            <div
              key={`${section.title ?? "primary"}:${sectionIndex}`}
              className={sectionIndex === 0 ? "" : "mt-5 border-t border-slate-200/70 pt-4"}
            >
              {section.title ? (
                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {section.title}
                </p>
              ) : null}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const leadsExpanded = Boolean(item.subItems?.length && isLeadsNavSectionExpanded(pathname));
                  const parentStrong =
                    item.href === "/exhibitor/leads" && item.subItems?.length
                      ? isLeadsParentStrong(pathname, item)
                      : isExhibitorActive(item, pathname);
                  const parentSubtle = isLeadsParentSubtle(pathname, item);
                  const iconMuted = parentSubtle && !parentStrong;
                  return (
                    <div key={item.href} className={item.subItems?.length ? "space-y-0.5" : ""}>
                      <Link href={item.href} className={exhibitorParentRowClass(item, pathname)} onClick={onNavigate}>
                        <span
                          className={`flex w-8 shrink-0 justify-center ${
                            parentStrong
                              ? "text-indigo-700"
                              : iconMuted
                                ? "text-indigo-600/70"
                                : "text-slate-400 group-hover:text-slate-600"
                          }`}
                        >
                          <NavIcon name={item.icon} />
                        </span>
                        <span className="min-w-0 truncate">{item.label}</span>
                      </Link>
                      {item.subItems?.length && leadsExpanded ? (
                        <div className="ml-1.5 border-l border-slate-200/80 pl-2 pt-0.5">
                          {item.subItems.map((sub) => {
                            const subActive = isExhibitorSubLinkActive(sub.href, pathname);
                            const subIcon = sub.icon ?? item.icon;
                            return (
                              <Link
                                key={sub.href}
                                href={sub.href}
                                className={exhibitorSubRowClass(subActive)}
                                data-testid={`app-sidebar-sublink-${sub.href.replace(/\//g, "-").replace(/^-/, "")}`}
                                onClick={onNavigate}
                              >
                                <span
                                  className={`flex w-6 shrink-0 justify-center ${
                                    subActive ? "text-indigo-700" : "text-slate-400 opacity-90 group-hover:text-slate-500"
                                  }`}
                                >
                                  <NavIcon name={subIcon} />
                                </span>
                                <span className="min-w-0 truncate">{sub.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      ) : role === "organizer_admin" && !effectiveCollapsed ? (
        <nav className="app-sidebar-nav flex flex-1 flex-col overflow-y-auto px-2 py-3" aria-label="Organizer navigation">
          {organizerSections.map((section, sectionIndex) => (
            <div key={section.title} className={sectionIndex === 0 ? "" : "mt-5 border-t border-slate-200/70 pt-4"}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{section.title}</p>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <Link key={item.href} href={item.href} className={organizerRowClass(item, pathname)} onClick={onNavigate}>
                    <span
                      className={`flex w-5 shrink-0 justify-center ${
                        isOrganizerActive(item, pathname) ? "text-indigo-700" : "text-slate-400 group-hover:text-slate-600"
                      }`}
                    >
                      <NavIcon name={item.icon} />
                    </span>
                    <span className="min-w-0 truncate">{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {organizerHelpItem ? (
            <div className="mt-auto border-t border-slate-200/70 pt-4">
              <Link href={organizerHelpItem.href} className={organizerRowClass(organizerHelpItem, pathname)} onClick={onNavigate}>
                <span
                  className={`flex w-5 shrink-0 justify-center ${
                    isOrganizerActive(organizerHelpItem, pathname) ? "text-indigo-700" : "text-slate-400 group-hover:text-slate-600"
                  }`}
                >
                  <NavIcon name={organizerHelpItem.icon} />
                </span>
                <span className="min-w-0 truncate">Help</span>
              </Link>
            </div>
          ) : null}
        </nav>
      ) : (
        <nav
          className={
            effectiveCollapsed
              ? "app-sidebar-nav flex flex-1 flex-col gap-1 overflow-y-auto px-1.5 py-2 md:gap-1.5 md:py-2"
              : mobile
                ? "app-sidebar-nav flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3"
                : "app-sidebar-nav grid flex-1 grid-cols-2 gap-1 px-2 py-2 sm:grid-cols-3 md:grid-cols-1 md:gap-0.5 md:overflow-y-auto md:px-1.5 md:py-2"
          }
          aria-label="Main navigation"
        >
          {organizerNavItems.map((item) => {
            const flat = item as FlatNavItem;
            const subordinate = Boolean(flat.isSubordinate);
            if (effectiveCollapsed) {
              const orgActive = isOrganizerActive(item, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={collapsedIconRowClass(orgActive)}
                  onClick={onNavigate}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                      orgActive ? "text-indigo-700" : "text-slate-400 group-hover:text-slate-600"
                    }`}
                  >
                    <NavIcon name={item.icon} />
                  </span>
                  <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition md:group-hover:opacity-100">
                    {item.label}
                  </span>
                </Link>
              );
            }
            const rowClass = collapsedExhibitorRowClass(item, flat, pathname, role);
            const subActive = subordinate && isExhibitorSubLinkActive(item.href, pathname);
            const leadsItem = item as NavItem;
            const parentStrong =
              !subordinate && leadsItem.href === "/exhibitor/leads" && leadsItem.subItems?.length
                ? isLeadsParentStrong(pathname, leadsItem)
                : false;
            const parentSubtle =
              !subordinate && leadsItem.href === "/exhibitor/leads" && leadsItem.subItems?.length
                ? isLeadsParentSubtle(pathname, leadsItem)
                : false;
            const iconStrong =
              role === "platform_admin" || role === "organizer_admin"
                ? isOrganizerActive(item, pathname)
                : subActive || parentStrong || (!subordinate && !parentSubtle && !parentStrong && isExhibitorActive(item, pathname));
            const iconSoft = parentSubtle;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${rowClass} ${subordinate ? "px-2 pl-4 text-[12px]" : "px-2"}`}
                onClick={onNavigate}
              >
                <span
                  className={`flex shrink-0 justify-center ${subordinate ? "w-6 opacity-80" : "w-8"} ${
                    iconStrong
                      ? "text-indigo-700"
                      : iconSoft
                        ? "text-indigo-600/75"
                        : "text-slate-400 group-hover:text-slate-600"
                  }`}
                >
                  <NavIcon name={item.icon} />
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`min-w-0 truncate ${subordinate ? "font-medium" : ""}`}>{item.label}</span>
                  {!subordinate && item.href === "/exhibitor/workflows" ? (
                    <span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-700">
                      Beta
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </nav>
      )}
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

const NAV_ICON_DIM = 20;
const NAV_ICON_STROKE = 2;

function NavIcon({ name }: { name: NavIconName }) {
  const p = {
    size: NAV_ICON_DIM,
    strokeWidth: NAV_ICON_STROKE,
    className: "shrink-0",
    "aria-hidden": true,
  } as const;

  switch (name) {
    case "dashboard":
      return <LayoutDashboard {...p} />;
    case "events":
      return <CalendarDays {...p} />;
    case "leads":
      return <Users {...p} />;
    case "import_wizard":
      return <Upload {...p} />;
    case "briefings":
      return <Sparkles {...p} />;
    case "documents":
      return <FolderOpen {...p} />;
    case "signals":
      return <Activity {...p} />;
    case "campaigns":
      return <Megaphone {...p} />;
    case "email_templates":
      return <Mail {...p} />;
    case "workflows":
      return <Workflow {...p} />;
    case "users":
      return <UsersRound {...p} />;
    case "integrations":
      return <PlugZap {...p} />;
    case "settings":
      return <Settings {...p} />;
    case "help":
      return <HelpCircle {...p} />;
    case "companies":
      return <Building2 {...p} />;
    case "licenses":
      return <Scale {...p} />;
    default:
      return <Settings {...p} />;
  }
}
