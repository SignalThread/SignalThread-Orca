/**
 * Pure, client-safe math for the Budget grid's global optimistic totals under
 * server-side pagination. Kept side-effect free (no React/Prisma) so the grid and
 * tests share one deterministic implementation, mirroring budget-category-filter
 * and budget-session-group-filter.
 *
 * The core rule this enforces: global/header totals are the server-authoritative
 * committed totals over the FULL budget, adjusted by the deltas of touched rows —
 * never a reduce over the currently loaded page. A dirty row that has paged or
 * filtered away still moves the header totals because its committed base is held
 * in the overlay, not read back from the loaded rows.
 */
import { calculateBudgetTotalsFromSums } from "@/lib/budget-money";

export type BudgetTotals = {
  totalForecastCents: number;
  totalActualCents: number;
  varianceCents: number;
  percentUnder: number;
};

/** The committed (pre-edit) forecast/actual a dirty row's delta is measured from. */
export type OverlayCommittedBase = {
  committedForecastCents: number;
  committedActualCents: number;
};

/** A draft's raw amount inputs (unparsed strings from the row's edit fields). */
export type AmountDraftInput = {
  forecast: string;
  actual: string;
};

// Mirror of the grid's finalizeBudgetTotals: derive variance/percentUnder from
// forecast/actual sums. Duplicated here (4 lines) to keep this a dependency-free
// pure module; both paths must produce identical results.
export function finalizeOverlayTotals(totalForecastCents: number, totalActualCents: number): BudgetTotals {
  return calculateBudgetTotalsFromSums(totalForecastCents, totalActualCents);
}

/**
 * Global optimistic totals = server-authoritative committed totals + the deltas of
 * every dirty row. Each dirty row contributes a delta only for an amount field
 * whose draft parses to a value (an empty/invalid draft field is a zero delta, so
 * the committed value stands). Cost is O(dirty rows), never O(all rows).
 *
 * `parse` is injected (the grid's parseCurrencyToCents) so this module stays free
 * of currency-parsing details while sharing the grid's exact parsing behavior.
 */
export function computeOverlayTotals(
  serverCommittedTotals: { totalForecastCents: number; totalActualCents: number },
  overlay: Record<string, OverlayCommittedBase>,
  amountDrafts: Record<string, AmountDraftInput | undefined>,
  parse: (value: string) => number | null,
): BudgetTotals {
  let totalForecastCents = serverCommittedTotals.totalForecastCents;
  let totalActualCents = serverCommittedTotals.totalActualCents;
  for (const [id, entry] of Object.entries(overlay)) {
    const draft = amountDrafts[id];
    if (!draft) continue;
    const draftForecast = parse(draft.forecast);
    const draftActual = parse(draft.actual);
    if (draftForecast !== null) totalForecastCents += draftForecast - entry.committedForecastCents;
    if (draftActual !== null) totalActualCents += draftActual - entry.committedActualCents;
  }
  return finalizeOverlayTotals(totalForecastCents, totalActualCents);
}
