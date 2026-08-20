/**
 * Pure, client-safe helpers for filtering budget rows by session and group and
 * for the session-total footer. Kept side-effect free so the grid and tests can
 * share one deterministic implementation (mirrors budget-category-filter.ts).
 */

export type SessionGroupFilterable = {
  matrixRowId: string | null;
  groupId: string | null;
};

export type MoneyRow = {
  forecastCents: number;
  actualCents: number;
};

export type SessionFooterTotal = {
  sessionIds: string[];
  rowCount: number;
  forecastCents: number;
  actualCents: number;
};

export type CategoryFooterTotal = {
  category: string;
  rowCount: number;
  forecastCents: number;
  actualCents: number;
  varianceCents: number;
};

/**
 * A row matches the session filter when no sessions are selected (filter off),
 * or when the row's linked session is in the selection. Rows with no session
 * are excluded whenever a session filter is active.
 */
export function lineItemMatchesSessionFilter(
  item: SessionGroupFilterable,
  selectedSessionIds: readonly string[],
): boolean {
  if (selectedSessionIds.length === 0) return true;
  if (!item.matrixRowId) return false;
  return selectedSessionIds.includes(item.matrixRowId);
}

/**
 * A row matches the group filter when no group is selected (filter off), or when
 * the row is assigned to the selected group. An empty/whitespace selection is
 * treated as "off".
 */
export function lineItemMatchesGroupFilter(
  item: SessionGroupFilterable,
  selectedGroupId: string | null,
): boolean {
  if (!selectedGroupId || selectedGroupId.trim() === "") return true;
  return item.groupId === selectedGroupId;
}

/** Sum forecast/actual cents and count across a row slice (footer/blocks). */
export function sumLineItemMoney(items: readonly MoneyRow[]): { forecastCents: number; actualCents: number; rowCount: number } {
  let forecastCents = 0;
  let actualCents = 0;
  for (const item of items) {
    forecastCents += item.forecastCents;
    actualCents += item.actualCents;
  }
  return { forecastCents, actualCents, rowCount: items.length };
}

/**
 * Build the sticky session-total footer for the currently selected sessions.
 * Sums only rows whose session is in the selection so the total reflects the
 * filtered view deterministically (no drift from a separate formula).
 */
export function computeSessionFooterTotal<T extends SessionGroupFilterable & MoneyRow>(
  items: readonly T[],
  selectedSessionIds: readonly string[],
): SessionFooterTotal {
  const sessionIds = [...new Set(selectedSessionIds.filter(Boolean))];
  if (sessionIds.length === 0) {
    return { sessionIds, rowCount: 0, forecastCents: 0, actualCents: 0 };
  }
  const matching = items.filter((item) => item.matrixRowId !== null && sessionIds.includes(item.matrixRowId));
  const totals = sumLineItemMoney(matching);
  return { sessionIds, ...totals };
}

/**
 * Build the category-total footer for the currently filtered table rows. The
 * input should be the active filtered dataset, so search/session/group/status
 * filters are reflected before the category total is derived.
 */
export function computeCategoryFooterTotal<T extends MoneyRow>(
  items: readonly T[],
  selectedCategory: string | null,
): CategoryFooterTotal | null {
  const category = selectedCategory?.trim() ?? "";
  if (!category) return null;

  const totals = sumLineItemMoney(items);
  return {
    category,
    ...totals,
    varianceCents: totals.actualCents - totals.forecastCents,
  };
}
