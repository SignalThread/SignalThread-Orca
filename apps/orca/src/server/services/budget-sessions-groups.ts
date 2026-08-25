/**
 * Budget sessions, groups, and category targets.
 *
 * Foundation service for the budget sections redesign. Sessions are canonical
 * Run of Show MatrixRow records; groups are user-defined BudgetGroup records;
 * category targets persist in BudgetCategoryTarget. All session/group/category
 * "totals" returned here are DERIVED from BudgetLineItem rows and are never an
 * authoritative store of money — only group definitions and category targets
 * are persisted.
 */
import { Prisma, type BudgetLineItem } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getBudgetCategoryDisplay, normalizeBudgetCategoryForStorage } from "@/lib/budget-category-filter";
import {
  budgetGroupFallbackColorKey,
  nextBudgetGroupColorKey,
  normalizeBudgetGroupColor,
} from "@/lib/budget-group-colors";
import {
  assertBudgetAccessForEvent,
  BudgetServiceError,
  getBudgetForEventReadOnly,
  getOrCreateBudgetForEvent,
  type BudgetAccessUser,
} from "@/src/server/services/budget";
import {
  calculateBudgetCategoryHealth,
  type BudgetHealth,
} from "@/lib/budget-money";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A Run of Show session offered as a budget-row session link option. */
export type BudgetSessionOption = {
  id: string;
  title: string;
  dayDate: Date;
  startTime: Date | null;
  roomName: string | null;
};

/** Derived money totals for an arbitrary slice of budget rows. */
export type DerivedBudgetTotals = {
  forecastCents: number;
  actualCents: number;
  rowCount: number;
};

export type SessionBudgetTotal = DerivedBudgetTotals & {
  sessionId: string;
  sessionTitle: string | null;
};

export type GroupBudgetTotal = DerivedBudgetTotals & {
  groupId: string;
  groupName: string;
  groupColor: string | null;
};

export type CategoryBudgetTotal = DerivedBudgetTotals & {
  categoryKey: string;
  categoryLabel: string;
  remainingCents: number;
  utilizationPercent: number;
  budgetHealth: BudgetHealth;
};

export type BudgetCategoryTargetRecord = {
  id: string;
  categoryKey: string;
  categoryLabel: string | null;
  targetAmountCents: number;
};

type TotalsRow = Pick<BudgetLineItem, "forecastCents" | "actualCents">;

// ---------------------------------------------------------------------------
// Pure helpers (no DB) — unit-testable
// ---------------------------------------------------------------------------

/**
 * Normalize a user-entered group/category name into a stable display name and a
 * comparison key. Collapses internal whitespace and trims; the normalized key is
 * lowercased so "F&B", "f&b", and " f&b " all collide within a budget scope.
 */
export function normalizeGroupName(rawName: unknown): { name: string; normalizedName: string } {
  if (typeof rawName !== "string") {
    throw new BudgetServiceError("Group name is required", 400);
  }
  const name = rawName.replace(/\s+/g, " ").trim();
  if (name.length === 0) {
    throw new BudgetServiceError("Group name is required", 400);
  }
  return { name, normalizedName: name.toLowerCase() };
}

/** Sum forecast/actual cents and row count over a row slice. */
export function sumDerivedTotals(rows: TotalsRow[]): DerivedBudgetTotals {
  let forecastCents = 0;
  let actualCents = 0;
  for (const row of rows) {
    forecastCents += row.forecastCents;
    actualCents += row.actualCents;
  }
  return { forecastCents, actualCents, rowCount: rows.length };
}

type GroupMini = { id: string; name: string; color: string | null; sortOrder: number };

/**
 * Build active derived totals per group from DB-aggregated per-group totals,
 * preserving group sort order. Persisted groups without a current line-item
 * assignment remain available for future reuse, but are not active groups.
 */
export function buildGroupTotals(
  groups: GroupMini[],
  totalsByGroupId: Map<string, DerivedBudgetTotals>,
): GroupBudgetTotal[] {
  return [...groups]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .flatMap((group) => {
      const totals = totalsByGroupId.get(group.id);
      if (!totals || totals.rowCount === 0) return [];
      return [{
        groupId: group.id,
        groupName: group.name,
        groupColor: group.color,
        ...totals,
      }];
    });
}

