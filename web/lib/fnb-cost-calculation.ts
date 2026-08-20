export const FNB_PERCENT_SCALE = 10_000;
const FNB_PERCENT_DENOMINATOR = 100 * FNB_PERCENT_SCALE;

export type FnbTaxRateInput = Readonly<{
  id?: string;
  label?: string | null;
  percentage: string | number;
}>;

export type FnbAssignmentCostBreakdown = Readonly<{
  subtotalCents: number | null;
  taxCents: number | null;
  serviceChargeCents: number | null;
  additionalTaxCents: number | null;
  totalCents: number | null;
}>;

export type FnbPlanCostBreakdown = Readonly<{
  subtotalCents: number;
  taxCents: number;
  serviceChargeCents: number;
  additionalTaxCents: number;
  totalEstimatedCents: number;
  perPersonCents: number | null;
  assignedItemCount: number;
  unpricedItemCount: number;
}>;

/**
 * A complete, transport-safe calculation contract for new F&B order surfaces.
 * Monetary values are integer minor units and rates are decimal percentages.
 * Existing assignment helpers below intentionally remain supported while callers
 * migrate to this richer traceable representation.
 */
export type FnbAdjustmentInput = Readonly<{
  id?: string;
  label: string;
  kind: "DISCOUNT" | "FEE";
  scope: "ITEM" | "CATEGORY" | "ORDER";
  targetId?: string;
  targetCategory?: string;
  amountCents?: number;
  percentage?: string | number;
  taxable?: boolean;
}>;

export type FnbOrderLineInput = Readonly<{
  id: string;
  currency: string;
  quantity: number;
  guarantee?: number | null;
  minimumQuantity?: number | null;
  category?: string | null;
  publishedUnitCents: number | null;
  negotiatedUnitCents?: number | null;
  itemDiscountCents?: number;
  itemDiscountPercent?: string | number;
  taxable?: boolean;
  actualExtendedCents?: number | null;
}>;

export type FnbOrderTaxInput = Readonly<{
  id?: string;
  label: string;
  percentage: string | number;
  scope?: "ITEM" | "CATEGORY" | "ORDER";
  targetId?: string;
  targetCategory?: string;
  base:
    | "SUBTOTAL"
    | "TAXABLE_SUBTOTAL"
    | "SERVICE_CHARGE"
    | "SUBTOTAL_AND_SERVICE_CHARGE"
    | "TAXABLE_SUBTOTAL_AND_SERVICE_CHARGE"
    | "TAXABLE_SUBTOTAL_SERVICE_AND_FEES";
}>;

export type FnbActualAdjustmentInput = Readonly<{
  discountCents?: number;
  serviceChargeCents?: number;
  taxCents?: number;
  feeCents?: number;
}>;

export type FnbCalculationTraceEntry = Readonly<{
  code: string;
  label: string;
  amountCents: number;
  basisCents?: number;
}>;

export type FnbOrderCalculation = Readonly<{
  currency: string;
  publishedSubtotalCents: number;
  negotiatedSavingsCents: number;
  itemDiscountCents: number;
  orderDiscountCents: number;
  subtotalAfterDiscountsCents: number;
  serviceChargeCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
  actualSubtotalCents: number | null;
  actualTotalCents: number | null;
  varianceCents: number | null;
  lines: ReadonlyArray<Readonly<{
    id: string;
    billedQuantity: number;
    publishedExtendedCents: number;
    negotiatedExtendedCents: number;
    extendedCents: number;
    discountCents: number;
    taxableBaseCents: number;
    serviceChargeCents: number;
    taxCents: number;
    feeCents: number;
    totalCents: number;
    actualExtendedCents: number | null;
  }>>;
  taxes: ReadonlyArray<Readonly<{ id: string; label: string; percentage: string; basisCents: number; amountCents: number }>>;
  fees: ReadonlyArray<Readonly<{ id: string; label: string; basisCents: number; amountCents: number; taxable: boolean }>>;
  trace: readonly FnbCalculationTraceEntry[];
}>;

