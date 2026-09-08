/**
 * Pure derivation helpers for the Event Command Center at /exhibitor/dashboard.
 *
 * - Event identity: canonical name/status/dates/location for the header, with
 *   honest degradation when the event-details query fails (no fabricated data).
 * - Quick actions: only real, permission-verified event destinations.
 *
 * No server-only imports; formatting and lifecycle resolution reuse the
 * canonical helpers (`formatEventDateRange`, `formatEventLocation`,
 * `resolveEventLifecycle`) — never page-local logic.
 */

import { formatEventDateRange } from "@/lib/data/admin-events";
import {
  EVENT_PORTFOLIO_GROUP_LABEL,
  type EventPortfolioLifecycle
} from "@/lib/events/event-portfolio";
import { resolveEventLifecycle } from "@/lib/events/event-lifecycle";
import {
  isContinuousCaptureContainerKind,
  normalizeEventContainerKind
} from "@/lib/events/event-container-kind";
import {
  EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF,
  exhibitorEventSettingsHref
} from "@/lib/exhibitor/exhibitor-app-nav";
import { resolveEventLocation } from "@/lib/events/event-location";

/* ============================== Event identity ============================== */

export type EventIdentityRow = {
  id: string;
  name: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  state: string | null;
  location?: string | null;
  timezone?: string | null;
  container_kind: string | null;
};

export type EventIdentity = {
  name: string;
  /** False when the event-details query failed — render name only, no invented fields. */
  detailsAvailable: boolean;
  lifecycle: EventPortfolioLifecycle | null;
  /** Badge text: Live / Upcoming / Completed / "Unknown status". Null when details unavailable. */
  lifecycleLabel: string | null;
  /** Canonical formatted date range; null for continuous capture or when unavailable. */
  dateText: string | null;
  /** Canonical formatted location; null when no city/state or unavailable. */
  locationText: string | null;
  isContinuousCapture: boolean;
};

export function eventLifecycleBadgeLabel(lifecycle: EventPortfolioLifecycle): string {
  if (lifecycle === "unknown") return "Unknown status";
  return EVENT_PORTFOLIO_GROUP_LABEL[lifecycle];
}

export function deriveEventIdentity(input: {
  /** Display name from the accessible-event summaries (always available in-shell). */
  fallbackName: string;
  /** Container kind from the summaries, used when the details row is unavailable. */
  fallbackContainerKind: string | null;
  /** The narrow events row for the resolved active event, or null when its query failed. */
  row: EventIdentityRow | null;
  /** Event-local calendar day; null means timezone truth is unavailable. */
  todayYmd: string | null;
}): EventIdentity {
  const rowName = String(input.row?.name ?? "").trim();
  const fallback = String(input.fallbackName ?? "").trim();
  const name = rowName || fallback || "Event";

  const containerKind = input.row ? input.row.container_kind : input.fallbackContainerKind;
  const isContinuousCapture = isContinuousCaptureContainerKind(
    normalizeEventContainerKind(containerKind)
  );

  if (!input.row) {
    return {
      name,
      detailsAvailable: false,
      lifecycle: null,
      lifecycleLabel: null,
      dateText: null,
      locationText: null,
      isContinuousCapture
    };
  }

  // Canonical lifecycle: dates on the event-local calendar day, explicit
  // COMPLETED honored, stored status only as a fallback for missing dates.
  const lifecycle = input.todayYmd ? resolveEventLifecycle(input.row, input.todayYmd).state : null;
  const locationText = resolveEventLocation(input.row.city, input.row.state, input.row.location);
  return {
    name,
    detailsAvailable: true,
    lifecycle,
    lifecycleLabel: lifecycle ? eventLifecycleBadgeLabel(lifecycle) : "Timezone not configured",
    dateText: isContinuousCapture
      ? null
      : formatEventDateRange(input.row.start_date, input.row.end_date),
    locationText,
    isContinuousCapture
  };
}

/* ============================== Quick actions ============================== */

export type EventQuickAction = {
  key: "campaigns" | "users" | "settings";
  label: string;
  description: string;
  href: string;
  /** Whether this destination is scoped to the active event or to the whole company/account. */
  scope: "event" | "company";
};

/**
 * Management destinations reachable from the event workspace that actually work
 * for the current user today. Leads Intelligence is intentionally NOT here — it
 * is the page's primary header action (and the dashboard body itself), so a card
 * would only duplicate it.
 *
 * Mirrors the real page guards: campaigns/users/settings pages require an
 * exhibitor admin with web-admin access (`requireRole("exhibitor_admin")`), so
 * they are only offered when `canManage` is true. Campaigns and Users/licenses
 * are **company-scoped** (their pages/APIs filter by `company_id`, not the active
 * event) — the copy says so and must not claim event scope. Settings targets the
 * same per-tenant route the sidebar uses.
 */
export function buildEventQuickActions(input: {
  eventId: string;
  /** isExhibitorAdminRole(role) && web-admin access — same predicate the page computes. */
  canManage: boolean;
  /** Direct/portfolio tenants may use /app/events/{id}/settings. */
  allowsAppEventsManagementSurfaces: boolean;
  /** Assigned-only / legacy tenants consolidate on /exhibitor/settings. */
  eventLevelTenantUi: boolean;
}): EventQuickAction[] {
  if (!input.canManage) {
    return [];
  }
  const eventId = String(input.eventId ?? "").trim();

  const actions: EventQuickAction[] = [
    {
      key: "campaigns",
      label: "Campaigns",
      description: "Company-wide email outreach across your leads.",
      href: "/exhibitor/campaigns",
      scope: "company"
    },
    {
      key: "users",
      label: "Users & licenses",
      description: "Team access and app seats for your company.",
      href: "/exhibitor/users",
      scope: "company"
    }
  ];

  const settingsHref = input.eventLevelTenantUi
    ? EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF
    : input.allowsAppEventsManagementSurfaces
      ? exhibitorEventSettingsHref(eventId)
      : null;
  if (settingsHref) {
    actions.push({
      key: "settings",
      label: "Event settings",
      description: "Name, dates, and details for this event.",
      href: settingsHref,
      scope: "event"
    });
  }

  return actions;
}
