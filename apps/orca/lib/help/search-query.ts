export const HELP_SEARCH_MIN_SUGGESTION_LENGTH = 2;

export function normalizeHelpSearchQuery(raw: string | string[] | null | undefined): string {
  return (Array.isArray(raw) ? raw[0] : raw ?? "").trim().slice(0, 200);
}

export function getSearchTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? [])].filter((term) => term.length > 1);
}

export function getNextSuggestionIndex(
  current: number,
  key: "ArrowDown" | "ArrowUp" | "Home" | "End",
  count: number,
): number {
  if (count === 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return current < count - 1 ? current + 1 : 0;
  return current > 0 ? current - 1 : count - 1;
}