export type FnbAssignmentFinancialInput = Readonly<{
  id: string;
  currency: string;
  quantity: number | null;
  minimumQuantity?: number | null;
  publishedUnitCents: number | null;
  negotiatedUnitCents?: number | null;
  discountUnitCents?: number | null;
  taxable?: boolean;
  totalOverrideCents?: number | null;
  legacySubtotalCents?: number | null;
  taxPercent: string | number;
  serviceChargePercent: string | number;
  itemTaxes?: readonly FnbTaxRateInput[];
  /** All-in posted actual from the canonical Budget row, when available. */
  actualTotalCents?: number | null;
}>;

export type FnbAssignmentFinancialResult = Readonly<{
  breakdown: FnbAssignmentCostBreakdown;
  order: FnbOrderCalculation | null;
}>;

function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative whole number of cents`);
}

function assertQuantity(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Quantity must be a positive whole number");
}

function addExact(left: number, right: number, label: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw new Error(`${label} exceeds supported exact-money range`);
  return value;
}

function addSignedExact(left: number, right: number, label: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw new Error(`${label} exceeds supported exact-money range`);
  return value;
}

function multiplyExact(left: number, right: number, label: string): number {
  const value = left * right;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} exceeds supported exact-money range`);
  return value;
}

function percentageOf(baseCents: number, percentage: string | number): number {
  return calculateFnbPercentageCents(baseCents, percentage);
}

/**
 * Calculates a whole F&B order in one deterministic order:
 * billed quantity/guarantee/minimum → negotiated price selection → embedded,
 * item, category and order discounts → service charge → fixed/percentage fees
 * → independently based taxes → final estimate → supplied actuals/variance.
 * Every lump sum is allocated by quotient/remainder in stable input-line order.
 * A negotiated price is reported as savings, never silently treated as a discount.
 */
