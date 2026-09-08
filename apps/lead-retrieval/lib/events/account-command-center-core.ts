/**
 * Pure derivation core for the account Command Center at /app/events.
 *
 * Everything here is deterministic and computed from real production state
 * (events, licenses/seats, pending invitations, users, recent leads). No AI,
 * no invented metrics. Inputs that failed to load arrive as null and stay
 * null — a failed query must never render as a fabricated zero.
 *
 * Lifecycle grouping/ordering stays in `lib/events/event-portfolio` (single
 * source of truth); this module consumes its groups.
 */

import {
  exhibitorOpenEventHref,
  eventPortfolioLifecycleForEvent,
  groupEventsForPortfolio,
  type EventPortfolioGroups
} from "@/lib/events/event-portfolio";
import {
  isContinuousCaptureContainerKind,
  normalizeEventContainerKind
} from "@/lib/events/event-container-kind";
import {
  exhibitorEventSettingsHref,
  EXHIBITOR_ACCOUNT_HREF
} from "@/lib/exhibitor/exhibitor-app-nav";
import { buildExhibitorLeadsIntelligenceHref } from "@/lib/leads/exhibitorLeadsDrilldown";
import { describeEventTiming } from "@/lib/events/event-lifecycle";
import type { DashboardEventLeadMetrics } from "@/lib/server/dashboard-event-lead-metrics";
import { resolveEventLocation } from "@/lib/events/event-location";

/* ================================ Inputs ================================ */

export type AccountEventRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  container_kind: string | null;
  city: string | null;
  state: string | null;
  location?: string | null;
  timezone?: string | null;
  created_at: string | null;
  briefing_strategy?: unknown;
};

export type AccountLicenseRow = { id: string; seats_total: number | null; seats_used: number | null };
export type AccountPendingInviteRow = { email: string; created_at: string | null };
export type AccountUserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string | null;
};
export type AccountRecentLeadRow = {
  id: string;
  event_id: string | null;
  created_at: string | null;
};
export type PortfolioEventCard = {
  event: AccountEventRow;
  lifecycle: "live" | "upcoming" | "completed" | "unknown";
  timing: string | null;
  location: string | null;
  readinessPercent: number | null;
  leadsToday: number | null;
  totalLeads: number | null;
  hotAwaitingFollowUp: number | null;
  openFollowUps: number | null;
  /** There is no canonical pipeline-value field in the lead schema yet. */
  pipelineValue: number | null;
  nextAction: { label: string; href: string } | null;
  playbook: string | null;
};

function strategyLabel(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  for (const key of ["eventGoal", "productFocus", "targetBuyerPersona"]) {
    const label = typeof row[key] === "string" ? row[key].trim() : "";
    if (label) return label;
  }
  return null;
}

/**
 * Canonical account-level lifecycle mapping.  The account page and All Events
 * table consume this same phase-specific data, while lifecycle membership
 * continues to come from `groupEventsForPortfolio` / `resolveEventLifecycle`.
 */
