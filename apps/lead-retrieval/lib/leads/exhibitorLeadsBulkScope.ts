/**
 * Single source of truth for Leads Intelligence bulk actions (exhibitor table).
 *
 * Precedence: **explicit checkbox selection overrides temperature filter scope.**
 * When no rows are manually selected, a non-"all" temperature chip defines scope as all
 * currently visible (sorted) lead ids in that filter.
 */
import type { LeadsTemperatureView } from "@/lib/leads/exhibitorLeadsDrilldown";

export type ExhibitorLeadsBulkScopeMode = "none" | "manual" | "filter";

export type ExhibitorLeadsBulkScope = {
  mode: ExhibitorLeadsBulkScopeMode;
  leadIds: string[];
};

export function computeExhibitorLeadsBulkScope(input: {
  selectedLeadIds: Set<string> | readonly string[];
  loadedLeadIds: Set<string>;
  temperatureView: LeadsTemperatureView;
  sortedVisibleLeadIds: string[];
}): ExhibitorLeadsBulkScope {
  const selected = [...input.selectedLeadIds].filter((id) => input.loadedLeadIds.has(id));
  if (selected.length > 0) {
    return { mode: "manual", leadIds: selected };
  }
  if (input.temperatureView !== "all" && input.sortedVisibleLeadIds.length > 0) {
    return { mode: "filter", leadIds: input.sortedVisibleLeadIds };
  }
  return { mode: "none", leadIds: [] };
}
