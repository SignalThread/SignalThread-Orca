import { parseLeadTemperature, type LeadTemperature } from "@/lib/leads/temperature";
import {
  parseLeadWorkflowStatusFilter,
  workflowStatusLabel,
  type LeadWorkflowStatusFilter
} from "@/lib/exhibitor/workflows/workflow-lead-activity";

export type LeadRatingFilter = "5" | "4_plus" | "3_or_below" | "unrated";
/**
 * Canonical follow-up queue states. `awaiting` is intentionally composable
 * with a temperature filter (the account dashboard uses hot + awaiting),
 * while `due` is the account-wide open due-or-overdue queue.
 */
export type LeadFollowUpFilter = "open" | "overdue" | "today" | "this_week" | "none" | "awaiting" | "due";

export type LeadListFilters = {
  rating: LeadRatingFilter | null;
  temperature: LeadTemperature | null;
  followUp: LeadFollowUpFilter | null;
  workflowStatus: LeadWorkflowStatusFilter | null;
};

const RATING_FILTERS = new Set<LeadRatingFilter>(["5", "4_plus", "3_or_below", "unrated"]);
const FOLLOW_UP_FILTERS = new Set<LeadFollowUpFilter>(["open", "overdue", "today", "this_week", "none", "awaiting", "due"]);

export function parseLeadRatingFilter(value: unknown): LeadRatingFilter | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return RATING_FILTERS.has(normalized as LeadRatingFilter) ? (normalized as LeadRatingFilter) : null;
}

export function parseLeadFollowUpFilter(value: unknown): LeadFollowUpFilter | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return FOLLOW_UP_FILTERS.has(normalized as LeadFollowUpFilter)
    ? (normalized as LeadFollowUpFilter)
    : null;
}

export function parseLeadListFilters(params: {
  rating?: unknown;
  temperature?: unknown;
  followUp?: unknown;
  workflowStatus?: unknown;
}): LeadListFilters {
  return {
    rating: parseLeadRatingFilter(params.rating),
    temperature: parseLeadTemperature(params.temperature),
    followUp: parseLeadFollowUpFilter(params.followUp),
    workflowStatus: parseLeadWorkflowStatusFilter(params.workflowStatus)
  };
}

export function activeLeadFilterLabels(filters: LeadListFilters): string[] {
  const labels: string[] = [];
  if (filters.rating) labels.push(`Rating ${ratingFilterLabel(filters.rating)}`);
  if (filters.temperature) labels.push(`Temperature ${temperatureLabel(filters.temperature)}`);
  if (filters.followUp) labels.push(`Follow-up ${followUpFilterLabel(filters.followUp)}`);
  if (filters.workflowStatus) labels.push(workflowStatusLabel(filters.workflowStatus));
  return labels;
}

export function ratingFilterLabel(filter: LeadRatingFilter): string {
  switch (filter) {
    case "5":
      return "5 stars";
    case "4_plus":
      return "4+ stars";
    case "3_or_below":
      return "3 or below";
    case "unrated":
      return "Unrated";
  }
}

export function followUpFilterLabel(filter: LeadFollowUpFilter): string {
  switch (filter) {
    case "open":
      return "open";
    case "overdue":
      return "overdue";
    case "today":
      return "today";
    case "this_week":
      return "this week";
    case "none":
      return "no follow-up date";
    case "awaiting":
      return "awaiting action";
    case "due":
      return "due or overdue";
  }
}

export function temperatureLabel(value: LeadTemperature): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function todayYmd(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function weekEndYmd(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}
