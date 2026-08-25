export const BUDGET_GROUP_COLOR_TONES = [
  {
    key: "blue",
    pill: "border-blue-200 bg-blue-50 text-blue-700",
    dot: "bg-blue-500",
    bar: "bg-blue-500",
    text: "text-blue-700",
  },
  {
    key: "emerald",
    pill: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    text: "text-emerald-700",
  },
  {
    key: "violet",
    pill: "border-violet-200 bg-violet-50 text-violet-700",
    dot: "bg-violet-500",
    bar: "bg-violet-500",
    text: "text-violet-700",
  },
  {
    key: "amber",
    pill: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
    text: "text-amber-800",
  },
  {
    key: "cyan",
    pill: "border-cyan-200 bg-cyan-50 text-cyan-700",
    dot: "bg-cyan-500",
    bar: "bg-cyan-500",
    text: "text-cyan-700",
  },
  {
    key: "pink",
    pill: "border-pink-200 bg-pink-50 text-pink-700",
    dot: "bg-pink-500",
    bar: "bg-pink-500",
    text: "text-pink-700",
  },
] as const;

export type BudgetGroupColorTone = (typeof BUDGET_GROUP_COLOR_TONES)[number];
export type BudgetGroupColorKey = BudgetGroupColorTone["key"];

const BUDGET_GROUP_COLOR_KEYS = new Set<string>(BUDGET_GROUP_COLOR_TONES.map((tone) => tone.key));

export function normalizedBudgetGroupName(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function stableBudgetGroupColorHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function normalizeBudgetGroupColor(value: string | null | undefined): BudgetGroupColorKey | null {
  if (!value) return null;
  return BUDGET_GROUP_COLOR_KEYS.has(value) ? (value as BudgetGroupColorKey) : null;
}

export function budgetGroupFallbackColorKey(
  groupId: string | null | undefined,
  groupName: string | null | undefined,
): BudgetGroupColorKey | null {
  const key = groupId || normalizedBudgetGroupName(groupName ?? "");
  if (!key) return null;
  return BUDGET_GROUP_COLOR_TONES[stableBudgetGroupColorHash(key) % BUDGET_GROUP_COLOR_TONES.length].key;
}

export function nextBudgetGroupColorKey(existingColors: Array<string | null | undefined>): BudgetGroupColorKey {
  const counts = new Map<BudgetGroupColorKey, number>();
  for (const tone of BUDGET_GROUP_COLOR_TONES) counts.set(tone.key, 0);
  for (const color of existingColors) {
    const normalized = normalizeBudgetGroupColor(color);
    if (normalized) counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return [...BUDGET_GROUP_COLOR_TONES].sort(
    (a, b) => (counts.get(a.key) ?? 0) - (counts.get(b.key) ?? 0),
  )[0].key;
}

export function budgetGroupColorTone(
  groupId: string | null | undefined,
  groupName: string | null | undefined,
  color?: string | null | undefined,
): BudgetGroupColorTone | null {
  const colorKey = normalizeBudgetGroupColor(color) ?? budgetGroupFallbackColorKey(groupId, groupName);
  if (!colorKey) return null;
  return BUDGET_GROUP_COLOR_TONES.find((tone) => tone.key === colorKey) ?? null;
}

export function budgetGroupTagClasses(
  groupId: string | null | undefined,
  groupName: string | null | undefined,
  color?: string | null | undefined,
): string {
  return budgetGroupColorTone(groupId, groupName, color)?.pill ?? "border-dashed border-slate-200 bg-slate-50 text-slate-500";
}
