/**
 * Pure helpers for the canonical event-access resolver.
 *
 * event_access_mode lives on users. It only determines which events a direct-buyer company user
 * may access when the company has an eligible company-scoped license. It does NOT:
 *   - grant access by itself (the company-scoped license is the product gate)
 *   - control event creation (license + creation entitlement does)
 *   - replace `role` (role is the capability class)
 *   - interact with seats
 *
 * Without an eligible license, the resolver returns legacy event-scoped access (event_users).
 */

export const EVENT_ACCESS_MODES = ["all_company_events", "assigned_events_only"] as const;

export type EventAccessMode = (typeof EVENT_ACCESS_MODES)[number];

export const DEFAULT_EVENT_ACCESS_MODE: EventAccessMode = "all_company_events";

/**
 * Resolution tag explaining which branch produced `eventIds`.
 *
 *   platform_all         — platform_admin; callers handle platform surfaces (no list returned here).
 *   organizer_scope      — organizer_admin; events derived from existing organizer scope.
 *   company_all_events   — eligible company license + all_company_events mode.
 *   company_assigned_only — eligible company license + assigned_events_only mode.
 *   legacy_event_scoped  — no eligible license; fallback to event_users membership.
 *   none                 — no accessible events (missing company, unknown role, etc.).
 */
export type EventAccessResolution =
  | "platform_all"
  | "organizer_scope"
  | "company_all_events"
  | "company_assigned_only"
  | "legacy_event_scoped"
  | "none";

/**
 * **Direct** exhibitor license (company portfolio): eligible company-scoped license with
 * `all_company_events` — user may use `/app/events` management surfaces.
 *
 * **Event-level** (assigned-only or legacy event_users / event-scoped license path):
 * `company_assigned_only` or `legacy_event_scoped` — no company portfolio management UI; work
 * inside per-event app routes only.
 */
export function isExhibitorDirectPortfolioEventAccessResolution(
  resolution: EventAccessResolution
): boolean {
  return resolution === "company_all_events";
}

/**
 * Exhibitor surfaces that are scoped to explicit event assignment / legacy event_users only.
 * Used for UI that must not expose company portfolio management or multi-event switching.
 */
export function isExhibitorEventLevelTenantUiResolution(resolution: EventAccessResolution): boolean {
  return resolution === "company_assigned_only" || resolution === "legacy_event_scoped";
}

export function normalizeEventAccessMode(value: string | null | undefined): EventAccessMode {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "assigned_events_only") return "assigned_events_only";
  if (v === "all_company_events") return "all_company_events";
  return DEFAULT_EVENT_ACCESS_MODE;
}

/**
 * Reads `users.event_access_mode` as stored in the database.
 * Null/empty means **unset** (distinct from an explicit {@link DEFAULT_EVENT_ACCESS_MODE}).
 */
export function parseEventAccessModeColumn(value: string | null | undefined): EventAccessMode | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "assigned_events_only") return "assigned_events_only";
  if (v === "all_company_events") return "all_company_events";
  return DEFAULT_EVENT_ACCESS_MODE;
}

export type CompanyEventAccessPureInputs = {
  licenseEligible: boolean;
  eventAccessMode: EventAccessMode;
  companyOwnedEventIds: string[];
  /** Only explicit user→event rows scoped to the same exhibitor company. */
  assignedCompanyEventIds: string[];
  /** Fallback used when licenseEligible is false: all event_users rows scoped to this user/company. */
  legacyEventIds: string[];
};

export type CompanyEventAccessPureResult = {
  eventIds: string[];
  resolution: Extract<
    EventAccessResolution,
    "company_all_events" | "company_assigned_only" | "legacy_event_scoped"
  >;
};

/**
 * Canonical pure rule for direct-buyer company users.
 *
 * - No license eligibility: legacy event-scoped (event_users membership only).
 * - License eligible + all_company_events: all events where events.company_id = user.company_id.
 * - License eligible + assigned_events_only: only explicit event_users rows for this user/company.
 *
 * assigned_events_only MUST NOT silently widen just because the company has a valid license.
 * all_company_events MUST NOT activate without a valid license.
 *
 * Product note: invites with `assigned_events_only` normally require ≥1 assigned event at invite time,
 * but a user may still end up with zero `event_users` rows (manual data changes, revokes, or bugs).
 * That state is valid: resolvers must return an empty accessible set, not company-owned fallbacks.
 */
export function computeCompanyEventAccessSet(
  input: CompanyEventAccessPureInputs
): CompanyEventAccessPureResult {
  if (!input.licenseEligible) {
    return { eventIds: dedupe(input.legacyEventIds), resolution: "legacy_event_scoped" };
  }
  if (input.eventAccessMode === "all_company_events") {
    return { eventIds: dedupe(input.companyOwnedEventIds), resolution: "company_all_events" };
  }
  return { eventIds: dedupe(input.assignedCompanyEventIds), resolution: "company_assigned_only" };
}

/**
 * Server-authoritative selection: return a preferred event id only if it is in the accessible set,
 * otherwise the first accessible id, otherwise null. Never trusts client-supplied values.
 */
export function pickValidatedEventIdForAccess(
  accessibleEventIds: string[],
  preferredEventId: string | null | undefined
): string | null {
  const preferred = String(preferredEventId ?? "").trim();
  if (preferred && accessibleEventIds.includes(preferred)) {
    return preferred;
  }
  return accessibleEventIds[0] ?? null;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
