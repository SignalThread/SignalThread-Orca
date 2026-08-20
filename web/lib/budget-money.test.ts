import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBudgetAggregation,
  calculateBudgetAggregationFromSums,
  calculateBudgetCategoryHealth,
  calculateBudgetTotals,
  parseBudgetCurrencyToCents,
} from "./budget-money";

test("Budget money totals use exact integer cents", () => {
  assert.deepEqual(calculateBudgetTotals([{ forecastCents: 5_997, actualCents: 0 }, { forecastCents: 1, actualCents: 2 }]), {
    totalForecastCents: 5_998, totalActualCents: 2, varianceCents: -5_996, percentUnder: 100,
  });
});

test("canonical aggregation sums the same Forecast and Actual fields as the grid", () => {
  assert.deepEqual(calculateBudgetAggregation([
    { forecastCents: 20_000, actualCents: 12_000 },
    { forecastCents: 8_392, actualCents: 12_962 },
  ]), {
    forecastCents: 28_392,
    actualCents: 24_962,
    remainingCents: 3_430,
    utilizationPercent: 87.9,
  });
});

test("Transportation totals use Actual, not line status or exposure", () => {
  assert.deepEqual(calculateBudgetAggregationFromSums(27_839_200, 24_962_900), {
    forecastCents: 27_839_200,
    actualCents: 24_962_900,
    remainingCents: 2_876_300,
    utilizationPercent: 89.7,
  });
});

test("zero Forecast is safe", () => {
  const result = calculateBudgetAggregationFromSums(0, 0);
  assert.equal(result.utilizationPercent, 0);
  assert.equal(Number.isFinite(result.utilizationPercent), true);
});

test("Actual above Forecast keeps negative Remaining and over-budget health", () => {
  const health = calculateBudgetCategoryHealth([{ forecastCents: 10_000, actualCents: 12_000 }]);
  assert.equal(health.remainingCents, -2_000);
  assert.equal(health.utilizationPercent, 120);
  assert.equal(health.budgetHealth, "OVER_BUDGET");
});

test("category status uses Actual/Forecast thresholds at 95% and 100%", () => {
  assert.equal(calculateBudgetCategoryHealth([{ forecastCents: 10_000, actualCents: 9_499 }]).budgetHealth, "UNDER_BUDGET");
  assert.equal(calculateBudgetCategoryHealth([{ forecastCents: 10_000, actualCents: 9_500 }]).budgetHealth, "APPROACHING_BUDGET");
  assert.equal(calculateBudgetCategoryHealth([{ forecastCents: 10_000, actualCents: 10_000 }]).budgetHealth, "OVER_BUDGET");
});

test("Budget currency parser uses one half-up cent rounding rule", () => {
  assert.equal(parseBudgetCurrencyToCents("$10.005"), 1001);
  assert.equal(parseBudgetCurrencyToCents("10.004"), 1000);
  assert.equal(parseBudgetCurrencyToCents("-1.00"), null);
});
