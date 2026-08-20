export type BudgetBlockColumnCount = 1 | 2 | 4;

export const BUDGET_BLOCK_MAX_COLUMNS = 4;
export const BUDGET_BLOCK_MAX_ROWS = 2;
export const BUDGET_BLOCK_WIDE_MIN_WIDTH = 920;
export const BUDGET_BLOCK_TWO_COLUMN_MIN_WIDTH = 560;

export function budgetBlockColumnCountForWidth(width: number): BudgetBlockColumnCount {
  if (width >= BUDGET_BLOCK_WIDE_MIN_WIDTH) return 4;
  if (width >= BUDGET_BLOCK_TWO_COLUMN_MIN_WIDTH) return 2;
  return 1;
}

export function budgetBlockPageSizeForColumns(columns: BudgetBlockColumnCount): number {
  return columns * BUDGET_BLOCK_MAX_ROWS;
}

export function budgetBlockPageCount(itemCount: number, columns: BudgetBlockColumnCount): number {
  return Math.max(1, Math.ceil(Math.max(0, itemCount) / budgetBlockPageSizeForColumns(columns)));
}

export function clampBudgetBlockPageIndex(
  pageIndex: number,
  itemCount: number,
  columns: BudgetBlockColumnCount,
): number {
  const finalPageIndex = budgetBlockPageCount(itemCount, columns) - 1;
  return Math.min(Math.max(0, pageIndex), finalPageIndex);
}

export function budgetBlockPageItems<T>(
  items: readonly T[],
  pageIndex: number,
  columns: BudgetBlockColumnCount,
): T[] {
  const pageSize = budgetBlockPageSizeForColumns(columns);
  const clampedPageIndex = clampBudgetBlockPageIndex(pageIndex, items.length, columns);
  const firstIndex = clampedPageIndex * pageSize;
  return items.slice(firstIndex, firstIndex + pageSize);
}
