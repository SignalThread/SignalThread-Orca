export type PlanningToneIntent = "category" | "session" | "status" | "conflict";

export type PlanningTone = {
  className: string;
  title: string;
};

export const PLANNING_PILL_BASE_CLASS =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold";

export const PLANNING_SELECTED_CLASS =
  "border-[#28439A]/35 bg-white shadow-sm ring-2 ring-[#28439A]/30 ring-offset-1 ring-offset-white";

export const PLANNING_DISABLED_CLASS =
  "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-70";

const neutralTone = "border-slate-200 bg-slate-50 text-slate-700";
const conflictTone = "border-rose-200 bg-rose-50 text-rose-700";

const toneByHue = {
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  blue: "border-blue-200 bg-blue-50 text-blue-800",
  cyan: "border-cyan-200 bg-cyan-50 text-cyan-800",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-800",
  pink: "border-pink-200 bg-pink-50 text-pink-800",
  rose: conflictTone,
  slate: neutralTone,
  violet: "border-violet-200 bg-violet-50 text-violet-800",
} as const;

function normalizeToneValue(value: string): string {
  return value.trim().replace(/[_-]/g, " ").replace(/\s+/g, " ").toLowerCase();
}

function titleSafeValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function categoryTone(value: string): string {
  const normalized = normalizeToneValue(value);
  if (normalized.includes("f&b") || normalized.includes("fnb") || normalized.includes("food") || normalized.includes("catering")) return toneByHue.amber;
  if (normalized.includes("a/v") || normalized.includes("av") || normalized.includes("audio") || normalized.includes("visual")) return toneByHue.blue;
  if (normalized.includes("room") || normalized.includes("venue") || normalized.includes("housing")) return toneByHue.violet;
  if (normalized.includes("staff") || normalized.includes("labor") || normalized.includes("crew") || normalized.includes("registration")) return toneByHue.cyan;
  if (normalized.includes("production") || normalized.includes("logistics") || normalized.includes("operations")) return toneByHue.indigo;
  if (normalized.includes("decor") || normalized.includes("design")) return toneByHue.pink;
  return neutralTone;
}

function sessionTone(value: string): string {
  const normalized = normalizeToneValue(value);
  if (normalized.includes("keynote")) return toneByHue.violet;
  if (normalized.includes("panel")) return toneByHue.blue;
  if (normalized.includes("workshop") || normalized.includes("training")) return toneByHue.emerald;
  if (normalized.includes("coffee") || normalized.includes("break")) return toneByHue.amber;
  if (normalized.includes("lunch") || normalized.includes("meal") || normalized.includes("dinner")) return toneByHue.amber;
  if (normalized.includes("reception") || normalized.includes("network")) return toneByHue.pink;
  return neutralTone;
}

function statusTone(value: string): string {
  const normalized = normalizeToneValue(value);
  if (
    normalized.includes("conflict") ||
    normalized.includes("blocked") ||
    normalized.includes("error") ||
    normalized.includes("failed") ||
    normalized.includes("rejected") ||
    normalized.includes("cancelled")
  ) {
    return conflictTone;
  }
  if (
    normalized.includes("approved") ||
    normalized.includes("confirmed") ||
    normalized.includes("paid") ||
    normalized.includes("complete") ||
    normalized.includes("saved")
  ) {
    return toneByHue.emerald;
  }
  if (
    normalized.includes("submitted") ||
    normalized.includes("review") ||
    normalized.includes("pending") ||
    normalized.includes("needs") ||
    normalized.includes("planned") ||
    normalized.includes("invited")
  ) {
    return toneByHue.amber;
  }
  if (normalized.includes("committed") || normalized.includes("active") || normalized.includes("draft")) return toneByHue.blue;
  return neutralTone;
}

export function getPlanningTone(
  value: string,
  options: { intent?: PlanningToneIntent } = {},
): PlanningTone {
  const intent = options.intent ?? "status";
  const className =
    intent === "conflict"
      ? conflictTone
      : intent === "category"
        ? categoryTone(value)
        : intent === "session"
          ? sessionTone(value)
          : statusTone(value);

  return {
    className,
    title: titleSafeValue(value),
  };
}