type CategoryTotalsInput = TotalsRow & { category: string; rowCount: number };

/**
 * Build derived category totals from canonical line-item money. Raw categories
 * are collapsed to their display key (so "F&B"/"f&b" merge). Health always
 * uses only canonical line-item Forecast and Actual; saved category targets
 * remain separate planning metadata and never alter dashboard financials.
 */
export function buildCategoryTotals(
  categoryTotals: CategoryTotalsInput[],
): CategoryBudgetTotal[] {
  const byCategory = new Map<string, { forecastCents: number; actualCents: number; rowCount: number; rows: CategoryTotalsInput[] }>();
  for (const row of categoryTotals) {
    const category = getBudgetCategoryDisplay(row.category) || "Contingency";
    const existing = byCategory.get(category) ?? { forecastCents: 0, actualCents: 0, rowCount: 0, rows: [] };
    existing.forecastCents += row.forecastCents;
    existing.actualCents += row.actualCents;
    existing.rowCount += row.rowCount;
    existing.rows.push(row);
    byCategory.set(category, existing);
  }
  return [...byCategory.entries()]
    .map(([categoryKey, totals]) => {
      const health = calculateBudgetCategoryHealth(totals.rows);
      return {
        categoryKey,
        categoryLabel: getBudgetCategoryDisplay(categoryKey),
        forecastCents: health.forecastCents,
        actualCents: health.actualCents,
        remainingCents: health.remainingCents,
        utilizationPercent: health.utilizationPercent,
        budgetHealth: health.budgetHealth,
        rowCount: totals.rowCount,
      };
    })
    .sort((a, b) => a.categoryLabel.localeCompare(b.categoryLabel));
}

function normalizeTargetAmountCents(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BudgetServiceError("targetAmountCents must be a number", 400);
  }
  if (!Number.isInteger(value)) {
    throw new BudgetServiceError("targetAmountCents must be an integer number of cents", 400);
  }
  if (value < 0) {
    throw new BudgetServiceError("targetAmountCents must be non-negative", 400);
  }
  return value;
}

