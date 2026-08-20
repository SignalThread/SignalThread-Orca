import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFnbAssignmentCost,
  calculateFnbPercentageCents,
  calculateFnbPlanCost,
  calculateFnbOrder,
  normalizeFnbPercentage,
} from "./fnb-cost-calculation";

test("F&B percentages accept empty and decimal values and reject invalid input", () => {
  assert.equal(normalizeFnbPercentage(""), "0.0000");
  assert.equal(normalizeFnbPercentage("8.875"), "8.8750");
  assert.equal(normalizeFnbPercentage(100), "100.0000");
  assert.throws(() => normalizeFnbPercentage("-1"), /number|between 0 and 100/);
  assert.throws(() => normalizeFnbPercentage("abc"), /number/);
  assert.throws(() => normalizeFnbPercentage("100.0001"), /between 0 and 100/);
  assert.throws(() => normalizeFnbPercentage("1.12345"), /four decimal places/);
});

test("canonical order engine preserves negotiated savings, allocation, taxability and trace", () => {
  const result = calculateFnbOrder({
    lines: [
      { id: "vegetarian", currency: "USD", quantity: 3, publishedUnitCents: 1_000, negotiatedUnitCents: 900, itemDiscountPercent: "10" },
      { id: "venue-fee", currency: "USD", quantity: 1, publishedUnitCents: 500, taxable: false },
    ],
    orderAdjustments: [{ label: "Event concession", kind: "DISCOUNT", scope: "ORDER", amountCents: 101 }, { label: "Staffing", kind: "FEE", scope: "ORDER", amountCents: 50 }],
    serviceChargePercent: "20",
    serviceChargeTaxable: true,
    taxPercent: "10",
  });
  assert.deepEqual(result.lines, [
    { id: "vegetarian", billedQuantity: 3, publishedExtendedCents: 3_000, negotiatedExtendedCents: 2_700, extendedCents: 2_347, discountCents: 353, taxableBaseCents: 2_347, serviceChargeCents: 469, taxCents: 281, feeCents: 41, totalCents: 3_138, actualExtendedCents: null },
    { id: "venue-fee", billedQuantity: 1, publishedExtendedCents: 500, negotiatedExtendedCents: 500, extendedCents: 482, discountCents: 18, taxableBaseCents: 0, serviceChargeCents: 97, taxCents: 10, feeCents: 9, totalCents: 598, actualExtendedCents: null },
  ]);
  assert.equal(result.publishedSubtotalCents, 3_500);
  assert.equal(result.negotiatedSavingsCents, 300);
  assert.equal(result.itemDiscountCents, 270);
  assert.equal(result.orderDiscountCents, 101);
  assert.equal(result.serviceChargeCents, 566);
  assert.equal(result.taxCents, 291);
  assert.equal(result.totalCents, 3_736);
  assert.equal(result.lines.reduce((total, line) => total + line.totalCents, 0), result.totalCents);
  assert.equal(result.actualTotalCents, null);
  assert.equal(result.trace.at(-1)?.code, "TOTAL");
});

