/**
 * Pure copy + structure for company team event-access summaries (no DB).
 * Canonical access still comes from users.event_access_mode + event_users; this only formats UI.
 */

import type { EventAccessMode } from "@/lib/access/event-access-mode";

export type CompanyTeamEventAccessSummary = {
  kind: "all_company" | "specific" | "none";
  headline: string;
  /** Subline for table / tooltip (e.g. event count today). */
  subline: string | null;
  /** Short list for hover/detail; full list loaded separately if needed */
  previewNames: string[];
  specificCount: number;
};

export function buildCompanyTeamEventAccessSummary(input: {
  eventAccessMode: EventAccessMode;
  companyOwnedEventCount: number;
  assignedEvents: readonly { id: string; name: string }[];
}): CompanyTeamEventAccessSummary {
  const { eventAccessMode, companyOwnedEventCount, assignedEvents } = input;
  const n = assignedEvents.length;

  if (eventAccessMode === "all_company_events") {
    if (companyOwnedEventCount === 0) {
      return {
        kind: "all_company",
        headline: "All company events",
        subline: "No events yet — future company events included automatically",
        previewNames: [],
        specificCount: 0
      };
    }
    return {
      kind: "all_company",
      headline: "All company events",
      subline: `${companyOwnedEventCount} today — new company events included automatically`,
      previewNames: [],
      specificCount: 0
    };
  }

  if (n === 0) {
    return {
      kind: "none",
      headline: "No event access",
      subline: "Assign events or switch to all company events",
      previewNames: [],
      specificCount: 0
    };
  }

  const previewNames = assignedEvents.map((e) => e.name);
  return {
    kind: "specific",
    headline: `${n} specific event${n === 1 ? "" : "s"}`,
    subline: previewNames.slice(0, 3).join(" · ") + (n > 3 ? ` · +${n - 3} more` : ""),
    previewNames: previewNames.slice(0, 8),
    specificCount: n
  };
}

export function formatCompanyTeamEventAccessTooltip(summary: CompanyTeamEventAccessSummary): string {
  const parts = [summary.headline];
  if (summary.subline) parts.push(summary.subline);
  if (summary.kind === "specific" && summary.previewNames.length) {
    parts.push(summary.previewNames.join(", "));
  }
  return parts.join(" — ");
}
