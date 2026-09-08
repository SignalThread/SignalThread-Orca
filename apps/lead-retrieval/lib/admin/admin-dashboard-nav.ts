export type AdminDashboardMode = "event_scoped" | "company_scoped";
export type AdminSidebarMode =
  | AdminDashboardMode
  | "exhibitor_multi"
  | "exhibitor_integrations";

export type AdminNavIcon =
  | "dashboard"
  | "events"
  | "exhibitors"
  | "users"
  | "licenses"
  | "integrations"
  | "companies"
  | "activity"
  | "settings";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: AdminNavIcon;
};

export const EVENT_SCOPED_ADMIN_ROOT_HREF = "/admin";
export const COMPANY_SCOPED_ADMIN_ROOT_HREF = "/admin/company-licenses";

const eventScopedPlatformNavItems: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard" },
  { href: "/admin/events", label: "Events", icon: "events" },
  { href: "/admin/exhibitors", label: "Exhibitors", icon: "exhibitors" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/licenses", label: "Licenses", icon: "licenses" },
  { href: "/admin/integrations", label: "Integrations", icon: "integrations" }
];

const companyScopedPlatformNavItems: AdminNavItem[] = [
  { href: "/admin/company-licenses", label: "Overview", icon: "dashboard" },
  { href: "/admin/company-licenses/companies", label: "Companies", icon: "companies" },
  { href: "/admin/company-licenses/licenses", label: "Licenses", icon: "licenses" },
  { href: "/admin/company-licenses/users", label: "Users", icon: "users" },
  { href: "/admin/company-licenses/events", label: "Events", icon: "events" },
  { href: "/admin/company-licenses/activity", label: "Activity", icon: "activity" },
  { href: "/admin/company-licenses/settings", label: "Settings", icon: "settings" }
];

const exhibitorMultiNavItems: AdminNavItem[] = [
  { href: "/admin/events", label: "Events", icon: "events" },
  { href: "/admin/integrations/salesforce/setup", label: "Salesforce", icon: "integrations" },
  { href: "/admin/integrations/zapier", label: "Zapier", icon: "integrations" }
];

const exhibitorIntegrationsNavItems: AdminNavItem[] = [
  { href: "/admin/integrations/salesforce/setup", label: "Salesforce", icon: "integrations" },
  { href: "/admin/integrations/zapier", label: "Zapier", icon: "integrations" }
];

export function resolveAdminDashboardModeForPath(pathname: string): AdminDashboardMode {
  return pathname === COMPANY_SCOPED_ADMIN_ROOT_HREF || pathname.startsWith(`${COMPANY_SCOPED_ADMIN_ROOT_HREF}/`)
    ? "company_scoped"
    : "event_scoped";
}

export function getAdminSidebarNavItems(mode: AdminSidebarMode): AdminNavItem[] {
  if (mode === "company_scoped") return companyScopedPlatformNavItems;
  if (mode === "exhibitor_multi") return exhibitorMultiNavItems;
  if (mode === "exhibitor_integrations") return exhibitorIntegrationsNavItems;
  return eventScopedPlatformNavItems;
}

export function getAdminDashboardModeTargetHref(mode: AdminDashboardMode): string {
  return mode === "company_scoped"
    ? COMPANY_SCOPED_ADMIN_ROOT_HREF
    : EVENT_SCOPED_ADMIN_ROOT_HREF;
}

export function getAdminDashboardModeLabel(mode: AdminDashboardMode): string {
  return mode === "company_scoped" ? "Company-Scoped Licenses" : "Event-Scoped Operations";
}

export function isAdminNavItemActive(item: AdminNavItem, pathname: string): boolean {
  if (item.href === "/admin") {
    return pathname === "/admin" || pathname === "/admin/dashboard";
  }
  if (item.href === COMPANY_SCOPED_ADMIN_ROOT_HREF) {
    return pathname === COMPANY_SCOPED_ADMIN_ROOT_HREF;
  }
  if (item.href === "/admin/events") {
    return pathname === "/admin/events" || pathname.startsWith("/admin/events/");
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
