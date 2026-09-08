import { parseLeadTemperature } from "@/lib/leads/temperature";

export type LeadBusinessRuleRow = {
  temperature?: unknown;
  status?: string | null;
  follow_up_date?: string | null;
  follow_up_at?: string | null;
  follow_up_completed_at?: string | null;
};

/** Canonical hot product definition. Legacy priority_score never overrides temperature. */
export function isHotLead(row: Pick<LeadBusinessRuleRow, "temperature">): boolean {
  return parseLeadTemperature(row.temperature) === "hot";
}

export function isLeadClosed(row: Pick<LeadBusinessRuleRow, "status">): boolean {
  return String(row.status ?? "new").trim().toLowerCase() === "closed";
}

export function isFollowUpCompleted(row: Pick<LeadBusinessRuleRow, "follow_up_completed_at">): boolean {
  return Boolean(String(row.follow_up_completed_at ?? "").trim());
}

export function hasScheduledFollowUp(row: Pick<LeadBusinessRuleRow, "follow_up_date" | "follow_up_at">): boolean {
  return Boolean(row.follow_up_date || row.follow_up_at);
}

export function isOpenFollowUp(row: LeadBusinessRuleRow): boolean {
  return !isLeadClosed(row) && !isFollowUpCompleted(row) && hasScheduledFollowUp(row);
}

export function isFollowUpDueToday(row: LeadBusinessRuleRow, todayYmd: string): boolean {
  return isOpenFollowUp(row) && row.follow_up_date === todayYmd;
}

export function isFollowUpOverdue(row: LeadBusinessRuleRow, todayYmd: string): boolean {
  return isOpenFollowUp(row) && Boolean(row.follow_up_date && row.follow_up_date < todayYmd);
}

export function isFollowUpScheduledFuture(row: LeadBusinessRuleRow, todayYmd: string): boolean {
  return isOpenFollowUp(row) && Boolean(row.follow_up_date && row.follow_up_date > todayYmd);
}

export function isHotAwaitingFollowUp(row: LeadBusinessRuleRow, todayYmd: string): boolean {
  if (!isHotLead(row) || isLeadClosed(row) || isFollowUpCompleted(row)) return false;
  if (!hasScheduledFollowUp(row)) return true;
  return Boolean(row.follow_up_date && row.follow_up_date <= todayYmd);
}

export type CanonicalFollowUpFilter = "open" | "overdue" | "today" | "this_week" | "none" | "awaiting" | "due";

function addDaysYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** PostgREST OR expression for event-specific calendar-day predicates. */
export function buildEventFollowUpCalendarOr(
  filter: Exclude<CanonicalFollowUpFilter, "none" | "open">,
  eventDays: ReadonlyMap<string, string>
): string {
  const clauses: string[] = [];
  if (filter === "awaiting") clauses.push("and(follow_up_date.is.null,follow_up_at.is.null)");
  for (const [eventId, todayYmd] of eventDays) {
    if (filter === "overdue") clauses.push(`and(event_id.eq.${eventId},follow_up_date.lt.${todayYmd})`);
    else if (filter === "today") clauses.push(`and(event_id.eq.${eventId},follow_up_date.eq.${todayYmd})`);
    else if (filter === "this_week") clauses.push(`and(event_id.eq.${eventId},follow_up_date.gte.${todayYmd},follow_up_date.lte.${addDaysYmd(todayYmd, 7)})`);
    else if (filter === "awaiting" || filter === "due") clauses.push(`and(event_id.eq.${eventId},follow_up_date.lte.${todayYmd})`);
  }
  return clauses.join(",");
}

/** Shared status/completion constraints for every actionable follow-up destination. */
export function applyCanonicalActionableFollowUpConstraints<T extends { neq: Function; is: Function }>(
  query: T
): T {
  return query.neq("status", "closed").is("follow_up_completed_at", null) as T;
}
