"use client";

import { CATEGORY_VISUALS, CategoryIcon } from "@/components/signals/category-badge";
import { SIGNAL_CATEGORIES, type SignalCategory } from "@/components/signals/signal-types";

const CATEGORY_EXAMPLE_USAGE: Record<SignalCategory, string> = {
  "AI-Powered": "Adapt tone, emphasis, or messaging from lead context.",
  Contextual: "Add facts, buying cues, event context, or audience details.",
  Custom: "Reuse copy or instructions with light refinement.",
  "Call-to-Action": "Define the next step, meeting ask, demo request, or follow-up action."
};

export function SignalCategoryCards({
  selected,
  onSelect,
  disabled
}: {
  selected: SignalCategory;
  onSelect: (category: SignalCategory) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {SIGNAL_CATEGORIES.map((category) => {
        const visual = CATEGORY_VISUALS[category];
        const isSelected = selected === category;
        return (
          <button
            key={category}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(category)}
            className={`flex w-full flex-col rounded-2xl border p-4 text-left transition-all ${
              isSelected
                ? `ring-2 ring-indigo-500 ring-offset-2 ${visual.cardWrap} border-indigo-300`
                : `border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80`
            } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
          >
            <div className="flex items-start gap-3">
              <CategoryIcon category={category} className="h-12 w-12 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-slate-900">{visual.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{visual.description}</p>
                <p className="mt-2 text-xs font-medium text-slate-500">
                  <span className="text-slate-400">Example: </span>
                  {CATEGORY_EXAMPLE_USAGE[category]}
                </p>
              </div>
            </div>
            {isSelected ? (
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-indigo-600">Selected</p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
