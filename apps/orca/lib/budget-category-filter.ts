export const BUDGET_CATEGORY_OPTIONS = [
  "Venue",
  "Housing",
  "F&B",
  "AV & Production",
  "Speakers",
  "Registration & Technology",
  "Marketing",
  "Staffing",
  "Transportation",
  "Exhibits & Sponsorship",
  "Décor & Branding",
  "Contingency",
] as const;

export type BudgetCategory = (typeof BUDGET_CATEGORY_OPTIONS)[number];

export type BudgetCategoryPillStyle = {
  key: string;
  className: string;
  dot: string;
  bar: string;
  text: string;
  ring: string;
};

export const BUDGET_CATEGORY_PILL_STYLES: Record<BudgetCategory, BudgetCategoryPillStyle> = {
  Venue: {
    key: "blue",
    className: "border border-blue-200 bg-blue-50 text-blue-700",
    dot: "bg-blue-500",
    bar: "bg-blue-500",
    text: "text-blue-700",
    ring: "ring-blue-300",
  },
  Housing: {
    key: "purple",
    className: "border border-purple-200 bg-purple-50 text-purple-700",
    dot: "bg-purple-500",
    bar: "bg-purple-500",
    text: "text-purple-700",
    ring: "ring-purple-300",
  },
  "F&B": {
    key: "amber",
    className: "border border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
    text: "text-amber-800",
    ring: "ring-amber-300",
  },
  "AV & Production": {
    key: "indigo",
    className: "border border-indigo-200 bg-indigo-50 text-indigo-700",
    dot: "bg-indigo-500",
    bar: "bg-indigo-500",
    text: "text-indigo-700",
    ring: "ring-indigo-300",
  },
  Speakers: {
    key: "rose",
    className: "border border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
    bar: "bg-rose-500",
    text: "text-rose-700",
    ring: "ring-rose-300",
  },
  "Registration & Technology": {
    key: "cyan",
    className: "border border-cyan-200 bg-cyan-50 text-cyan-800",
    dot: "bg-cyan-500",
    bar: "bg-cyan-500",
    text: "text-cyan-800",
    ring: "ring-cyan-300",
  },
  Marketing: {
    key: "pink",
    className: "border border-pink-200 bg-pink-50 text-pink-700",
    dot: "bg-pink-500",
    bar: "bg-pink-500",
    text: "text-pink-700",
    ring: "ring-pink-300",
  },
  Staffing: {
    key: "teal",
    className: "border border-teal-200 bg-teal-50 text-teal-700",
    dot: "bg-teal-500",
    bar: "bg-teal-500",
    text: "text-teal-700",
    ring: "ring-teal-300",
  },
  Transportation: {
    key: "slate",
    className: "border border-slate-200 bg-slate-50 text-slate-700",
    dot: "bg-slate-500",
    bar: "bg-slate-500",
    text: "text-slate-700",
    ring: "ring-slate-300",
  },
  "Exhibits & Sponsorship": {
    key: "emerald",
    className: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    text: "text-emerald-700",
    ring: "ring-emerald-300",
  },
  "Décor & Branding": {
    key: "violet",
    className: "border border-violet-200 bg-violet-50 text-violet-700",
    dot: "bg-violet-500",
    bar: "bg-violet-500",
    text: "text-violet-700",
    ring: "ring-violet-300",
  },
  Contingency: {
    key: "gray",
    className: "border border-gray-200 bg-gray-50 text-gray-700",
    dot: "bg-gray-500",
    bar: "bg-gray-500",
    text: "text-gray-700",
    ring: "ring-gray-300",
  },
};

export const BUDGET_CATEGORY_DEFAULT_PILL_STYLE: BudgetCategoryPillStyle = {
  key: "default",
  className: "border border-slate-200 bg-slate-50 text-slate-600",
  dot: "bg-slate-400",
  bar: "bg-slate-400",
  text: "text-slate-600",
  ring: "ring-slate-300",
};

function normalizeBudgetFilterText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeBudgetCategoryLookupKey(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\band\b/gi, "&")
    .toUpperCase();
}