export function calculateFnbOrder(input: {
  lines: readonly FnbOrderLineInput[];
  orderAdjustments?: readonly FnbAdjustmentInput[];
  serviceChargePercent?: string | number;
  serviceChargeAmountCents?: number;
  serviceChargeTaxable?: boolean;
  taxPercent?: string | number;
  taxes?: readonly FnbOrderTaxInput[];
  actualAdjustments?: FnbActualAdjustmentInput;
}): FnbOrderCalculation {
  if (input.lines.length === 0) throw new Error("An F&B order needs at least one line");
  const currency = input.lines[0]?.currency;
  if (!currency || !/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a three-letter uppercase code");
  if (new Set(input.lines.map((line) => line.id)).size !== input.lines.length) throw new Error("F&B order line ids must be unique");
  const trace: FnbCalculationTraceEntry[] = [];
  let publishedSubtotalCents = 0;
  let negotiatedSavingsCents = 0;
  let embeddedItemDiscountCents = 0;
  const rawLines = input.lines.map((line) => {
    if (line.currency !== currency) throw new Error("Mixed currencies are not supported in one F&B order");
    assertQuantity(line.quantity);
    if (line.guarantee != null) assertQuantity(line.guarantee);
    if (line.minimumQuantity != null) assertQuantity(line.minimumQuantity);
    const billedQuantity = Math.max(line.quantity, line.guarantee ?? 0, line.minimumQuantity ?? 0);
    if (line.publishedUnitCents === null && line.negotiatedUnitCents === null) throw new Error(`Line ${line.id} needs a published or negotiated unit price`);
    if (line.publishedUnitCents !== null) assertCents(line.publishedUnitCents, "Published unit price");
    if (line.negotiatedUnitCents != null) assertCents(line.negotiatedUnitCents, "Negotiated unit price");
    const unit = line.negotiatedUnitCents ?? line.publishedUnitCents as number;
    const publishedExtended = multiplyExact(line.publishedUnitCents ?? unit, billedQuantity, "Published extended price");
    const extended = multiplyExact(unit, billedQuantity, "Extended price");
    const fixedDiscount = line.itemDiscountCents ?? 0;
    assertCents(fixedDiscount, "Item discount");
    const percentDiscount = line.itemDiscountPercent == null ? 0 : percentageOf(extended, line.itemDiscountPercent);
    const discount = addExact(fixedDiscount, percentDiscount, "Item discount");
    if (discount > extended) throw new Error(`Item discounts exceed line ${line.id} price`);
    publishedSubtotalCents = addExact(publishedSubtotalCents, publishedExtended, "Published subtotal");
    negotiatedSavingsCents = addSignedExact(negotiatedSavingsCents, publishedExtended - extended, "Negotiated savings");
    embeddedItemDiscountCents = addExact(embeddedItemDiscountCents, discount, "Item discounts");
    if (line.actualExtendedCents != null) assertCents(line.actualExtendedCents, "Actual extended amount");
    return {
      id: line.id,
      category: line.category?.trim() || null,
      billedQuantity,
      publishedExtendedCents: publishedExtended,
      negotiatedExtendedCents: extended,
      netCents: extended - discount,
      discountCents: discount,
      taxable: line.taxable !== false,
      actualExtendedCents: line.actualExtendedCents ?? null,
      serviceChargeCents: 0,
      taxCents: 0,
      feeCents: 0,
      taxableFeeCents: 0,
    };
  });

  function indicesFor(scope: FnbAdjustmentInput["scope"], targetId?: string, targetCategory?: string): number[] {
    if (scope === "ITEM") {
      if (!targetId) throw new Error("Item-scoped adjustment or tax requires targetId");
      const index = rawLines.findIndex((line) => line.id === targetId);
      if (index < 0) throw new Error(`Item-scoped reference ${targetId} is not in this order`);
      return [index];
    }
    if (scope === "CATEGORY") {
      if (!targetCategory?.trim()) throw new Error("Category-scoped adjustment or tax requires targetCategory");
      const matches = rawLines.flatMap((line, index) => line.category === targetCategory.trim() ? [index] : []);
      if (matches.length === 0) throw new Error(`Category-scoped reference ${targetCategory} is not in this order`);
      return matches;
    }
    if (targetId || targetCategory) throw new Error("Order-scoped adjustment or tax cannot have an item/category target");
    return rawLines.map((_, index) => index);
  }

  function sumFor(indices: readonly number[], select: (line: typeof rawLines[number]) => number, label: string): number {
    return indices.reduce((total, index) => addExact(total, select(rawLines[index]!), label), 0);
  }

  function allocate(amount: number, indices: readonly number[], basis: (line: typeof rawLines[number], position: number) => number, label: string): number[] {
    if (amount === 0) return indices.map(() => 0);
    const totalBasis = indices.reduce((total, index, position) => addExact(total, basis(rawLines[index]!, position), `${label} basis`), 0);
    if (totalBasis <= 0) return indices.map((_, position) => position === indices.length - 1 ? amount : 0);
    let remainingAmount = amount;
    let remainingBasis = totalBasis;
    return indices.map((index, position) => {
      const lineBasis = basis(rawLines[index]!, position);
      const allocated = position === indices.length - 1
        ? remainingAmount
        : Number((BigInt(lineBasis) * BigInt(remainingAmount)) / BigInt(remainingBasis));
      remainingAmount -= allocated;
      remainingBasis -= lineBasis;
      return allocated;
    });
  }

  const adjustments = (input.orderAdjustments ?? []).map((adjustment, index) => ({ adjustment, index }));
  for (const { adjustment } of adjustments) {
    if (!adjustment.label.trim()) throw new Error("Adjustment label is required");
    if (adjustment.amountCents == null && adjustment.percentage == null) throw new Error(`${adjustment.label} needs an amount or percentage`);
    if (adjustment.amountCents != null) assertCents(adjustment.amountCents, `${adjustment.label} amount`);
  }

  let scopedDiscountCents = 0;
  let orderDiscountCents = 0;
  const discountOrder = { ITEM: 0, CATEGORY: 1, ORDER: 2 } as const;
  for (const { adjustment } of adjustments
    .filter((entry) => entry.adjustment.kind === "DISCOUNT")
    .sort((left, right) => discountOrder[left.adjustment.scope] - discountOrder[right.adjustment.scope] || left.index - right.index)) {
    const indices = indicesFor(adjustment.scope, adjustment.targetId, adjustment.targetCategory);
    const basis = sumFor(indices, (line) => line.netCents, `${adjustment.label} basis`);
    const fixed = adjustment.amountCents ?? 0;
    const percentage = adjustment.percentage == null ? 0 : percentageOf(basis, adjustment.percentage);
    const amount = addExact(fixed, percentage, `${adjustment.label} amount`);
    if (amount > basis) throw new Error(`${adjustment.label} discounts exceed eligible subtotal`);
    const allocations = allocate(amount, indices, (line) => line.netCents, adjustment.label);
    indices.forEach((lineIndex, position) => {
      rawLines[lineIndex]!.netCents -= allocations[position]!;
      rawLines[lineIndex]!.discountCents += allocations[position]!;
    });
    if (adjustment.scope === "ORDER") orderDiscountCents = addExact(orderDiscountCents, amount, "Order discounts");
    else scopedDiscountCents = addExact(scopedDiscountCents, amount, "Item/category discounts");
    trace.push({ code: `${adjustment.scope}_DISCOUNT`, label: adjustment.label, amountCents: -amount, basisCents: basis });
  }

  const subtotalAfterDiscountsCents = sumFor(rawLines.map((_, index) => index), (line) => line.netCents, "Order subtotal");
  const serviceFixed = input.serviceChargeAmountCents ?? 0;
  assertCents(serviceFixed, "Service charge amount");
  const serviceChargeCents = addExact(serviceFixed, percentageOf(subtotalAfterDiscountsCents, input.serviceChargePercent ?? 0), "Service charge");
  const allIndices = rawLines.map((_, index) => index);
  const serviceAllocations = allocate(serviceChargeCents, allIndices, (line) => line.netCents, "Service charge");
  allIndices.forEach((lineIndex, position) => { rawLines[lineIndex]!.serviceChargeCents = serviceAllocations[position]!; });

  const fees: Array<{ id: string; label: string; basisCents: number; amountCents: number; taxable: boolean }> = [];
  for (const { adjustment, index } of adjustments.filter((entry) => entry.adjustment.kind === "FEE")) {
    const indices = indicesFor(adjustment.scope, adjustment.targetId, adjustment.targetCategory);
    const basis = sumFor(indices, (line) => line.netCents, `${adjustment.label} basis`);
    const amount = addExact(adjustment.amountCents ?? 0, adjustment.percentage == null ? 0 : percentageOf(basis, adjustment.percentage), `${adjustment.label} amount`);
    const allocations = allocate(amount, indices, (line) => line.netCents, adjustment.label);
    indices.forEach((lineIndex, position) => {
      rawLines[lineIndex]!.feeCents += allocations[position]!;
      if (adjustment.taxable === true) rawLines[lineIndex]!.taxableFeeCents += allocations[position]!;
    });
    fees.push({ id: adjustment.id ?? `fee-${index + 1}`, label: adjustment.label, basisCents: basis, amountCents: amount, taxable: adjustment.taxable === true });
    trace.push({ code: `${adjustment.scope}_FEE`, label: adjustment.label, amountCents: amount, basisCents: basis });
  }
  const feeCents = fees.reduce((total, fee) => addExact(total, fee.amountCents, "Fees"), 0);

  const taxInputs: FnbOrderTaxInput[] = [
    ...(input.taxPercent == null ? [] : [{
      id: "primary-tax",
      label: "Primary tax",
      percentage: input.taxPercent,
      scope: "ORDER" as const,
      base: input.serviceChargeTaxable ? "TAXABLE_SUBTOTAL_AND_SERVICE_CHARGE" as const : "TAXABLE_SUBTOTAL" as const,
    }]),
    ...(input.taxes ?? []),
  ];
  const taxes: Array<{ id: string; label: string; percentage: string; basisCents: number; amountCents: number }> = [];
  for (const [index, tax] of taxInputs.entries()) {
    if (!tax.label.trim()) throw new Error("Tax label is required");
    const indices = indicesFor(tax.scope ?? "ORDER", tax.targetId, tax.targetCategory);
    const contributions = indices.map((lineIndex) => {
      const line = rawLines[lineIndex]!;
      const subtotal = line.netCents;
      const taxableSubtotal = line.taxable ? line.netCents : 0;
      const service = line.serviceChargeCents;
      const taxableFees = line.taxableFeeCents;
      switch (tax.base) {
        case "SUBTOTAL": return subtotal;
        case "TAXABLE_SUBTOTAL": return taxableSubtotal;
        case "SERVICE_CHARGE": return service;
        case "SUBTOTAL_AND_SERVICE_CHARGE": return addExact(subtotal, service, "Tax basis");
        case "TAXABLE_SUBTOTAL_AND_SERVICE_CHARGE": return addExact(taxableSubtotal, service, "Tax basis");
        case "TAXABLE_SUBTOTAL_SERVICE_AND_FEES": return addExact(addExact(taxableSubtotal, service, "Tax basis"), taxableFees, "Tax basis");
        default: throw new Error(`Unsupported tax base: ${String(tax.base)}`);
      }
    });
    const basisCents = contributions.reduce((total, value) => addExact(total, value, "Tax basis"), 0);
    const amountCents = percentageOf(basisCents, tax.percentage);
    const allocations = allocate(amountCents, indices, (_, position) => contributions[position] ?? 0, tax.label);
    indices.forEach((lineIndex, position) => { rawLines[lineIndex]!.taxCents += allocations[position]!; });
    taxes.push({ id: tax.id ?? `tax-${index + 1}`, label: tax.label, percentage: normalizeFnbPercentage(tax.percentage), basisCents, amountCents });
    trace.push({ code: "TAX_RATE", label: tax.label, amountCents, basisCents });
  }
  const taxCents = taxes.reduce((total, tax) => addExact(total, tax.amountCents, "Taxes"), 0);
  const itemDiscountCents = addExact(embeddedItemDiscountCents, scopedDiscountCents, "Item/category discounts");
  const totalCents = [subtotalAfterDiscountsCents, serviceChargeCents, taxCents, feeCents].reduce((total, value) => addExact(total, value, "Order total"), 0);
  const lines = rawLines.map((line) => ({
    id: line.id,
    billedQuantity: line.billedQuantity,
    publishedExtendedCents: line.publishedExtendedCents,
    negotiatedExtendedCents: line.negotiatedExtendedCents,
    extendedCents: line.netCents,
    discountCents: line.discountCents,
    taxableBaseCents: line.taxable ? line.netCents : 0,
    serviceChargeCents: line.serviceChargeCents,
    taxCents: line.taxCents,
    feeCents: line.feeCents,
    totalCents: [line.netCents, line.serviceChargeCents, line.taxCents, line.feeCents].reduce((total, value) => addExact(total, value, "Line total"), 0),
    actualExtendedCents: line.actualExtendedCents,
  }));
  if (lines.reduce((total, line) => addExact(total, line.totalCents, "Line reconciliation"), 0) !== totalCents) {
    throw new Error("Line allocations do not reconcile to the order total");
  }

  const hasActuals = lines.every((line) => line.actualExtendedCents !== null);
  const actualSubtotalCents = hasActuals
    ? lines.reduce((total, line) => addExact(total, line.actualExtendedCents as number, "Actual subtotal"), 0)
    : null;
  let actualTotalCents: number | null = null;
  if (actualSubtotalCents !== null) {
    const actualDiscount = input.actualAdjustments?.discountCents ?? 0;
    const actualService = input.actualAdjustments?.serviceChargeCents ?? 0;
    const actualTax = input.actualAdjustments?.taxCents ?? 0;
    const actualFee = input.actualAdjustments?.feeCents ?? 0;
    for (const [label, value] of [["Actual discount", actualDiscount], ["Actual service charge", actualService], ["Actual tax", actualTax], ["Actual fee", actualFee]] as const) assertCents(value, label);
    if (actualDiscount > actualSubtotalCents) throw new Error("Actual discount exceeds actual subtotal");
    actualTotalCents = [actualSubtotalCents - actualDiscount, actualService, actualTax, actualFee].reduce((total, value) => addExact(total, value, "Actual total"), 0);
  }
  const varianceCents = actualTotalCents === null ? null : addSignedExact(actualTotalCents, -totalCents, "Actual variance");
  trace.push(
    { code: "PUBLISHED_SUBTOTAL", label: "Published subtotal", amountCents: publishedSubtotalCents },
    { code: "NEGOTIATED_SAVINGS", label: "Negotiated-price savings", amountCents: -negotiatedSavingsCents },
    { code: "ITEM_DISCOUNTS", label: "Item discounts", amountCents: -itemDiscountCents },
    { code: "ORDER_DISCOUNTS", label: "Order discounts", amountCents: -orderDiscountCents },
    { code: "SERVICE_CHARGE", label: "Service charge", amountCents: serviceChargeCents, basisCents: subtotalAfterDiscountsCents },
    { code: "TAX", label: "Tax", amountCents: taxCents, basisCents: taxes.reduce((total, tax) => addExact(total, tax.basisCents, "Tax trace basis"), 0) },
    { code: "FEES", label: "Other fees", amountCents: feeCents },
    { code: "TOTAL", label: "Final estimate", amountCents: totalCents },
  );
  return { currency, publishedSubtotalCents, negotiatedSavingsCents, itemDiscountCents, orderDiscountCents, subtotalAfterDiscountsCents, serviceChargeCents, taxCents, feeCents, totalCents, actualSubtotalCents, actualTotalCents, varianceCents, lines, taxes, fees, trace };
}

function percentageText(value: unknown): string {
  if (value === null || typeof value === "undefined") return "0";
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error("Percentage must be numeric");
  }
  const normalized = String(value).trim();
  return normalized || "0";
}