test("canonical order engine covers guarantees, scoped adjustments, multiple tax bases, actuals, and exact line reconciliation", () => {
  const result = calculateFnbOrder({
    lines: [
      { id: "meal", category: "Food", currency: "USD", quantity: 2, guarantee: 3, minimumQuantity: 5, publishedUnitCents: 1_000, negotiatedUnitCents: 900, actualExtendedCents: 4_000 },
      { id: "dessert", category: "Food", currency: "USD", quantity: 1, publishedUnitCents: 500, actualExtendedCents: 400 },
      { id: "rental", category: "Equipment", currency: "USD", quantity: 1, publishedUnitCents: 1_000, taxable: false, actualExtendedCents: 900 },
    ],
    orderAdjustments: [
      { id: "meal-credit", label: "Meal credit", kind: "DISCOUNT", scope: "ITEM", targetId: "meal", amountCents: 100 },
      { id: "food-discount", label: "Food concession", kind: "DISCOUNT", scope: "CATEGORY", targetCategory: "Food", percentage: "10" },
      { id: "order-credit", label: "Order credit", kind: "DISCOUNT", scope: "ORDER", amountCents: 101 },
      { id: "food-fee", label: "Food administration", kind: "FEE", scope: "CATEGORY", targetCategory: "Food", percentage: "2", taxable: true },
      { id: "delivery", label: "Delivery", kind: "FEE", scope: "ORDER", amountCents: 13 },
    ],
    serviceChargePercent: "10",
    serviceChargeAmountCents: 1,
    taxes: [
      { id: "state", label: "State", percentage: "8.875", base: "TAXABLE_SUBTOTAL_AND_SERVICE_CHARGE" },
      { id: "food-local", label: "Food local", percentage: "1.5", scope: "CATEGORY", targetCategory: "Food", base: "SUBTOTAL" },
      { id: "fee-tax", label: "Tax including taxable fees", percentage: "1", base: "TAXABLE_SUBTOTAL_SERVICE_AND_FEES" },
    ],
    actualAdjustments: { discountCents: 100, serviceChargeCents: 200, taxCents: 300, feeCents: 50 },
  });

  assert.equal(result.lines[0]?.billedQuantity, 5);
  assert.equal(result.publishedSubtotalCents, 6_500);
  assert.equal(result.negotiatedSavingsCents, 500);
  assert.equal(result.itemDiscountCents, 590);
  assert.equal(result.orderDiscountCents, 101);
  assert.equal(result.subtotalAfterDiscountsCents, 5_309);
  assert.equal(result.serviceChargeCents, 532);
  assert.equal(result.feeCents, 100);
  assert.deepEqual(result.taxes, [
    { id: "state", label: "State", percentage: "8.8750", basisCents: 4_861, amountCents: 431 },
    { id: "food-local", label: "Food local", percentage: "1.5000", basisCents: 4_329, amountCents: 65 },
    { id: "fee-tax", label: "Tax including taxable fees", percentage: "1.0000", basisCents: 4_948, amountCents: 49 },
  ]);
  assert.equal(result.taxCents, 545);
  assert.deepEqual(result.lines.map((line) => line.totalCents), [4_843, 551, 1_092]);
  assert.equal(result.totalCents, 6_486);
  assert.equal(result.totalCents, result.lines.reduce((total, line) => total + line.totalCents, 0));
  assert.equal(result.actualSubtotalCents, 5_300);
  assert.equal(result.actualTotalCents, 5_750);
  assert.equal(result.varianceCents, 5_750 - result.totalCents);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result, "calculation is transport-safe and deterministic");
});

test("fixed charges and zero values remain exact on a zero-priced order", () => {
  const result = calculateFnbOrder({
    lines: [{ id: "included", currency: "USD", quantity: 1, publishedUnitCents: 0, actualExtendedCents: 0 }],
    orderAdjustments: [{ label: "Fixed fee", kind: "FEE", scope: "ORDER", amountCents: 25 }],
    serviceChargePercent: 0,
    serviceChargeAmountCents: 10,
    taxes: [{ label: "Zero tax", percentage: 0, base: "SUBTOTAL_AND_SERVICE_CHARGE" }],
  });
  assert.equal(result.totalCents, 35);
  assert.equal(result.lines[0]?.totalCents, 35);
  assert.equal(result.actualTotalCents, 0);
});

