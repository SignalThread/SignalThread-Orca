/**
 * Exhibitor surfaces may resolve under `/exhibitor/*` or `/app/exhibitor/*` (resolver / legacy).
 * Prefer UI state (headings, filter chips via `data-testid` e.g. `leads-filter-hot`) over `view=` query params for filter assertions.
 */
export const EXHIBITOR_LEADS_PATH_RE = /\/(app\/)?exhibitor\/leads/;

/** Any authenticated exhibitor shell (dashboard, leads, etc.). */
export const EXHIBITOR_ZONE_RE = /\/(app\/)?exhibitor/;

export function expectExhibitorLeadsPath(url: string): boolean {
  return EXHIBITOR_LEADS_PATH_RE.test(url);
}