export function normalizeFnbPercentage(value: unknown): string {
  const normalized = percentageText(value);
  if (!/^\d+(?:\.\d{1,4})?$/.test(normalized)) {
    throw new Error("Percentage must be a number with no more than four decimal places");
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error("Percentage must be between 0 and 100");
  }
  return parsed.toFixed(4);
}

export function fnbPercentageUnits(value: string | number): number {
  return Math.round(Number(normalizeFnbPercentage(value)) * FNB_PERCENT_SCALE);
}

export function calculateFnbPercentageCents(subtotalCents: number, percentage: string | number): number {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) {
    throw new Error("Subtotal must be a non-negative whole number of cents");
  }
  const numerator = BigInt(subtotalCents) * BigInt(fnbPercentageUnits(percentage));
  const denominator = BigInt(FNB_PERCENT_DENOMINATOR);
  return Number((numerator + denominator / BigInt(2)) / denominator);
}

export function calculateFnbAssignmentCost(input: {
  subtotalCents: number | null;
  taxPercent: string | number;
  serviceChargePercent: string | number;
  itemTaxes?: readonly FnbTaxRateInput[];
}): FnbAssignmentCostBreakdown {
  if (input.subtotalCents === null) {
    return {
      subtotalCents: null,
      taxCents: null,
      serviceChargeCents: null,
      additionalTaxCents: null,
      totalCents: null,
    };
  }

  const calculation = calculateFnbOrder({
    lines: [{
      id: "assignment",
      currency: "USD",
      quantity: 1,
      publishedUnitCents: input.subtotalCents,
    }],
    serviceChargePercent: input.serviceChargePercent,
    taxes: [
      { id: "session-tax", label: "Session tax", percentage: input.taxPercent, base: "SUBTOTAL" },
      ...(input.itemTaxes ?? []).map((tax, index) => ({
        id: tax.id ?? `item-tax-${index + 1}`,
        label: tax.label?.trim() || `Item tax ${index + 1}`,
        percentage: tax.percentage,
        base: "SUBTOTAL" as const,
      })),
    ],
  });
  const taxCents = calculation.taxes.find((tax) => tax.id === "session-tax")?.amountCents ?? 0;
  const serviceChargeCents = calculation.serviceChargeCents;
  const additionalTaxCents = calculation.taxes
    .filter((tax) => tax.id !== "session-tax")
    .reduce((total, tax) => addExact(total, tax.amountCents, "Additional taxes"), 0);

  return {
    subtotalCents: input.subtotalCents,
    taxCents,
    serviceChargeCents,
    additionalTaxCents,
    totalCents: calculation.totalCents,
  };
}