test("canonical order engine rejects mixed currencies and invalid money inputs", () => {
  const line = { id: "one", currency: "USD", quantity: 1, publishedUnitCents: 100 } as const;
  assert.throws(() => calculateFnbOrder({ lines: [line, { ...line, id: "two", currency: "CAD" }] }), /Mixed currencies/);
  assert.throws(() => calculateFnbOrder({ lines: [{ ...line, quantity: 0 }] }), /Quantity/);
  assert.throws(() => calculateFnbOrder({ lines: [{ ...line, publishedUnitCents: -1 }] }), /Published unit price/);
  assert.throws(() => calculateFnbOrder({ lines: [line], orderAdjustments: [{ label: "too much", kind: "DISCOUNT", scope: "ORDER", amountCents: 101 }] }), /exceed/);
  assert.throws(() => calculateFnbOrder({ lines: [line], orderAdjustments: [{ label: "missing target", kind: "FEE", scope: "ITEM", amountCents: 1 }] }), /targetId/);
  assert.throws(() => calculateFnbOrder({ lines: [line], orderAdjustments: [{ label: "wrong category", kind: "DISCOUNT", scope: "CATEGORY", targetCategory: "Food", amountCents: 1 }] }), /not in this order/);
  assert.throws(() => calculateFnbOrder({ lines: [line, line] }), /ids must be unique/);
  assert.throws(() => calculateFnbOrder({ lines: [{ ...line, quantity: 2, publishedUnitCents: Number.MAX_SAFE_INTEGER }] }), /exact-money range/);
  assert.throws(() => calculateFnbOrder({ lines: [{ ...line, actualExtendedCents: -1 }] }), /Actual extended/);
  assert.throws(() => calculateFnbOrder({ lines: [line], taxes: [{ label: "bad", percentage: 1, base: "UNKNOWN" as never }] }), /Unsupported tax base/);
});

test("negotiated overrides remain distinct even when the negotiated price is a premium", () => {
  const result = calculateFnbOrder({
    lines: [{ id: "premium", currency: "USD", quantity: 2, publishedUnitCents: 100, negotiatedUnitCents: 125 }],
  });
  assert.equal(result.publishedSubtotalCents, 200);
  assert.equal(result.negotiatedSavingsCents, -50);
  assert.equal(result.subtotalAfterDiscountsCents, 250);
});

test("deterministic property matrix reconciles allocations, rollups, and trace for fractional rates", () => {
  let seed = 0x51f15e;
  const random = () => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed;
  };
  for (let iteration = 0; iteration < 250; iteration += 1) {
    const lineCount = 1 + (random() % 6);
    const lines = Array.from({ length: lineCount }, (_, index) => ({
      id: `line-${index}`,
      category: index % 2 === 0 ? "Food" : "Beverage",
      currency: "USD",
      quantity: 1 + (random() % 50),
      publishedUnitCents: random() % 25_000,
      taxable: random() % 3 !== 0,
    }));
    const gross = lines.reduce((total, line) => total + line.quantity * line.publishedUnitCents, 0);
    const discount = gross === 0 ? 0 : random() % Math.min(gross + 1, 10_000);
    const result = calculateFnbOrder({
      lines,
      orderAdjustments: [{ label: "Property discount", kind: "DISCOUNT", scope: "ORDER", amountCents: discount }],
      serviceChargePercent: `${random() % 2500 / 100}`,
      serviceChargeTaxable: true,
      taxPercent: `${random() % 1200 / 100}`,
    });
    assert.ok(Number.isSafeInteger(result.totalCents));
    assert.equal(result.publishedSubtotalCents - result.negotiatedSavingsCents - result.itemDiscountCents - result.orderDiscountCents, result.subtotalAfterDiscountsCents);
    assert.equal(result.lines.reduce((total, line) => total + line.extendedCents, 0), result.subtotalAfterDiscountsCents);
    assert.equal(result.lines.reduce((total, line) => total + line.totalCents, 0), result.totalCents);
    assert.equal(result.totalCents, result.subtotalAfterDiscountsCents + result.serviceChargeCents + result.taxCents + result.feeCents);
  }
});

