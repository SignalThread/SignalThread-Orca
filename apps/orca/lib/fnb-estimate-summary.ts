export type FnbEstimateLineInput = {
  totalCents: number | null;
  budgetedCents?: number | null;
};

export type FnbEstimateFeeInput = {
  serviceFeeCents?: number | null;
  taxCents?: number | null;
  staffingFeeCents?: number | null;
};

export type FnbEstimateVariance = {
  amountCents: number;
  percentage: number | null;
  direction: "over" | "under" | "even";
};

export type FnbEstimateSummary = {
  subtotalCents: number;
  serviceFeeCents: number | null;
  taxCents: number | null;
  staffingFeeCents: number | null;
  feeTotalCents: number;
  totalEstimatedCents: number;
  budgetedCents: number | null;
  perPersonCents: number | null;
  variance: FnbEstimateVariance | null;
  assignedItemCount: number;
  unpricedItemCount: number;
  needsAttention: string[];
};

function isUsableCents(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0;
}

export function sumFnbSubtotalCents(lines: FnbEstimateLineInput[]): number {
  return lines.reduce((total, line) => total + (isUsableCents(line.totalCents) ? line.totalCents : 0), 0);
}

export function countUnpricedFnbItems(lines: FnbEstimateLineInput[]): number {
  return lines.filter((line) => line.totalCents === null).length;
}

export function sumFnbBudgetedCents(lines: FnbEstimateLineInput[]): number | null {
  const budgetedLines = lines.filter((line) => isUsableCents(line.budgetedCents));
  if (budgetedLines.length === 0) return null;
  return budgetedLines.reduce((total, line) => total + (line.budgetedCents ?? 0), 0);
}

export function calculateFnbFeeTotalCents(input: FnbEstimateFeeInput): number {
  const values: Array<number | null | undefined> = [input.serviceFeeCents, input.taxCents, input.staffingFeeCents];
  return values.reduce<number>(
    (total, value) => total + (isUsableCents(value) ? value : 0),
    0,
  );
}

export function calculateFnbTotalCents(input: FnbEstimateFeeInput & { subtotalCents: number }): number {
  return input.subtotalCents + calculateFnbFeeTotalCents(input);
}

export function calculateFnbPerPersonCents(totalCents: number, forecastAttendance: number | null | undefined): number | null {
  if (!Number.isFinite(forecastAttendance) || !forecastAttendance || forecastAttendance <= 0) return null;
  return Math.round(totalCents / forecastAttendance);
}

export function calculateFnbVarianceToBudget(totalCents: number, budgetedCents: number | null | undefined): FnbEstimateVariance | null {
  if (!isUsableCents(budgetedCents)) return null;
  const amountCents = totalCents - budgetedCents;
  const direction = amountCents > 0 ? "over" : amountCents < 0 ? "under" : "even";
  const percentage = budgetedCents > 0 ? Math.abs(amountCents) / budgetedCents : null;
  return { amountCents, percentage, direction };
}

export function buildFnbEstimateNeedsAttention(input: {
  forecastAttendance: number | null | undefined;
  budgetedCents: number | null;
  assignedItemCount: number;
  unpricedItemCount: number;
}): string[] {
  const items: string[] = [];
  if (!Number.isFinite(input.forecastAttendance) || !input.forecastAttendance || input.forecastAttendance <= 0) {
    items.push("Missing forecast attendance");
  }
  if (input.budgetedCents === null) {
    items.push("Missing budget");
  }
  if (input.assignedItemCount === 0) {
    items.push("No F&B items selected");
  }
  if (input.unpricedItemCount > 0) {
    items.push(`${input.unpricedItemCount} selected item${input.unpricedItemCount === 1 ? "" : "s"} missing price`);
  }
  return items;
}

export function buildFnbEstimateSummary(input: FnbEstimateFeeInput & {
  lines: FnbEstimateLineInput[];
  forecastAttendance: number | null | undefined;
  budgetedCents?: number | null;
}): FnbEstimateSummary {
  const subtotalCents = sumFnbSubtotalCents(input.lines);
  const serviceFeeCents = isUsableCents(input.serviceFeeCents) ? input.serviceFeeCents : null;
  const taxCents = isUsableCents(input.taxCents) ? input.taxCents : null;
  const staffingFeeCents = isUsableCents(input.staffingFeeCents) ? input.staffingFeeCents : null;
  const feeTotalCents = calculateFnbFeeTotalCents({ serviceFeeCents, taxCents, staffingFeeCents });
  const totalEstimatedCents = subtotalCents + feeTotalCents;
  const budgetedCents = isUsableCents(input.budgetedCents) ? input.budgetedCents : sumFnbBudgetedCents(input.lines);
  const unpricedItemCount = countUnpricedFnbItems(input.lines);
  const assignedItemCount = input.lines.length;

  return {
    subtotalCents,
    serviceFeeCents,
    taxCents,
    staffingFeeCents,
    feeTotalCents,
    totalEstimatedCents,
    budgetedCents,
    perPersonCents: calculateFnbPerPersonCents(totalEstimatedCents, input.forecastAttendance),
    variance: calculateFnbVarianceToBudget(totalEstimatedCents, budgetedCents),
    assignedItemCount,
    unpricedItemCount,
    needsAttention: buildFnbEstimateNeedsAttention({
      forecastAttendance: input.forecastAttendance,
      budgetedCents,
      assignedItemCount,
      unpricedItemCount,
    }),
  };
}