function normalizeCategoryKey(value: unknown): string {
  if (typeof value !== "string") {
    throw new BudgetServiceError("categoryKey is required", 400);
  }
  if (value.trim().length === 0) {
    throw new BudgetServiceError("categoryKey is required", 400);
  }
  return normalizeBudgetCategoryForStorage(value);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Canonical Run of Show sessions selectable as a budget-row session link. */
export async function listBudgetSessionOptions(eventId: string): Promise<BudgetSessionOption[]> {
  const rows = await getPrisma().matrixRow.findMany({
    where: { eventId },
    select: { id: true, sessionName: true, dayDate: true, startTime: true, roomName: true },
    orderBy: [{ dayDate: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.sessionName?.trim() || "Untitled session",
    dayDate: row.dayDate,
    startTime: row.startTime,
    roomName: row.roomName,
  }));
}

/**
 * Assign (or clear, with `null`) the canonical session link on a budget row.
 * Validates write access and that the MatrixRow belongs to the same event so a
 * row can never point at another event's session.
 */
export async function assignSessionToLineItem(
  eventId: string,
  lineItemId: string,
  matrixRowId: string | null,
  user: BudgetAccessUser,
): Promise<BudgetLineItem> {
  await assertBudgetAccessForEvent(eventId, user, "write");
  const budget = await getOrCreateBudgetForEvent(eventId);

  const lineItem = await getPrisma().budgetLineItem.findFirst({
    where: { id: lineItemId, budgetId: budget.id },
    select: { id: true },
  });
  if (!lineItem) {
    throw new BudgetServiceError("Line item not found", 404);
  }

  if (matrixRowId) {
    const session = await getPrisma().matrixRow.findFirst({
      where: { id: matrixRowId, eventId },
      select: { id: true },
    });
    if (!session) {
      throw new BudgetServiceError("Session is not part of this event", 400);
    }
  }

  return getPrisma().budgetLineItem.update({
    where: { id: lineItemId },
    data: { matrixRowId },
  });
}

/** Derived total for one session's budget rows. */
export async function getSessionBudgetTotal(eventId: string, matrixRowId: string): Promise<SessionBudgetTotal> {
  // Read path (totals only): resolve read-only and aggregate in the DB.
  const budget = await getBudgetForEventReadOnly(eventId);
  const session = await getPrisma().matrixRow.findFirst({ where: { id: matrixRowId, eventId }, select: { sessionName: true } });
  const sessionTitle = session?.sessionName?.trim() || null;
  if (!budget) {
    return { sessionId: matrixRowId, sessionTitle, forecastCents: 0, actualCents: 0, rowCount: 0 };
  }
  const agg = await getPrisma().budgetLineItem.aggregate({
    where: { budgetId: budget.id, matrixRowId },
    _sum: { forecastCents: true, actualCents: true },
    _count: { _all: true },
  });
  return {
    sessionId: matrixRowId,
    sessionTitle,
    forecastCents: agg._sum.forecastCents ?? 0,
    actualCents: agg._sum.actualCents ?? 0,
    rowCount: agg._count._all,
  };
}

/** Combined derived total across one or more selected sessions (grid footer). */
export async function getSessionsBudgetTotal(
  eventId: string,
  matrixRowIds: string[],
): Promise<DerivedBudgetTotals & { sessionCount: number }> {
  const uniqueIds = [...new Set(matrixRowIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { forecastCents: 0, actualCents: 0, rowCount: 0, sessionCount: 0 };
  }
  // Read path: no Budget row yet → no line items to total.
  const budget = await getBudgetForEventReadOnly(eventId);
  if (!budget) {
    return { forecastCents: 0, actualCents: 0, rowCount: 0, sessionCount: uniqueIds.length };
  }
  // Totals-only path: aggregate in the DB across the selected sessions.
  const agg = await getPrisma().budgetLineItem.aggregate({
    where: { budgetId: budget.id, matrixRowId: { in: uniqueIds } },
    _sum: { forecastCents: true, actualCents: true },
    _count: { _all: true },
  });
  return {
    forecastCents: agg._sum.forecastCents ?? 0,
    actualCents: agg._sum.actualCents ?? 0,
    rowCount: agg._count._all,
    sessionCount: uniqueIds.length,
  };
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

type BudgetGroupRecord = { id: string; name: string; normalizedName: string; color: string | null; sortOrder: number };

async function ensureBudgetGroupColors(budgetId: string): Promise<BudgetGroupRecord[]> {
  const groups = await getPrisma().budgetGroup.findMany({
    where: { budgetId },
    select: { id: true, name: true, normalizedName: true, color: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const existingColors: Array<string | null> = [];
  const updates: Array<{ id: string; color: string }> = [];
  for (const group of groups) {
    const color = normalizeBudgetGroupColor(group.color) ?? budgetGroupFallbackColorKey(group.id, group.name);
    const assignedColor = color ?? nextBudgetGroupColorKey(existingColors);
    existingColors.push(assignedColor);
    if (group.color !== assignedColor) updates.push({ id: group.id, color: assignedColor });
  }

  if (updates.length > 0) {
    await getPrisma().$transaction(
      updates.map((update) =>
        getPrisma().budgetGroup.update({
          where: { id: update.id },
          data: { color: update.color },
        }),
      ),
    );
  }

  return groups.map((group) => {
    const update = updates.find((entry) => entry.id === group.id);
    return update ? { ...group, color: update.color } : { ...group, color: normalizeBudgetGroupColor(group.color) };
  });
}

/**
 * Find an existing group by normalized name within the budget, or create one.
 * The unique (budgetId, normalizedName) constraint prevents duplicates even
 * under concurrent creates (P2002 is retried as a find).
 */
export async function createOrFindBudgetGroup(
  eventId: string,
  rawName: unknown,
  user: BudgetAccessUser,
): Promise<{ id: string; name: string; normalizedName: string; color: string | null; sortOrder: number }> {
  await assertBudgetAccessForEvent(eventId, user, "write");
  const { name, normalizedName } = normalizeGroupName(rawName);
  const budget = await getOrCreateBudgetForEvent(eventId);
  const existingGroups = await ensureBudgetGroupColors(budget.id);

  const existing = existingGroups.find((group) => group.normalizedName === normalizedName);
  if (existing) return existing;

  const color = nextBudgetGroupColorKey(existingGroups.map((group) => group.color));
  const sortOrder = Math.max(0, ...existingGroups.map((group) => group.sortOrder)) + 1;

  try {
    return await getPrisma().budgetGroup.create({
      data: {
        budgetId: budget.id,
        name,
        normalizedName,
        color,
        sortOrder,
        createdByUserId: user.id,
      },
      select: { id: true, name: true, normalizedName: true, color: true, sortOrder: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await getPrisma().budgetGroup.findUnique({
        where: { budgetId_normalizedName: { budgetId: budget.id, normalizedName } },
        select: { id: true, name: true, normalizedName: true, color: true, sortOrder: true },
      });
      if (raced) return raced;
    }
    throw error;
  }
}

/** List a budget's active groups for grid selectors, using dashboard-total semantics. */
export async function listBudgetGroups(
  eventId: string,
): Promise<{ id: string; name: string; color: string | null; sortOrder: number }[]> {
  const groups = await getGroupBudgetTotals(eventId);
  return groups.map(({ groupId, groupName, groupColor }, index) => ({
    id: groupId,
    name: groupName,
    color: groupColor,
    sortOrder: index,
  }));
}

/**
 * Permanently delete a budget group. Budget rows survive the delete and are
 * explicitly unassigned first, so no row can retain a dangling groupId.
 */
export async function deleteBudgetGroup(
  eventId: string,
  groupId: string,
  user: BudgetAccessUser,
): Promise<{ id: string; name: string; unassignedLineItemCount: number }> {
  await assertBudgetAccessForEvent(eventId, user, "write");
  const budget = await getOrCreateBudgetForEvent(eventId);

  const group = await getPrisma().budgetGroup.findFirst({
    where: { id: groupId, budgetId: budget.id },
    select: { id: true, name: true },
  });
  if (!group) {
    throw new BudgetServiceError("Group not found", 404);
  }

  const [unassigned] = await getPrisma().$transaction([
    getPrisma().budgetLineItem.updateMany({
      where: { budgetId: budget.id, groupId },
      data: { groupId: null },
    }),
    getPrisma().budgetGroup.delete({
      where: { id: groupId },
    }),
  ]);

  return { id: group.id, name: group.name, unassignedLineItemCount: unassigned.count };
}

/**
 * Assign a budget row to a group (or clear with `null`). Clearing unassigns the
 * row only — it never deletes the group. Validates the group belongs to the
 * same budget.
 */
export async function assignGroupToLineItem(
  eventId: string,
  lineItemId: string,
  groupId: string | null,
  user: BudgetAccessUser,
): Promise<BudgetLineItem> {
  await assertBudgetAccessForEvent(eventId, user, "write");
  const budget = await getOrCreateBudgetForEvent(eventId);

  const lineItem = await getPrisma().budgetLineItem.findFirst({
    where: { id: lineItemId, budgetId: budget.id },
    select: { id: true },
  });
  if (!lineItem) {
    throw new BudgetServiceError("Line item not found", 404);
  }

  if (groupId) {
    const group = await getPrisma().budgetGroup.findFirst({
      where: { id: groupId, budgetId: budget.id },
      select: { id: true },
    });
    if (!group) {
      throw new BudgetServiceError("Group is not part of this budget", 400);
    }
  }

  return getPrisma().budgetLineItem.update({
    where: { id: lineItemId },
    data: { groupId },
  });
}

/** Derived totals per group for the whole budget. */
export async function getGroupBudgetTotals(eventId: string, budgetIdArg?: string): Promise<GroupBudgetTotal[]> {
  const budgetId = budgetIdArg ?? (await getBudgetForEventReadOnly(eventId))?.id ?? null;
  if (!budgetId) {
    return [];
  }
  // Totals-only path: aggregate per group in the DB instead of streaming every
  // grouped line item into JS.
  const [groups, grouped] = await Promise.all([
    ensureBudgetGroupColors(budgetId),
    getPrisma().budgetLineItem.groupBy({
      by: ["groupId"],
      where: { budgetId, groupId: { not: null } },
      _sum: { forecastCents: true, actualCents: true },
      _count: { _all: true },
    }),
  ]);
  const totalsByGroupId = new Map<string, DerivedBudgetTotals>();
  for (const group of grouped) {
    if (!group.groupId) continue;
    totalsByGroupId.set(group.groupId, {
      forecastCents: group._sum.forecastCents ?? 0,
      actualCents: group._sum.actualCents ?? 0,
      rowCount: group._count._all,
    });
  }
  return buildGroupTotals(groups, totalsByGroupId);
}

// ---------------------------------------------------------------------------
// Category targets + totals
// ---------------------------------------------------------------------------

/** Persisted category targets for a budget. */
export async function listBudgetCategoryTargets(eventId: string): Promise<BudgetCategoryTargetRecord[]> {
  // Read path: no Budget row yet → no persisted targets.
  const budget = await getBudgetForEventReadOnly(eventId);
  if (!budget) {
    return [];
  }
  return getPrisma().budgetCategoryTarget.findMany({
    where: { budgetId: budget.id },
    select: { id: true, categoryKey: true, categoryLabel: true, targetAmountCents: true },
    orderBy: { categoryKey: "asc" },
  });
}

/**
 * Create or update a category's target amount. Scoped per budget by categoryKey.
 */
export async function upsertBudgetCategoryTarget(
  eventId: string,
  input: { categoryKey: unknown; categoryLabel?: unknown; targetAmountCents: unknown },
  user: BudgetAccessUser,
): Promise<BudgetCategoryTargetRecord> {
  await assertBudgetAccessForEvent(eventId, user, "write");
  const categoryKey = normalizeCategoryKey(input.categoryKey);
  const targetAmountCents = normalizeTargetAmountCents(input.targetAmountCents);
  const categoryLabel =
    typeof input.categoryLabel === "string" && input.categoryLabel.trim().length > 0
      ? input.categoryLabel.trim()
      : null;
  const budget = await getOrCreateBudgetForEvent(eventId);

  return getPrisma().budgetCategoryTarget.upsert({
    where: { budgetId_categoryKey: { budgetId: budget.id, categoryKey } },
    update: { targetAmountCents, categoryLabel, updatedByUserId: user.id },
    create: {
      budgetId: budget.id,
      categoryKey,
      categoryLabel,
      targetAmountCents,
      createdByUserId: user.id,
      updatedByUserId: user.id,
    },
    select: { id: true, categoryKey: true, categoryLabel: true, targetAmountCents: true },
  });
}

export type BudgetBlocksSummary = {
  categories: CategoryBudgetTotal[];
  groups: GroupBudgetTotal[];
};

/**
 * One payload for the dashboard's block view: category blocks (with targets and
 * over-budget flags) and group blocks. Both are derived from BudgetLineItem rows;
 * only targets and group definitions are persisted.
 */
export async function getBudgetBlocksSummary(eventId: string): Promise<BudgetBlocksSummary> {
  // Read path: resolve the Budget row once (read-only) and pass the id into both
  // total helpers, so category + group summaries do not each upsert/contend on
  // the same Budget row. No Budget row yet → empty blocks.
  const budget = await getBudgetForEventReadOnly(eventId);
  if (!budget) {
    return { categories: [], groups: [] };
  }
  const [categories, groups] = await Promise.all([
    getCategoryBudgetTotals(eventId, budget.id),
    getGroupBudgetTotals(eventId, budget.id),
  ]);
  return { categories, groups };
}

/** Derived category totals merged with persisted targets and canonical health. */
export async function getCategoryBudgetTotals(eventId: string, budgetIdArg?: string): Promise<CategoryBudgetTotal[]> {
  const budgetId = budgetIdArg ?? (await getBudgetForEventReadOnly(eventId))?.id ?? null;
  if (!budgetId) {
    return buildCategoryTotals([]);
  }
  // Read the same persisted Forecast and Actual columns used by the Full Budget
  // Grid, then pass them through the shared canonical money helper.
  const lineItems = await getPrisma().budgetLineItem.findMany({
    where: { budgetId },
    select: { category: true, forecastCents: true, actualCents: true },
  });
  const categoryTotals = lineItems.map((row) => ({
    category: row.category,
    forecastCents: row.forecastCents,
    actualCents: row.actualCents,
    rowCount: 1,
  }));
  return buildCategoryTotals(categoryTotals);
}
