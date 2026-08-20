/** Canonical Budget money math. Persisted amounts are exact integer cents. */
export type BudgetMoneyRow = Readonly<{ forecastCents: number; actualCents: number }>;
export type BudgetMoneyTotals = Readonly<{ totalForecastCents: number; totalActualCents: number; varianceCents: number; percentUnder: number }>;
export type BudgetHealth = "UNDER_BUDGET" | "APPROACHING_BUDGET" | "OVER_BUDGET" | "UNCLASSIFIED";
export type BudgetAggregation = Readonly<{
  forecastCents: number;
  actualCents: number;
  remainingCents: number;
  utilizationPercent: number;
}>;
export type BudgetCategoryHealth = Readonly<{
  forecastCents: number;
  actualCents: number;
  remainingCents: number;
  utilizationPercent: number;
  budgetHealth: BudgetHealth;
}>;

function assertCents(value: number, field: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${field} must be a safe integer number of cents`);
}

export function calculateBudgetTotalsFromSums(totalForecastCents: number, totalActualCents: number): BudgetMoneyTotals {
  const aggregate = calculateBudgetAggregationFromSums(totalForecastCents, totalActualCents);
  const varianceCents = totalActualCents - totalForecastCents;
  const rawPercentUnder = totalForecastCents === 0 ? 0 : ((totalForecastCents - totalActualCents) / totalForecastCents) * 100;
  return {
    totalForecastCents: aggregate.forecastCents,
    totalActualCents: aggregate.actualCents,
    varianceCents,
    percentUnder: Number(Math.min(100, Math.max(0, rawPercentUnder)).toFixed(1)),
  };
}

/** The single source of truth for Forecast, Actual, Remaining, and Utilization. */
export function calculateBudgetAggregationFromSums(
  forecastCents: number,
  actualCents: number,
): BudgetAggregation {
  assertCents(forecastCents, "forecastCents");
  assertCents(actualCents, "actualCents");
  return {
    forecastCents,
    actualCents,
    remainingCents: forecastCents - actualCents,
    utilizationPercent: forecastCents === 0
      ? 0
      : Number(((actualCents / forecastCents) * 100).toFixed(1)),
  };
}

export function calculateBudgetAggregation(rows: readonly BudgetMoneyRow[]): BudgetAggregation {
  let forecastCents = 0;
  let actualCents = 0;
  for (const row of rows) {
    assertCents(row.forecastCents, "forecastCents");
    assertCents(row.actualCents, "actualCents");
    forecastCents += row.forecastCents;
    actualCents += row.actualCents;
  }
  return calculateBudgetAggregationFromSums(forecastCents, actualCents);
}

export function calculateBudgetTotals(rows: readonly BudgetMoneyRow[]): BudgetMoneyTotals {
  const aggregate = calculateBudgetAggregation(rows);
  return calculateBudgetTotalsFromSums(aggregate.forecastCents, aggregate.actualCents);
}

/** Apply the existing 95%/100% health thresholds to Actual versus Forecast. */
export function calculateBudgetCategoryHealthFromSums(input: {
  forecastCents: number;
  actualCents: number;
}): BudgetCategoryHealth {
  const aggregate = calculateBudgetAggregationFromSums(input.forecastCents, input.actualCents);
  const { forecastCents, actualCents } = aggregate;

  if (forecastCents === 0 && actualCents === 0) {
    return {
      ...aggregate,
      budgetHealth: "UNCLASSIFIED",
    };
  }

  if (forecastCents <= 0) {
    return { ...aggregate, budgetHealth: actualCents > forecastCents ? "OVER_BUDGET" : "UNCLASSIFIED" };
  }

  const target = BigInt(forecastCents);
  const actual = BigInt(actualCents);
  const hundred = BigInt(100);
  const ninetyFive = BigInt(95);
  const budgetHealth: BudgetHealth = actual * hundred >= target * hundred
    ? "OVER_BUDGET"
    : actual * hundred >= target * ninetyFive
      ? "APPROACHING_BUDGET"
      : "UNDER_BUDGET";

  return { ...aggregate, budgetHealth };
}

/** Sum line items and calculate health solely from Actual versus Forecast. */
export function calculateBudgetCategoryHealth(rows: readonly BudgetMoneyRow[]): BudgetCategoryHealth {
  const aggregate = calculateBudgetAggregation(rows);
  return calculateBudgetCategoryHealthFromSums(aggregate);
}

/** Parses decimal currency without binary floating-point arithmetic; half-up at cent 3. */
export function parseBudgetCurrencyToCents(raw: string, allowNegative = false): number | null {
  const normalized = raw.replace(/[$,\s]/g, "").trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match || (match[1] === "-" && !allowNegative)) return null;
  const whole = BigInt(match[2]);
  const fraction = match[3] ?? "";
  const cents = BigInt(fraction.slice(0, 2).padEnd(2, "0"));
  const rounded = whole * BigInt(100) + cents + (fraction[2] >= "5" ? BigInt(1) : BigInt(0));
  const signed = match[1] === "-" ? -rounded : rounded;
  return signed <= BigInt(Number.MAX_SAFE_INTEGER) && signed >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(signed) : null;
}