export function deriveLifecycleEventCards(input: {
  events: readonly AccountEventRow[];
  metricsByEvent: ReadonlyMap<string, DashboardEventLeadMetrics> | null;
  setupItems: readonly AccountSetupItem[];
  todayYmd: string;
  todayByEvent: ReadonlyMap<string, string>;
  readinessByEvent?: ReadonlyMap<string, number | null>;
}): Record<"live" | "upcoming" | "completed" | "unknown", PortfolioEventCard[]> {
  const groups = groupEventsForPortfolio(input.events, input.todayYmd, input.todayByEvent);
  const build = (event: AccountEventRow): PortfolioEventCard => {
    const lifecycle = eventPortfolioLifecycleForEvent(event, input.todayYmd, input.todayByEvent);
    const eventToday = input.todayByEvent.get(event.id) ?? null;
    const metrics = input.metricsByEvent?.get(event.id) ?? null;
    const setup = input.setupItems.find((item) => item.eventId === event.id) ?? null;
    return {
      event,
      lifecycle,
      timing: lifecycle === "unknown" || !eventToday ? null : describeEventTiming(event, eventToday, lifecycle),
      location: resolveEventLocation(event.city, event.state, event.location),
      readinessPercent: input.readinessByEvent?.get(event.id) ?? null,
      leadsToday: metrics?.leadsToday ?? null,
      totalLeads: metrics?.totalLeads ?? null,
      hotAwaitingFollowUp: metrics?.hotAwaitingFollowUp ?? null,
      openFollowUps: metrics?.openFollowUps ?? null,
      pipelineValue: null,
      nextAction: setup ? { label: setup.actionLabel, href: setup.href } : null,
      playbook: strategyLabel(event.briefing_strategy)
    };
  };
  const orderLive = (cards: PortfolioEventCard[]) =>
    [...cards].sort(
      (a, b) =>
        (b.hotAwaitingFollowUp ?? -1) - (a.hotAwaitingFollowUp ?? -1) ||
        (b.leadsToday ?? -1) - (a.leadsToday ?? -1) ||
        a.event.name.localeCompare(b.event.name) ||
        a.event.id.localeCompare(b.event.id)
    );
  return {
    live: orderLive(groups.live.map(build)),
    upcoming: groups.upcoming.map(build),
    completed: groups.completed.map(build),
    unknown: groups.unknown.map(build)
  };
}

/** Backwards-compatible flattened order for existing callers. */
export function deriveFeaturedPortfolioCards(input: Parameters<typeof deriveLifecycleEventCards>[0]): PortfolioEventCard[] {
  const groups = deriveLifecycleEventCards(input);
  return [...groups.live, ...groups.upcoming, ...groups.completed, ...groups.unknown];
}

export type AccountEventsFilter = "all" | "live" | "upcoming" | "wrapped";

/** Shared filtering contract for the account All Events view. */
export function filterLifecycleEventCards(
  groups: Record<"live" | "upcoming" | "completed" | "unknown", readonly PortfolioEventCard[]>,
  input: { lifecycle: AccountEventsFilter; search: string }
) {
  const normalized = input.search.trim().toLocaleLowerCase();
  const matches = (card: PortfolioEventCard) => {
    if (!normalized) return true;
    return [card.event.name, card.location, card.playbook]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase().includes(normalized));
  };
  const selected = (key: "live" | "upcoming" | "completed") =>
    input.lifecycle === "all" || input.lifecycle === (key === "completed" ? "wrapped" : key);
  return {
    live: selected("live") ? groups.live.filter(matches) : [],
    upcoming: selected("upcoming") ? groups.upcoming.filter(matches) : [],
    completed: selected("completed") ? groups.completed.filter(matches) : [],
    unknown: input.lifecycle === "all" ? groups.unknown.filter(matches) : []
  };
}

/* ============================== Setup items ============================== */

export type AccountSetupItemSeverity = "blocker" | "attention";

export type AccountSetupItem = {
  key: string;
  label: string;
  detail: string;
  /** Short verb label for compact controls (e.g. the hero's secondary button). */
  actionLabel: string;
  severity: AccountSetupItemSeverity;
  /** Null for account-level items (invitations, seats, licenses). */
  eventId: string | null;
  href: string;
};

function isCc(event: AccountEventRow): boolean {
  return isContinuousCaptureContainerKind(normalizeEventContainerKind(event.container_kind));
}

/**
 * System-defined v1 setup items, derived from stored state only:
 * - live/upcoming events missing dates or location → complete event details
 * - unaccepted invitations → follow up in account settings
 * - all seats consumed / no active license → account settings
 * Order: blockers first, then attention; stable by key within severity.
 */