const BUDGET_CATEGORY_ALIAS_MAP: Record<string, BudgetCategory> = {
  VENUE: "Venue",
  LOCATION: "Venue",

  HOUSING: "Housing",
  ROOMS: "Housing",
  ROOM: "Housing",
  "GUEST ROOMS": "Housing",
  "SLEEPING ROOMS": "Housing",
  "ROOM BLOCK": "Housing",
  "HOTEL ROOMS": "Housing",

  "F&B": "F&B",
  FNB: "F&B",
  "F & B": "F&B",
  "FOOD & BEVERAGE": "F&B",
  CATERING: "F&B",

  "AV & PRODUCTION": "AV & Production",
  AV: "AV & Production",
  "A/V": "AV & Production",
  "AUDIO VISUAL": "AV & Production",
  AUDIOVISUAL: "AV & Production",
  PRODUCTION: "AV & Production",

  SPEAKERS: "Speakers",
  SPEAKER: "Speakers",
  TALENT: "Speakers",

  "REGISTRATION & TECHNOLOGY": "Registration & Technology",
  REGISTRATION: "Registration & Technology",
  TECHNOLOGY: "Registration & Technology",
  TECH: "Registration & Technology",
  "REG TECH": "Registration & Technology",

  MARKETING: "Marketing",

  STAFFING: "Staffing",
  STAFF: "Staffing",
  LABOR: "Staffing",

  TRANSPORTATION: "Transportation",
  TRANSPORT: "Transportation",
  TRAVEL: "Transportation",

  "EXHIBITS & SPONSORSHIP": "Exhibits & Sponsorship",
  EXHIBITS: "Exhibits & Sponsorship",
  EXHIBIT: "Exhibits & Sponsorship",
  SPONSORSHIP: "Exhibits & Sponsorship",
  SPONSORSHIPS: "Exhibits & Sponsorship",
  SPONSORS: "Exhibits & Sponsorship",

  "DECOR & BRANDING": "Décor & Branding",
  DECOR: "Décor & Branding",
  DECORATION: "Décor & Branding",
  DESIGN: "Décor & Branding",
  BRANDING: "Décor & Branding",

  CONTINGENCY: "Contingency",
  GENERAL: "Contingency",
  OTHER: "Contingency",
  OPS: "Contingency",
  OPERATIONS: "Contingency",
  MISC: "Contingency",
  MISCELLANEOUS: "Contingency",
  UNCATEGORIZED: "Contingency",
};

const BUDGET_CATEGORY_ORDER = new Map<string, number>(
  BUDGET_CATEGORY_OPTIONS.map((category, index) => [category, index]),
);

export function resolveBudgetCategory(value: string | null | undefined): BudgetCategory | null {
  const key = normalizeBudgetCategoryLookupKey(value);
  if (!key) return null;
  return BUDGET_CATEGORY_ALIAS_MAP[key] ?? null;
}

export function getBudgetCategoryDisplay(value: string | null | undefined): string {
  return resolveBudgetCategory(value) ?? (value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeBudgetCategoryForStorage(value: string | null | undefined): string {
  const display = getBudgetCategoryDisplay(value);
  return display || "Contingency";
}

export function getBudgetCategoryPillStyle(value: string | null | undefined): BudgetCategoryPillStyle {
  const category = resolveBudgetCategory(value);
  return category ? BUDGET_CATEGORY_PILL_STYLES[category] : BUDGET_CATEGORY_DEFAULT_PILL_STYLE;
}

export function budgetCategoryPillClasses(value: string | null | undefined): string {
  return getBudgetCategoryPillStyle(value).className;
}

export function compareBudgetCategories(left: string, right: string): number {
  const leftDisplay = getBudgetCategoryDisplay(left);
  const rightDisplay = getBudgetCategoryDisplay(right);
  const leftOrder = BUDGET_CATEGORY_ORDER.get(leftDisplay);
  const rightOrder = BUDGET_CATEGORY_ORDER.get(rightDisplay);
  if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
  if (leftOrder !== undefined) return -1;
  if (rightOrder !== undefined) return 1;
  return leftDisplay.localeCompare(rightDisplay);
}

export function buildBudgetCategoryMatchKeys(value: string | null | undefined): string[] {
  const rawKey = normalizeBudgetFilterText(value);
  if (!rawKey) return [];

  const keys = new Set<string>([rawKey]);
  const resolvedCategory = resolveBudgetCategory(value);
  if (resolvedCategory) {
    keys.add(normalizeBudgetFilterText(resolvedCategory));
  }

  return Array.from(keys);
}

export function budgetCategoriesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const leftKeys = buildBudgetCategoryMatchKeys(left);
  const rightKeys = buildBudgetCategoryMatchKeys(right);
  if (leftKeys.length === 0 || rightKeys.length === 0) return false;

  const rightKeySet = new Set(rightKeys);
  return leftKeys.some((key) => rightKeySet.has(key));
}

export function budgetFilterValuesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const leftKey = normalizeBudgetFilterText(left);
  const rightKey = normalizeBudgetFilterText(right);
  return leftKey.length > 0 && leftKey === rightKey;
}

export function addBudgetCategoryFilterOption(target: Set<string>, value: string | null | undefined): void {
  const trimmed = getBudgetCategoryDisplay(value);
  if (trimmed) {
    target.add(trimmed);
  }
}
