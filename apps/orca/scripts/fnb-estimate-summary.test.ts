import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFnbEstimateNeedsAttention,
  buildFnbEstimateSummary,
  calculateFnbPerPersonCents,
  calculateFnbTotalCents,
  calculateFnbVarianceToBudget,
  sumFnbBudgetedCents,
  sumFnbSubtotalCents,
} from "../lib/fnb-estimate-summary";

describe("F&B estimate summary", () => {
  it("sums only calculated F&B assignment totals into subtotal", () => {
    assert.equal(sumFnbSubtotalCents([
      { totalCents: 12_000 },
      { totalCents: null },
      { totalCents: 8_500 },
    ]), 20_500);
  });

  it("keeps fee, tax, and staffing inputs optional", () => {
    assert.equal(calculateFnbTotalCents({
      subtotalCents: 100_000,
      serviceFeeCents: 22_000,
      taxCents: null,
      staffingFeeCents: 5_000,
    }), 127_000);
  });

  it("calculates per-person cost only when attendance is available", () => {
    assert.equal(calculateFnbPerPersonCents(105_000, 200), 525);
    assert.equal(calculateFnbPerPersonCents(105_000, null), null);
    assert.equal(calculateFnbPerPersonCents(105_000, 0), null);
  });

  it("calculates over, under, and no-budget variance", () => {
    assert.deepEqual(calculateFnbVarianceToBudget(105_000, 100_000), {
      amountCents: 5_000,
      percentage: 0.05,
      direction: "over",
    });
    assert.deepEqual(calculateFnbVarianceToBudget(95_000, 100_000), {
      amountCents: -5_000,
      percentage: 0.05,
      direction: "under",
    });
    assert.equal(calculateFnbVarianceToBudget(95_000, null), null);
  });

  it("uses existing linked budget rows when available", () => {
    assert.equal(sumFnbBudgetedCents([
      { totalCents: 20_000, budgetedCents: 25_000 },
      { totalCents: 10_000, budgetedCents: null },
      { totalCents: 30_000, budgetedCents: 35_000 },
    ]), 60_000);
    assert.equal(sumFnbBudgetedCents([{ totalCents: 20_000 }]), null);
  });

  it("builds attention messages from real missing inputs", () => {
    assert.deepEqual(buildFnbEstimateNeedsAttention({
      forecastAttendance: null,
      budgetedCents: null,
      assignedItemCount: 0,
      unpricedItemCount: 2,
    }), [
      "Missing forecast attendance",
      "Missing budget",
      "No F&B items selected",
      "2 selected items missing price",
    ]);
  });

  it("builds a compact summary with actual saved/budgeted assignment data", () => {
    const summary = buildFnbEstimateSummary({
      forecastAttendance: 10,
      lines: [
        { totalCents: 10_000, budgetedCents: 12_000 },
        { totalCents: 15_000, budgetedCents: 18_000 },
        { totalCents: null },
      ],
    });

    assert.equal(summary.subtotalCents, 25_000);
    assert.equal(summary.totalEstimatedCents, 25_000);
    assert.equal(summary.budgetedCents, 30_000);
    assert.equal(summary.perPersonCents, 2_500);
    assert.equal(summary.variance?.direction, "under");
    assert.equal(summary.unpricedItemCount, 1);
  });
});