export function deriveAccountSetupItems(input: {
  events: readonly AccountEventRow[];
  /** Compatibility fallback; configured events use their event-local day. */
  todayYmd: string;
  todayByEvent?: ReadonlyMap<string, string>;
  /** Null when the invites query failed (item omitted rather than guessed). */
  pendingInviteCount: number | null;
  /** Null when the licenses query failed. */
  licenses: readonly AccountLicenseRow[] | null;
}): AccountSetupItem[] {
  const items: AccountSetupItem[] = [];
  const groups = groupEventsForPortfolio(input.events, input.todayYmd, input.todayByEvent);

  const detailItems = (events: readonly AccountEventRow[], live: boolean) => {
    for (const event of events) {
      if (isCc(event)) continue;
      const missingDates = !event.start_date && !event.end_date;
      const missingLocation = !event.city && !event.state;
      if (!missingDates && !missingLocation) continue;
      const missing =
        missingDates && missingLocation
          ? "Dates and location are not set."
          : missingDates
            ? "Dates are not set."
            : "Location is not set.";
      items.push({
        key: `event-details:${event.id}`,
        label: `Complete details for ${event.name}`,
        detail: missing,
        actionLabel: "Complete details",
        severity: live ? "blocker" : "attention",
        eventId: event.id,
        href: exhibitorEventSettingsHref(event.id)
      });
    }
  };
  detailItems(groups.live, true);
  detailItems(groups.upcoming, false);

  if (input.pendingInviteCount !== null && input.pendingInviteCount > 0) {
    const n = input.pendingInviteCount;
    items.push({
      key: "pending-invites",
      label: `${n} invitation${n === 1 ? "" : "s"} awaiting acceptance`,
      detail: "Invited teammates haven't joined yet — resend or review from account settings.",
      actionLabel: "Manage team",
      severity: "attention",
      eventId: null,
      href: EXHIBITOR_ACCOUNT_HREF
    });
  }

  if (input.licenses !== null) {
    if (input.licenses.length === 0) {
      items.push({
        key: "no-active-license",
        label: "No active license on this account",
        detail: "App seats and event creation depend on an active license.",
        actionLabel: "Manage licenses",
        severity: "blocker",
        eventId: null,
        href: EXHIBITOR_ACCOUNT_HREF
      });
    } else {
      const seats = summarizeSeats(input.licenses);
      if (seats.total > 0 && seats.used >= seats.total) {
        items.push({
          key: "seats-exhausted",
          label: "All app seats are in use",
          detail: `${seats.used} of ${seats.total} seats consumed — free a seat before inviting more teammates.`,
          actionLabel: "Manage licenses",
          severity: "blocker",
          eventId: null,
          href: EXHIBITOR_ACCOUNT_HREF
        });
      }
    }
  }

  const rank = (s: AccountSetupItemSeverity) => (s === "blocker" ? 0 : 1);
  return [...items].sort(
    (a, b) => rank(a.severity) - rank(b.severity) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

/* ============================== Seats / KPIs ============================== */

export type SeatSummary = { used: number; total: number };

export function summarizeSeats(licenses: readonly AccountLicenseRow[]): SeatSummary {
  let used = 0;
  let total = 0;
  for (const l of licenses) {
    used += Math.max(0, Number(l.seats_used ?? 0));
    total += Math.max(0, Number(l.seats_total ?? 0));
  }
  return { used, total };
}

export type AccountKpis = {
  events: number;
  setupItemsOpen: number;
  /** Null when the licenses query failed — render "—", never a fabricated 0. */
  seats: SeatSummary | null;
  /** Null when the licenses query failed. */
  activeLicenses: number | null;
};

export function computeAccountKpis(input: {
  events: readonly AccountEventRow[];
  setupItems: readonly AccountSetupItem[];
  licenses: readonly AccountLicenseRow[] | null;
}): AccountKpis {
  return {
    events: input.events.length,
    setupItemsOpen: input.setupItems.length,
    seats: input.licenses ? summarizeSeats(input.licenses) : null,
    activeLicenses: input.licenses ? input.licenses.length : null
  };
}

/* ======================= Cross-event follow-up status ======================= */

/**
 * Independently counted canonical lead states across the caller's accessible
 * events. Counts deliberately may overlap: a hot lead due today is part of
 * both the hot-awaiting and due-today states.
 */
export type AccountFollowUpStatus = {
  /** Open follow-ups due today or overdue; used as the dominant queue count. */
  outstanding: number | null;
  hotAwaitingFollowUp: number | null;
  dueToday: number | null;
  overdue: number | null;
  hrefs: {
    hotAwaitingFollowUp: string;
    dueToday: string;
    overdue: string;
    allFollowUps: string;
  };
};

/**
 * Presentation-ready account follow-up state. The page supplies independent
 * count-query results, each already constrained by company + accessible event
 * ids. Null remains unavailable rather than becoming a fabricated zero.
 */
export function deriveAccountFollowUpStatus(input: {
  outstanding: number | null;
  hotAwaitingFollowUp: number | null;
  dueToday: number | null;
  overdue: number | null;
}): AccountFollowUpStatus {
  const accountScope = true;
  return {
    outstanding: input.outstanding,
    hotAwaitingFollowUp: input.hotAwaitingFollowUp,
    dueToday: input.dueToday,
    overdue: input.overdue,
    hrefs: {
      hotAwaitingFollowUp: buildExhibitorLeadsIntelligenceHref({
        accountScope,
        temperature: "hot",
        followUp: "awaiting"
      }),
      dueToday: buildExhibitorLeadsIntelligenceHref({ accountScope, followUp: "today" }),
      overdue: buildExhibitorLeadsIntelligenceHref({ accountScope, followUp: "overdue" }),
      allFollowUps: buildExhibitorLeadsIntelligenceHref({ accountScope, followUp: "due" })
    }
  };
}

/* ============================ What matters now ============================ */

export type WhatMattersNow = {
  kind: "live" | "upcoming" | "wrapped";
  eventId: string;
  title: string;
  sub: string;
  /** Primary action always opens the focus event. */
  openHref: string;
  /** Optional second action from the top real blocker (or create-event when idle). */
  secondary: { label: string; href: string } | null;
};

/** Whole-day difference between two YYYY-MM-DD strings (b - a). */
function daysBetweenYmd(a: string, b: string): number {
  const toUtc = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map((v) => Number(v));
    return Date.UTC(y, (m || 1) - 1, d || 1);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/**
 * Deterministic focus selection: first live event (groups order = ending
 * soonest), else nearest upcoming, else most recently completed ("wrapped").
 *
 * Headline rule: when a real setup/team blocker exists it IS the headline
 * ("Complete setup for {event}"), with event timing as supporting context —
 * a distant opening date must never outrank a real blocker. With no blocker,
 * the timing is the headline.
 */
export function selectWhatMattersNow(input: {
  groups: EventPortfolioGroups<AccountEventRow>;
  setupItems: readonly AccountSetupItem[];
  todayYmd: string;
  todayByEvent?: ReadonlyMap<string, string>;
  createEventHref: string | null;
}): WhatMattersNow | null {
  const { groups, setupItems } = input;

  const blockerFor = (eventId: string): AccountSetupItem | null =>
    setupItems.find((i) => i.eventId === eventId) ??
    setupItems.find((i) => i.eventId === null) ??
    null;

  const secondaryFrom = (item: AccountSetupItem | null): WhatMattersNow["secondary"] =>
    item ? { label: item.actionLabel, href: item.href } : null;

  /** "Live now" / "Opens today" / "Opens tomorrow" / "Opens in N days" / "No start date yet". */
  const timingPhrase = (event: AccountEventRow, isLive: boolean): string => {
    if (isLive) return "Live now";
    if (!event.start_date) return "No start date yet";
    const days = daysBetweenYmd(input.todayByEvent?.get(event.id) ?? input.todayYmd, event.start_date);
    if (days <= 0) return "Opens today";
    if (days === 1) return "Opens tomorrow";
    return `Opens in ${days} days`;
  };

  const focused = (
    kind: "live" | "upcoming",
    event: AccountEventRow,
    noBlockerSub: string
  ): WhatMattersNow => {
    const blocker = blockerFor(event.id);
    const timing = timingPhrase(event, kind === "live");
    if (blocker) {
      // Event-scoped blockers name the event in the headline; account-level
      // blockers keep their own label and name the event in the support line.
      const eventScoped = blocker.eventId === event.id;
      return {
        kind,
        eventId: event.id,
        title: eventScoped ? `Complete details for ${event.name}` : blocker.label,
        sub: eventScoped
          ? `${timing} · ${blocker.detail}`
          : `${event.name}: ${timing.toLowerCase()} · ${blocker.detail}`,
        openHref: exhibitorOpenEventHref(event.id),
        secondary: secondaryFrom(blocker)
      };
    }
    const timingTitle =
      kind === "live"
        ? `${event.name} is live now`
        : event.start_date
          ? `${event.name} ${timing.charAt(0).toLowerCase()}${timing.slice(1)}`
          : `${event.name} has no start date yet`;
    return {
      kind,
      eventId: event.id,
      title: timingTitle,
      sub: noBlockerSub,
      openHref: exhibitorOpenEventHref(event.id),
      secondary: null
    };
  };

  const live = groups.live[0];
  if (live) {
    return focused("live", live, "Your team is capturing leads. Open the event to work the floor.");
  }

  const upcoming = groups.upcoming[0];
  if (upcoming) {
    return focused("upcoming", upcoming, "Setup looks complete. Review the event before doors open.");
  }

  const unconfigured = groups.unknown[0];
  if (unconfigured) {
    return {
      kind: "upcoming",
      eventId: unconfigured.id,
      title: `Set a timezone for ${unconfigured.name}`,
      sub: "Calendar metrics and lifecycle are unavailable until the event timezone is configured.",
      openHref: exhibitorOpenEventHref(unconfigured.id),
      secondary: { label: "Event settings", href: exhibitorEventSettingsHref(unconfigured.id) }
    };
  }

  const wrapped = groups.completed[0];
  if (wrapped) {
    return {
      kind: "wrapped",
      eventId: wrapped.id,
      title: "All events have wrapped",
      sub: `${wrapped.name} was your most recent event. Review its leads, or set up the next one.`,
      openHref: exhibitorOpenEventHref(wrapped.id),
      secondary: input.createEventHref ? { label: "Create event", href: input.createEventHref } : null
    };
  }

  return null;
}

/* ========================== Recommended next steps ========================== */

export type RecommendedStep = AccountSetupItem;

/** Rule-based: recommendations are exactly the top open setup items, capped. */
export function buildRecommendedNextSteps(
  setupItems: readonly AccountSetupItem[],
  max = 4
): RecommendedStep[] {
  return setupItems.slice(0, max);
}

/* ============================== Team readiness ============================== */

export type TeamReadiness = {
  activeCount: number;
  pendingCount: number;
  seats: SeatSummary | null;
  seatsAvailable: number | null;
  members: { name: string; email: string | null }[];
  pending: { email: string }[];
};

export function summarizeTeamReadiness(input: {
  users: readonly AccountUserRow[] | null;
  pendingInvites: readonly AccountPendingInviteRow[] | null;
  licenses: readonly AccountLicenseRow[] | null;
  maxRows?: number;
}): TeamReadiness | null {
  if (input.users === null && input.pendingInvites === null) return null;
  const maxRows = input.maxRows ?? 4;
  const users = input.users ?? [];
  const pending = input.pendingInvites ?? [];
  const seats = input.licenses ? summarizeSeats(input.licenses) : null;
  return {
    activeCount: users.length,
    pendingCount: pending.length,
    seats,
    seatsAvailable: seats ? Math.max(0, seats.total - seats.used) : null,
    members: users.slice(0, maxRows).map((u) => ({
      name: String(u.full_name ?? "").trim() || String(u.email ?? "").trim() || "Teammate",
      email: u.email
    })),
    pending: pending.slice(0, maxRows).map((p) => ({ email: p.email }))
  };
}

/* ============================== Portfolio themes ============================== */

export type ThemeLeadRow = {
  event_id: string | null;
  company_text: string | null;
  job_title: string | null;
  enriched_job_title: string | null;
  industry: string | null;
  enriched_industry: string | null;
  seniority: string | null;
  enriched_seniority: string | null;
  intent_signals: unknown;
};

export type PortfolioThemeCategory = "Signal" | "Industry" | "Seniority" | "Role" | "Company";

/**
 * Hard cap on the theme/activity lead sample: the page queries at most this
 * many of the newest accessible-event leads. Every derived theme count and
 * the on-page context line are bounded by (and honest about) this sample —
 * no claim of complete historical coverage is ever made.
 */
export const PORTFOLIO_THEME_SAMPLE_LIMIT = 500;

export type PortfolioTheme = {
  key: string;
  label: string;
  category: PortfolioThemeCategory;
  count: number;
  /** Bar width relative to the top theme (0–100). Display proportion only — not a rate or trend. */
  barPct: number;
};

const THEME_EXCLUDED_VALUES = new Set([
  "unknown",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "-",
  "--",
  "other",
  "test",
  "tbd"
]);

/** Trim/collapse whitespace; reject blanks, junk placeholders, and letterless strings. */
function cleanThemeValue(value: unknown): string | null {
  const raw = String(value ?? "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (raw.length < 2) return null;
  if (!/[a-z]/i.test(raw)) return null;
  if (THEME_EXCLUDED_VALUES.has(raw.toLowerCase())) return null;
  return raw;
}

/** Minor words that stay lowercase mid-phrase (e.g. "Head of Function"). */
const THEME_MINOR_WORDS = new Set([
  "of",
  "the",
  "and",
  "or",
  "for",
  "to",
  "in",
  "on",
  "at",
  "by",
  "vs",
  "a",
  "an",
  "with",
  "from",
  "per"
]);

/**
 * Presentable casing that reads naturally: minor connector words stay lowercase
 * mid-phrase, plain lowercase words capitalize, long ALL-CAPS words title-case,
 * and acronyms / already-mixed-case proper nouns are preserved as-is.
 */
function presentThemeLabel(value: string): string {
  return value
    .split(" ")
    .map((word, index) => {
      if (word.length === 0) return word;
      const lower = word.toLowerCase();
      if (index > 0 && word === lower && THEME_MINOR_WORDS.has(lower)) return lower;
      if (word === lower) return word.charAt(0).toUpperCase() + word.slice(1);
      if (word === word.toUpperCase() && word.length > 4) {
        return word.charAt(0) + word.slice(1).toLowerCase();
      }
      return word;
    })
    .join(" ");
}

/**
 * Title-case a human name for display. Normalizes all-lower / all-upper tokens
 * (and hyphen/apostrophe segments) to "First Last"; leaves already-mixed-case
 * tokens (McDonald, O'Neil) untouched. Never used to expose an email as a name.
 */
export function titleCasePersonName(raw: string): string {
  return String(raw ?? "")
    .trim()
    .split(/\s+/)
    .map((token) => {
      if (!token) return token;
      if (token !== token.toLowerCase() && token !== token.toUpperCase()) return token;
      return token
        .split(/([-'’])/)
        .map((seg) => (/[a-z]/i.test(seg) ? seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase() : seg))
        .join("");
    })
    .join(" ");
}

const SENIORITY_TITLE_RULES: readonly [RegExp, string][] = [
  [/\bchief\b|\bc[eotfmi]o\b/i, "C-level"],
  [/\bfounder\b|\bco-founder\b/i, "Founder"],
  [/\bvice president\b|\bvp\b/i, "VP"],
  [/\bdirector\b/i, "Director"],
  [/\bhead of\b/i, "Head of function"],
  [/\bmanager\b/i, "Manager"]
];

const ROLE_TITLE_RULES: readonly [RegExp, string][] = [
  [/engineer|developer|software|technical/i, "Engineering"],
  [/marketing|demand gen|growth/i, "Marketing"],
  [/sales|account executive|business development/i, "Sales"],
  [/\bevent\b|\bevents\b|meeting|trade show|conference/i, "Events"],
  [/product/i, "Product"],
  [/operations|\bops\b/i, "Operations"]
];

function firstRuleMatch(rules: readonly [RegExp, string][], value: string): string | null {
  for (const [pattern, label] of rules) {
    if (pattern.test(value)) return label;
  }
  return null;
}

const THEME_CATEGORY_PRIORITY: Record<PortfolioThemeCategory, number> = {
  Signal: 0,
  Industry: 1,
  Seniority: 2,
  Role: 3,
  Company: 4
};

export type PortfolioThemesResult = {
  themes: PortfolioTheme[];
  /** Leads actually included in this derivation (the bounded query sample). */
  sampleSize: number;
};

/**
 * Deterministic portfolio patterns from real lead fields only, strongest first:
 * stored intent signals, enriched industry/seniority (with raw fallbacks),
 * job-title role/seniority patterns, and company names. A theme needs at
 * least 2 leads; at most 2 themes per category; top `max` overall. Null input
 * (query failed) stays null; too little data returns empty themes for the
 * empty state. `sampleSize` reports the real bounded sample so the UI can
 * state exactly what the patterns were derived from.
 */
export function deriveLeadThemes(
  leads: readonly ThemeLeadRow[] | null,
  options?: { max?: number; minLeads?: number; minCount?: number; perCategory?: number }
): PortfolioThemesResult | null {
  if (leads === null) return null;
  const max = options?.max ?? 6;
  const minLeads = options?.minLeads ?? 5;
  const minCount = options?.minCount ?? 2;
  const perCategory = options?.perCategory ?? 2;
  const sampleSize = leads.length;
  if (leads.length < minLeads) return { themes: [], sampleSize };

  const buckets = new Map<string, PortfolioTheme>();
  const add = (category: PortfolioThemeCategory, rawLabel: string | null) => {
    if (!rawLabel) return;
    const label = presentThemeLabel(rawLabel);
    const key = `${category}:${label.toLowerCase()}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      buckets.set(key, { key, label, category, count: 1, barPct: 0 });
    }
  };

  for (const lead of leads) {
    const signals = Array.isArray(lead.intent_signals) ? lead.intent_signals : [];
    const seenSignals = new Set<string>();
    for (const signal of signals) {
      const cleaned = cleanThemeValue(signal);
      if (!cleaned || seenSignals.has(cleaned.toLowerCase())) continue;
      seenSignals.add(cleaned.toLowerCase());
      add("Signal", cleaned);
    }

    add("Industry", cleanThemeValue(lead.enriched_industry ?? lead.industry));

    const storedSeniority = cleanThemeValue(lead.enriched_seniority ?? lead.seniority);
    const title = cleanThemeValue(lead.enriched_job_title ?? lead.job_title);
    add("Seniority", storedSeniority ?? (title ? firstRuleMatch(SENIORITY_TITLE_RULES, title) : null));
    if (title) add("Role", firstRuleMatch(ROLE_TITLE_RULES, title));

    add("Company", cleanThemeValue(lead.company_text));
  }

  const ranked = [...buckets.values()]
    .filter((theme) => theme.count >= minCount)
    .sort(
      (a, b) =>
        b.count - a.count ||
        THEME_CATEGORY_PRIORITY[a.category] - THEME_CATEGORY_PRIORITY[b.category] ||
        (a.label < b.label ? -1 : a.label > b.label ? 1 : 0)
    );

  const perCategoryCount = new Map<PortfolioThemeCategory, number>();
  const selected: PortfolioTheme[] = [];
  for (const theme of ranked) {
    if (selected.length >= max) break;
    const used = perCategoryCount.get(theme.category) ?? 0;
    if (used >= perCategory) continue;
    perCategoryCount.set(theme.category, used + 1);
    selected.push(theme);
  }

  const top = selected[0]?.count ?? 0;
  return {
    sampleSize,
    themes: selected.map((theme) => ({
      ...theme,
      barPct: top > 0 ? Math.max(4, Math.round((theme.count / top) * 100)) : 0
    }))
  };
}

/* ============================== Recent activity ============================== */

export type AccountActivityEntry = {
  key: string;
  kind: "event_created" | "invite_sent" | "user_joined" | "lead_captured";
  label: string;
  /** ISO timestamp used for ordering; display formatting is the view's concern. */
  at: string;
};

/**
 * Restrained feed derived only from real timestamps (no activity system
 * exists in the schema). Human-readable labels, no raw ids or ISO strings;
 * duplicate invitations to the same email collapse to the latest one.
 * Sources that failed to load are skipped; if every source failed, returns
 * null so the section renders as unavailable.
 */
export function deriveRecentActivity(input: {
  events: readonly AccountEventRow[] | null;
  invites: readonly AccountPendingInviteRow[] | null;
  users: readonly AccountUserRow[] | null;
  leads: readonly AccountRecentLeadRow[] | null;
  limit?: number;
}): AccountActivityEntry[] | null {
  if (
    input.events === null &&
    input.invites === null &&
    input.users === null &&
    input.leads === null
  ) {
    return null;
  }
  const limit = input.limit ?? 6;
  const entries: AccountActivityEntry[] = [];
  const eventNameById = new Map((input.events ?? []).map((e) => [e.id, e.name] as const));

  for (const e of input.events ?? []) {
    if (!e.created_at) continue;
    entries.push({
      key: `event:${e.id}`,
      kind: "event_created",
      label: `${e.name} was created`,
      at: e.created_at
    });
  }

  // One entry per invited email — resent codes collapse to the latest send.
  const latestInviteByEmail = new Map<string, string>();
  for (const i of input.invites ?? []) {
    if (!i.created_at) continue;
    const email = String(i.email ?? "").trim().toLowerCase();
    if (!email) continue;
    const prev = latestInviteByEmail.get(email);
    if (!prev || Date.parse(i.created_at) > Date.parse(prev)) {
      latestInviteByEmail.set(email, i.created_at);
    }
  }
  for (const [email, at] of latestInviteByEmail) {
    entries.push({
      key: `invite:${email}`,
      kind: "invite_sent",
      label: `Invitation sent to ${email}`,
      at
    });
  }

  for (const u of input.users ?? []) {
    if (!u.created_at) continue;
    // Actor is a person, never an email. With no usable name, stay neutral.
    const rawName = String(u.full_name ?? "").trim();
    const label = rawName
      ? `${titleCasePersonName(rawName)} joined the team`
      : "A team member joined the team";
    entries.push({ key: `user:${u.id}`, kind: "user_joined", label, at: u.created_at });
  }

  // Lead captures aggregate per (event, UTC calendar day) so a busy day is one
  // honest row ("4 new leads captured at X") instead of dominating the feed.
  // Different events and different days are never combined.
  const captureGroups = new Map<string, { count: number; latestAt: string; eventId: string | null }>();
  for (const l of input.leads ?? []) {
    if (!l.created_at) continue;
    const day = l.created_at.slice(0, 10);
    const groupKey = `${l.event_id ?? "none"}:${day}`;
    const group = captureGroups.get(groupKey);
    if (group) {
      group.count += 1;
      if (Date.parse(l.created_at) > Date.parse(group.latestAt)) group.latestAt = l.created_at;
    } else {
      captureGroups.set(groupKey, { count: 1, latestAt: l.created_at, eventId: l.event_id ?? null });
    }
  }
  for (const [groupKey, group] of captureGroups) {
    const eventName = group.eventId ? eventNameById.get(group.eventId) : undefined;
    const atEvent = eventName ? ` at ${eventName}` : "";
    entries.push({
      key: `lead:${groupKey}`,
      kind: "lead_captured",
      label:
        group.count === 1
          ? `New lead captured${atEvent}`
          : `${group.count} new leads captured${atEvent}`,
      at: group.latestAt
    });
  }

  return entries
    .sort((a, b) => {
      const ta = Date.parse(a.at);
      const tb = Date.parse(b.at);
      if (tb !== ta) return tb - ta;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    })
    .slice(0, limit);
}