/** Canonical adapter shared by server persistence/Budget sync and live UI drafts. */
export function calculateFnbAssignmentFinancials(input: FnbAssignmentFinancialInput): FnbAssignmentFinancialResult {
  const billedQuantity = input.quantity == null
    ? 0
    : Math.max(input.quantity, input.minimumQuantity ?? 0);
  const discountCents = (input.discountUnitCents ?? 0) * billedQuantity;
  if (!Number.isSafeInteger(discountCents) || discountCents < 0) {
    throw new Error("Structured item discount exceeds supported exact-money range");
  }
  if (input.actualTotalCents != null) assertCents(input.actualTotalCents, "Actual total");
  const actualExtendedCents = input.actualTotalCents ?? null;
  const line = input.totalOverrideCents != null
    ? { id: input.id, currency: input.currency, quantity: 1, publishedUnitCents: input.totalOverrideCents, actualExtendedCents }
    : (input.publishedUnitCents != null || input.negotiatedUnitCents != null) && input.quantity != null
      ? {
        id: input.id,
        currency: input.currency,
        quantity: input.quantity,
        minimumQuantity: input.minimumQuantity,
        publishedUnitCents: input.publishedUnitCents,
        negotiatedUnitCents: input.negotiatedUnitCents,
        itemDiscountCents: discountCents,
        actualExtendedCents,
        taxable: input.taxable,
      }
      : input.legacySubtotalCents == null
        ? null
        : { id: input.id, currency: input.currency, quantity: 1, publishedUnitCents: input.legacySubtotalCents, actualExtendedCents };
  if (!line) {
    return {
      breakdown: {
        subtotalCents: null,
        taxCents: null,
        serviceChargeCents: null,
        additionalTaxCents: null,
        totalCents: null,
      },
      order: null,
    };
  }
  const order = calculateFnbOrder({
    lines: [line],
    serviceChargePercent: input.serviceChargePercent,
    taxes: [
      { id: "session-tax", label: "Session tax", percentage: input.taxPercent, base: "TAXABLE_SUBTOTAL" },
      ...(input.itemTaxes ?? []).map((tax, index) => ({
        id: tax.id ?? `item-tax-${index + 1}`,
        label: tax.label?.trim() || `Item tax ${index + 1}`,
        percentage: tax.percentage,
        base: "TAXABLE_SUBTOTAL" as const,
      })),
    ],
  });
  return {
    breakdown: {
      subtotalCents: order.subtotalAfterDiscountsCents,
      taxCents: order.taxes.find((tax) => tax.id === "session-tax")?.amountCents ?? 0,
      serviceChargeCents: order.serviceChargeCents,
      additionalTaxCents: order.taxes
        .filter((tax) => tax.id !== "session-tax")
        .reduce((total, tax) => addExact(total, tax.amountCents, "Additional taxes"), 0),
      totalCents: order.totalCents,
    },
    order,
  };
}

