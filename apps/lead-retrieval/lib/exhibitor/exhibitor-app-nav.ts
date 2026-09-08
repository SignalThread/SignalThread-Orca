/**
 * Exhibitor app sidebar navigation (data-only, pure module).
 *
 * The exhibitor sidebar has exactly two modes; this is the single source of truth and
 * MUST NOT be branched on with ad-hoc per-route conditionals elsewhere.
 *
 *   "account" mode — company/account management surface.
 *     Routes: /app/events, /app/events/new, /app/settings, /app/settings/*
 *     Left nav: [Events, Settings, Help]   (Settings → /app/settings, the account page)
 *
 *   "event"   mode — working inside one selected event.
 *     Routes: /app/events/{id}/..., /exhibitor/*, /campaigns/*, etc.
 *     Left nav: full event app nav [Dashboard, Leads, Campaign Agents, Documents & Links, Campaigns,
 *               Users, Integrations, Settings]
 *               (Settings → /app/events/{activeEventId}/settings, the OLD event settings page)
 *
 * Use {@link resolveExhibitorSidebarMode} (URL → mode) to decide which list to render.
 * For portfolio tenants, avoid pointing account-mode Settings and event-mode Settings at the same
 * route; event-level tenants consolidate on {@link EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF}.
 */

import { EXHIBITOR_BRIEFINGS_PATH, IMPORT_WIZARD_BASE_PATH } from "@/lib/import-wizard/paths";
import { isWorkflowsEnabled } from "@/lib/workflows/is-workflows-enabled";

export type ExhibitorSidebarIcon =
  | "dashboard"
  | "leads"
  | "signals"
  | "campaigns"
  | "email_templates"
  | "workflows"
  | "users"
  | "integrations"
  | "settings"
  | "help"
  | "import_wizard"
  | "briefings"
  | "documents"
  | "events";

/** Canonical URL for the exhibitor Workflows list page. */
export const EXHIBITOR_WORKFLOWS_HREF = "/exhibitor/workflows";

export type ExhibitorSidebarNavItem = {
  href: string;
  label: string;
  icon: ExhibitorSidebarIcon;
  subItems?: readonly { href: string; label: string; icon?: ExhibitorSidebarIcon }[];
};

/** Canonical URL for the exhibitor "Events" entry screen (no-event + chooser live here). */
export const EXHIBITOR_EVENTS_ENTRY_HREF = "/app/events";

/** Dedicated self-serve Create Event route under the events namespace. */
export const EXHIBITOR_EVENTS_CREATE_HREF = "/app/events/new";

/** Account-scoped settings (company/account management). */
export const EXHIBITOR_ACCOUNT_HREF = "/app/settings";
/** @deprecated Prefer {@link EXHIBITOR_ACCOUNT_HREF}. Kept for legacy import sites only. */
export const EXHIBITOR_COMPANY_SETTINGS_HREF = EXHIBITOR_ACCOUNT_HREF;

/** Simplified settings for assigned-only / legacy event-scoped exhibitors (no company team UI). */
export const EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF = "/exhibitor/settings";

/** Event-scoped settings (the OLD event settings surface) — never use for account settings. */
export function exhibitorEventSettingsHref(eventId: string): string {
  const id = String(eventId ?? "").trim();
  if (!id) return EXHIBITOR_EVENTS_ENTRY_HREF;
  return `/app/events/${id}/settings`;
}

/** Two distinct sidebar contexts. The mode is derived from the URL, never from local state. */
export type ExhibitorSidebarMode = "account" | "event";

function normalizeNavPath(p: string | null | undefined): string {
  const s = String(p ?? "").trim();
  if (!s) return "/";
  return s.endsWith("/") && s.length > 1 ? s.slice(0, -1) : s;
}

/**
 * Pure URL → nav-mode resolver.
 *
 * Rules (in order):
 *   1. If the user has zero accessible events, force "account" so they can self-serve setup.
 *   2. Account routes: "/app/events" (exact), "/app/events/new" (exact), "/app/settings/*".
 *   3. Everything else (incl. "/app/events/{id}/...", "/exhibitor/*", "/campaigns/*") → "event".
 *
 * This is the ONLY supported way to decide which sidebar list to render. Do not branch on
 * pathname elsewhere; call this helper instead.
 */
export function resolveExhibitorSidebarMode(input: {
  pathname: string;
  hasAccessibleEvents: boolean;
}): ExhibitorSidebarMode {
  if (!input.hasAccessibleEvents) return "account";
  const p = normalizeNavPath(input.pathname);
  if (p === EXHIBITOR_EVENTS_ENTRY_HREF) return "account";
  if (p === EXHIBITOR_EVENTS_CREATE_HREF) return "account";
  if (p === EXHIBITOR_ACCOUNT_HREF) return "account";
  if (p.startsWith(`${EXHIBITOR_ACCOUNT_HREF}/`)) return "account";
  return "event";
}

/** Account-mode sidebar: Events + account Settings + Help. */
const ACCOUNT_NAV: readonly ExhibitorSidebarNavItem[] = [
  { href: EXHIBITOR_EVENTS_ENTRY_HREF, label: "Manage", icon: "events" },
  { href: EXHIBITOR_ACCOUNT_HREF, label: "Settings", icon: "settings" },
  { href: "/help", label: "Help", icon: "help" }
];

