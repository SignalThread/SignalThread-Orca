/**
 * Canonical Leads Intelligence filter contract (single source of truth).
 * Dashboard, chips, URLs, and row filtering all use this model — no separate dashboard taxonomy.
 * Optional legacy `minPriority` / `followUpDue` are merged into `view` for backwards compatibility.
 */
import { scoreToPriorityLevel } from "@/lib/leads/priorityLevels";
import { parseLeadTemperature, type LeadTemperature } from "@/lib/leads/temperature";
import type { LeadFollowUpFilter } from "@/lib/leads/exhibitor-lead-list-filters";

export type LeadsIntelligenceView =
  | "all"
  | "hot"
  | "warm"
  | "cold"
  | "follow_up_due"
  | "follow_up_scheduled"
  | "priority_high"
  | "priority_medium"
  | "priority_low"
  | "priority_unscored"
  | "unrated";

const ALLOWED = new Set<string>([
  "all",
  "hot",
  "warm",
  "cold",
  "follow_up_due",
  "follow_up_scheduled",
  "priority_high",
  "priority_medium",
  "priority_low",
  "priority_unscored",
  "unrated"
]);

/** Short labels — same strings used for Leads Intelligence chips (where applicable). */
export const LEADS_INTELLIGENCE_VIEW_LABEL: Record<LeadsIntelligenceView, string> = {
  all: "All",
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
  follow_up_due: "Due",
  follow_up_scheduled: "Scheduled",
  priority_high: "High",
  priority_medium: "Medium",
  priority_low: "Low",
  priority_unscored: "Unscored",
  unrated: "Unrated"
};

export type LeadsTemperatureView = "all" | "hot" | "warm" | "cold";

/** Primary chip strip on Leads Intelligence list page (canonical temperature model only). */
export const LEADS_INTELLIGENCE_TABLE_CHIPS: { view: LeadsTemperatureView; testId: string }[] = [
  { view: "all", testId: "leads-filter-all" },
  { view: "hot", testId: "leads-filter-hot" },
  { view: "warm", testId: "leads-filter-warm" },
  { view: "cold", testId: "leads-filter-cold" }
];

export function parseLeadsIntelligenceView(raw: string | null | undefined): LeadsIntelligenceView {
  const v = raw?.trim().toLowerCase();
  if (v && ALLOWED.has(v)) return v as LeadsIntelligenceView;
  return "all";
}

export function parseLeadsTemperatureView(raw: string | null | undefined): LeadsTemperatureView {
  const v = raw?.trim().toLowerCase();
  if (v === "hot" || v === "warm" || v === "cold") return v;
  return "all";
}

export function firstSearchParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Merge legacy dashboard params into a single view. Prefer explicit `view` when present.
 */
export function mergeLegacyDrilldownParams(params: {
  view?: string | string[];
  minPriority?: string | string[];
  followUpDue?: string | string[];
}): LeadsIntelligenceView {
  const explicit = parseLeadsIntelligenceView(firstSearchParam(params.view));
  if (explicit !== "all") return explicit;

  if (firstSearchParam(params.followUpDue) === "1") return "follow_up_due";

  const mp = firstSearchParam(params.minPriority)?.trim();
  if (mp === "80" || mp === "90" || mp === "75") return "priority_high";
  if (mp === "50") return "priority_medium";
  if (mp === "25") return "priority_low";
  return "all";
}

export type LeadForIntelligenceFilter = {
  temperature?: string | null;
  priority_score: number;
  follow_up_date: string | null;
  rating: number;
  status?: "new" | "follow_up" | "closed";
};

function isLeadOpen(l: LeadForIntelligenceFilter): boolean {
  return (l.status ?? "new") !== "closed";
}

export function filterLeadsByTemperatureView<T extends LeadForIntelligenceFilter>(
  leads: T[],
  view: LeadsTemperatureView
): T[] {
  if (view === "all") return leads;
  return leads.filter((lead) => parseLeadTemperature(lead.temperature) === view);
}

/**
 * Single filter path for Leads Intelligence (table + any consumer of the same view).
 */
export function filterLeadsByIntelligenceView<T extends LeadForIntelligenceFilter>(
  leads: T[],
  view: LeadsIntelligenceView,
  opts: { todayYmd: string }
): T[] {
  const today = opts.todayYmd;

  return leads.filter((l) => {
    switch (view) {
      case "all":
        return true;
      case "hot": {
        const parsedTemperature = parseLeadTemperature(l.temperature);
        return parsedTemperature === "hot";
      }
      case "priority_high":
        return scoreToPriorityLevel(l.priority_score) === "high";
      case "priority_medium":
        return scoreToPriorityLevel(l.priority_score) === "medium";
      case "priority_low":
        return scoreToPriorityLevel(l.priority_score) === "low";
      case "priority_unscored":
        return scoreToPriorityLevel(l.priority_score) === "unscored";
      case "follow_up_due":
        if (!l.follow_up_date || !isLeadOpen(l)) return false;
        return l.follow_up_date <= today;
      case "follow_up_scheduled":
        if (!l.follow_up_date || !isLeadOpen(l)) return false;
        return true;
      case "unrated":
        return !l.rating || l.rating === 0;
    }
  });
}

export function buildExhibitorLeadsIntelligenceHref(opts: {
  eventId?: string;
  companyId?: string;
  view?: LeadsIntelligenceView;
  temperature?: LeadTemperature;
  followUp?: LeadFollowUpFilter;
  /** Uses the existing Leads Intelligence route across every event in the current access resolution. */
  accountScope?: boolean;
  q?: string;
}): string {
  const params = new URLSearchParams();
  if (opts.eventId) params.set("eventId", opts.eventId);
  if (opts.companyId) params.set("companyId", opts.companyId);
  if (opts.accountScope) params.set("accountScope", "1");
  if (opts.followUp) params.set("followUp", opts.followUp);
  if (opts.temperature) params.set("temperature", opts.temperature);
  if (opts.q?.trim()) params.set("q", opts.q.trim());
  if (opts.view && opts.view !== "all") params.set("view", opts.view);
  const qs = params.toString();
  return qs ? `/exhibitor/leads?${qs}` : "/exhibitor/leads";
}

export function buildExhibitorDashboardHref(opts: { eventId?: string }): string {
  if (!opts.eventId) return "/exhibitor/dashboard";
  return `/exhibitor/dashboard?${new URLSearchParams({ eventId: opts.eventId }).toString()}`;
}
