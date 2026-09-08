/**
 * Canonical priority labels for Leads Intelligence (exhibitor admin).
 * Persisted as numeric priority_score (0–99); display/edit uses these five levels only.
 *
 * Score bands (stable storage contract):
 *   Hot      ≥ 80
 *   High     ≥ 60
 *   Medium   ≥ 40
 *   Low      ≥ 15
 *   Unscored < 15
 *
 * Representative scores written on PATCH when a level is chosen: 90, 72, 52, 28, 0.
 */

export type PriorityLevel = "hot" | "high" | "medium" | "low" | "unscored";

export const PRIORITY_LEVELS: ReadonlyArray<{
  id: PriorityLevel;
  label: string;
  /** Representative score written when user selects this level */
  score: number;
}> = [
  { id: "hot", label: "Hot", score: 90 },
  { id: "high", label: "High", score: 72 },
  { id: "medium", label: "Medium", score: 52 },
  { id: "low", label: "Low", score: 28 },
  { id: "unscored", label: "Unscored", score: 0 }
];

export function scoreToPriorityLevel(score: number): PriorityLevel {
  const s = Math.max(0, Math.min(99, Math.round(Number(score) || 0)));
  if (s >= 80) return "hot";
  if (s >= 60) return "high";
  if (s >= 40) return "medium";
  if (s >= 15) return "low";
  return "unscored";
}

export function priorityLevelToScore(level: PriorityLevel): number {
  const row = PRIORITY_LEVELS.find((p) => p.id === level);
  return row?.score ?? 0;
}

/** Single source of truth for display strings */
export function priorityLevelLabel(level: PriorityLevel): string {
  return PRIORITY_LEVELS.find((p) => p.id === level)?.label ?? "Unscored";
}

/** Hot tier and above — matches filter KPI and tab (score ≥ 80) */
export function isHotOrAbovePriorityScore(score: number): boolean {
  return Math.max(0, Math.min(99, Math.round(Number(score) || 0))) >= 80;
}

/**
 * Solid / muted pairs for charts, KPI dots, and any non-pill priority accents.
 * Hue families match {@link priorityLevelChipClass} (Hot = red, High = fuchsia, not red-pink pairs).
 */
export const PRIORITY_LEVEL_ACCENT: Record<
  PriorityLevel,
  { color: string; text: string; bg: string }
> = {
  hot: { color: "bg-red-500", text: "text-red-800", bg: "bg-red-50" },
  high: { color: "bg-fuchsia-500", text: "text-fuchsia-800", bg: "bg-fuchsia-50" },
  medium: { color: "bg-amber-500", text: "text-amber-800", bg: "bg-amber-50" },
  low: { color: "bg-blue-500", text: "text-blue-800", bg: "bg-blue-50" },
  unscored: { color: "bg-slate-400", text: "text-slate-700", bg: "bg-slate-100" }
};

/**
 * Priority chips — soft fills + inset rings. Hue families are deliberately **non-adjacent** so
 * Hot (warm red) and High (magenta-plum) never read as the same tier at a glance.
 * Single source for closed trigger, dropdown option chips, and hover/focus affordances.
 */
export function priorityLevelChipClass(level: PriorityLevel): string {
  switch (level) {
    case "hot":
      return [
        "bg-red-50 text-red-950 shadow-sm",
        "ring-1 ring-inset ring-red-400/55",
        "transition-colors duration-150",
        "hover:bg-red-100 hover:ring-red-500/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/45 focus-visible:ring-offset-1 focus-visible:ring-offset-white"
      ].join(" ");
    case "high":
      return [
        "bg-fuchsia-50 text-fuchsia-950 shadow-sm",
        "ring-1 ring-inset ring-fuchsia-400/50",
        "transition-colors duration-150",
        "hover:bg-fuchsia-100/95 hover:ring-fuchsia-500/45",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-white"
      ].join(" ");
    case "medium":
      return [
        "bg-amber-50 text-amber-950 shadow-sm",
        "ring-1 ring-inset ring-amber-400/45",
        "transition-colors duration-150",
        "hover:bg-amber-100 hover:ring-amber-500/45",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-white"
      ].join(" ");
    case "low":
      return [
        "bg-blue-50 text-blue-950 shadow-sm",
        "ring-1 ring-inset ring-blue-400/45",
        "transition-colors duration-150",
        "hover:bg-blue-100 hover:ring-blue-500/45",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-white"
      ].join(" ");
    default:
      return [
        "bg-slate-100 text-slate-800 shadow-sm",
        "ring-1 ring-inset ring-slate-400/40",
        "transition-colors duration-150",
        "hover:bg-slate-200/90 hover:ring-slate-500/35",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/35 focus-visible:ring-offset-1 focus-visible:ring-offset-white"
      ].join(" ");
  }
}