export function calculateFnbPlanCost(input: {
  assignments: readonly FnbAssignmentCostBreakdown[];
  forecastAttendance?: number | null;
}): FnbPlanCostBreakdown {
  const calculable = input.assignments.filter(
    (assignment) =>
      assignment.totalCents !== null &&
      assignment.subtotalCents !== null &&
      assignment.taxCents !== null &&
      assignment.serviceChargeCents !== null &&
      assignment.additionalTaxCents !== null,
  ).map((assignment) => ({
    subtotalCents: assignment.subtotalCents as number,
    taxCents: assignment.taxCents as number,
    serviceChargeCents: assignment.serviceChargeCents as number,
    additionalTaxCents: assignment.additionalTaxCents as number,
    totalCents: assignment.totalCents as number,
  }));
  const subtotalCents = calculable.reduce((total, assignment) => addExact(total, assignment.subtotalCents, "Plan subtotal"), 0);
  const taxCents = calculable.reduce((total, assignment) => addExact(total, assignment.taxCents, "Plan tax"), 0);
  const serviceChargeCents = calculable.reduce((total, assignment) => addExact(total, assignment.serviceChargeCents, "Plan service charge"), 0);
  const additionalTaxCents = calculable.reduce((total, assignment) => addExact(total, assignment.additionalTaxCents, "Plan additional tax"), 0);
  const totalEstimatedCents = calculable.reduce((total, assignment) => addExact(total, assignment.totalCents, "Plan total"), 0);
  const attendance = input.forecastAttendance;

  return {
    subtotalCents,
    taxCents,
    serviceChargeCents,
    additionalTaxCents,
    totalEstimatedCents,
    perPersonCents:
      typeof attendance === "number" && Number.isFinite(attendance) && attendance > 0
        ? Math.round(totalEstimatedCents / attendance)
        : null,
    assignedItemCount: input.assignments.length,
    unpricedItemCount: input.assignments.length - calculable.length,
  };
}