/** Event-mode sidebar: full event app nav. Settings href is supplied by the caller. */
function buildEventModeNavForSettingsHref(settingsHref: string): readonly ExhibitorSidebarNavItem[] {
  const nav: ExhibitorSidebarNavItem[] = [
    { href: "/exhibitor/dashboard", label: "Dashboard", icon: "dashboard" },
    {
      href: "/exhibitor/leads",
      label: "Leads",
      icon: "leads",
      subItems: [
        { href: IMPORT_WIZARD_BASE_PATH, label: "Import Wizard", icon: "import_wizard" },
        { href: EXHIBITOR_BRIEFINGS_PATH, label: "Briefings", icon: "briefings" }
      ]
    },
    { href: "/exhibitor/signals", label: "Campaign Agents", icon: "signals" },
    { href: "/exhibitor/documents", label: "Documents & Links", icon: "documents" },
    { href: "/exhibitor/campaigns", label: "Campaigns", icon: "campaigns" },
    { href: "/exhibitor/users", label: "Users", icon: "users" },
    { href: "/exhibitor/integrations", label: "Integrations", icon: "integrations" },
    {
      href: settingsHref,
      label: "Settings",
      icon: "settings"
    },
    { href: "/help", label: "Help", icon: "help" }
  ];

  if (isWorkflowsEnabled()) {
    nav.splice(5, 0, {
      href: EXHIBITOR_WORKFLOWS_HREF,
      label: "Workflows",
      icon: "workflows"
    });
  }

  return nav;
}

/**
 * Returns the sidebar items for a given mode. Pure data; the caller (Sidebar) is responsible
 * for picking the mode via {@link resolveExhibitorSidebarMode}.
 */
export function getExhibitorNavItemsForSidebar(input: {
  mode: ExhibitorSidebarMode;
  activeEventId?: string | null;
  /**
   * When false, omit `/app/events` from account nav for users without portfolio management.
   * Portfolio viewers may still pass true from the shell so event-mode Settings targets the
   * per-event management page under `/app/events/{id}/settings`.
   */
  allowsAppEventsManagementSurfaces?: boolean;
  /**
   * Assigned-only / legacy event-scoped tenant: Settings uses {@link EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF}.
   */
  eventLevelTenantUi?: boolean;
}): ExhibitorSidebarNavItem[] {
  const allowsManagement = input.allowsAppEventsManagementSurfaces !== false;
  const eventLevelUi = input.eventLevelTenantUi === true;
  if (input.mode === "account") {
    if (allowsManagement) {
      return [...ACCOUNT_NAV];
    }
    if (eventLevelUi) {
      return [
        { href: EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF, label: "Settings", icon: "settings" },
        { href: "/help", label: "Help", icon: "help" }
      ];
    }
    return [
      { href: EXHIBITOR_ACCOUNT_HREF, label: "Settings", icon: "settings" },
      { href: "/help", label: "Help", icon: "help" }
    ];
  }
  const id = String(input.activeEventId ?? "").trim() || null;
  let settingsHref: string;
  if (eventLevelUi) {
    settingsHref = EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF;
  } else if (allowsManagement) {
    settingsHref = id ? exhibitorEventSettingsHref(id) : EXHIBITOR_EVENTS_ENTRY_HREF;
  } else {
    settingsHref = EXHIBITOR_ACCOUNT_HREF;
  }
  return [...buildEventModeNavForSettingsHref(settingsHref)];
}

/**
 * Paths an exhibitor may load when they have zero accessible events.
 *
 * Event-scoped surfaces (dashboard, leads, signals, campaigns, etc.) remain blocked.
 * Account surfaces: `/app/settings` for portfolio tenants; `/exhibitor/settings` for event-level
 * tenants ({@link EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF}). `/app/events` index + create only when
 * `allowsAppEventsManagementSurfaces` is true (default: direct-license behavior).
 */
export function isExhibitorEntryPathAllowedWithNoEvents(
  pathname: string,
  input?: {
    allowsAppEventsManagementSurfaces?: boolean;
    /**
     * When true with no accessible events, only {@link EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF} is allowed
     * from exhibitor entry gates (not `/app/settings`).
     */
    eventLevelTenantUi?: boolean;
  }
): boolean {
  const allowsManagement = input?.allowsAppEventsManagementSurfaces !== false;
  const eventLevelUi = input?.eventLevelTenantUi === true;
  const n = normalizeNavPath(pathname);

  if (eventLevelUi) {
    if (n === EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF) return true;
    if (n.startsWith(`${EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF}/`)) return true;
    return false;
  }

  if (n === EXHIBITOR_ACCOUNT_HREF) return true;
  if (n.startsWith(`${EXHIBITOR_ACCOUNT_HREF}/`)) return true;
  if (!allowsManagement) return false;
  if (n === EXHIBITOR_EVENTS_ENTRY_HREF) return true;
  if (n === EXHIBITOR_EVENTS_CREATE_HREF) return true;
  return false;
}
