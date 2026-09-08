"use client";

import { CATEGORY_VISUALS, SignalCategoryGlyph } from "@/components/signals/category-badge";
import type { SignalCategory } from "@/components/signals/signal-types";

export function EmailSignalBlock({
  name,
  category,
  content
}: {
  name: string;
  category: SignalCategory;
  content: string;
}) {
  const visual = CATEGORY_VISUALS[category];

  return (
    <div className={`rounded-xl border p-4 ${visual.cardWrap}`}>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${visual.iconWrap} ${visual.iconColor}`}
        >
          <span className="scale-90">
            <SignalCategoryGlyph category={category} />
          </span>
        </span>
        <p className={`text-sm font-semibold ${visual.iconColor}`}>{name}</p>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{content}</p>
    </div>
  );
}