test("concurrent calculations are stateless and edits produce a new exact trace", async () => {
  const input = {
    lines: [{ id: "meal", currency: "USD", quantity: 10, publishedUnitCents: 1_000, negotiatedUnitCents: 900 }],
    serviceChargePercent: "22.5",
    taxes: [{ label: "Tax", percentage: "8.875", base: "SUBTOTAL_AND_SERVICE_CHARGE" as const }],
  };
  const concurrent = await Promise.all(Array.from({ length: 64 }, async () => calculateFnbOrder(input)));
  for (const result of concurrent) assert.deepEqual(result, concurrent[0]);

  const edited = calculateFnbOrder({ ...input, lines: [{ ...input.lines[0], quantity: 11 }] });
  assert.notEqual(edited.totalCents, concurrent[0]?.totalCents);
  assert.equal(edited.trace.at(-1)?.amountCents, edited.totalCents);
  assert.equal(concurrent[0]?.trace.at(-1)?.amountCents, concurrent[0]?.totalCents);
});

test("decimal percentages use deterministic half-up cent rounding", () => {
  assert.equal(calculateFnbPercentageCents(12_345, "8.875"), 1_096);
  assert.equal(calculateFnbPercentageCents(10_000, "0.005"), 1);
});

test("global rates and unlimited item taxes all use the pre-tax subtotal without compounding", () => {
  const result = calculateFnbAssignmentCost({
    subtotalCents: 10_000,
    taxPercent: "8",
    serviceChargePercent: "24",
    itemTaxes: [
      { label: "Hospitality", percentage: "3" },
      { label: "Local district", percentage: "1.5" },
      { label: "Venue", percentage: "0.25" },
    ],
  });

  assert.deepEqual(result, {
    subtotalCents: 10_000,
    taxCents: 800,
    serviceChargeCents: 2_400,
    additionalTaxCents: 475,
    totalCents: 13_675,
  });
});

test("item taxes remain scoped to their assignment", () => {
  const taxed = calculateFnbAssignmentCost({
    subtotalCents: 20_000,
    taxPercent: 0,
    serviceChargePercent: 0,
    itemTaxes: [{ percentage: 5 }],
  });
  const untaxed = calculateFnbAssignmentCost({
    subtotalCents: 20_000,
    taxPercent: 0,
    serviceChargePercent: 0,
    itemTaxes: [],
  });

  assert.equal(taxed.additionalTaxCents, 1_000);
  assert.equal(untaxed.additionalTaxCents, 0);
  assert.equal(untaxed.totalCents, 20_000);
});

test("plan totals sum line breakdowns and calculate per-person cost", () => {
  const first = calculateFnbAssignmentCost({
    subtotalCents: 10_000,
    taxPercent: 8,
    serviceChargePercent: 24,
    itemTaxes: [{ percentage: 3 }],
  });
  const second = calculateFnbAssignmentCost({
    subtotalCents: 5_000,
    taxPercent: 8,
    serviceChargePercent: 24,
    itemTaxes: [{ percentage: 2 }],
  });
  const unpriced = calculateFnbAssignmentCost({
    subtotalCents: null,
    taxPercent: 8,
    serviceChargePercent: 24,
  });
  const plan = calculateFnbPlanCost({ assignments: [first, second, unpriced], forecastAttendance: 30 });

  assert.deepEqual(plan, {
    subtotalCents: 15_000,
    taxCents: 1_200,
    serviceChargeCents: 3_600,
    additionalTaxCents: 400,
    totalEstimatedCents: 20_200,
    perPersonCents: 673,
    assignedItemCount: 3,
    unpricedItemCount: 1,
  });
});

test("existing assignments with no tax configuration preserve their pre-tax total", () => {
  assert.deepEqual(calculateFnbAssignmentCost({
    subtotalCents: 42_500,
    taxPercent: "",
    serviceChargePercent: "",
  }), {
    subtotalCents: 42_500,
    taxCents: 0,
    serviceChargeCents: 0,
    additionalTaxCents: 0,
    totalCents: 42_500,
  });
});
