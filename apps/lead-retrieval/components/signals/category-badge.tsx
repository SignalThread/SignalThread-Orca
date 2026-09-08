import { SignalCategory } from "@/components/signals/signal-types";

type CategoryVisual = {
  label: string;
  iconColor: string;
  iconWrap: string;
  badgeWrap: string;
  cardWrap: string;
  description: string;
};

/** Campaign Builder agent chips: must stay aligned with `CATEGORY_VISUALS` / library badges. */
export const CATEGORY_CAMPAIGN_CHIP: Record<
  SignalCategory,
  {
    active: string;
    inactive: string;
  }
> = {
  "AI-Powered": {
    active:
      "border-violet-200 bg-violet-50 text-violet-700 ring-1 ring-slate-900/10 shadow-sm",
    inactive:
      "border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50/60 hover:text-violet-700"
  },
  Contextual: {
    active: "border-blue-200 bg-blue-50 text-blue-700 ring-1 ring-slate-900/10 shadow-sm",
    inactive:
      "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-700"
  },
  Custom: {
    active: "border-orange-200 bg-orange-50 text-orange-700 ring-1 ring-slate-900/10 shadow-sm",
    inactive:
      "border-slate-200 bg-white text-slate-700 hover:border-orange-200 hover:bg-orange-50/60 hover:text-orange-700"
  },
  "Call-to-Action": {
    active: "border-emerald-200 bg-emerald-50 text-emerald-700 ring-1 ring-slate-900/10 shadow-sm",
    inactive:
      "border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/60 hover:text-emerald-700"
  }
};

export const CATEGORY_VISUALS: Record<SignalCategory, CategoryVisual> = {
  "AI-Powered": {
    label: "AI-Powered",
    iconColor: "text-violet-700",
    iconWrap: "border-violet-300 bg-violet-50",
    badgeWrap: "border-violet-200 bg-violet-50 text-violet-700",
    cardWrap: "border-violet-200 bg-violet-50/40",
    description:
      "Interprets intent and lead context. Use this when the draft should adapt tone, emphasis, or messaging based on what happened with the lead."
  },
  Contextual: {
    label: "Contextual",
    iconColor: "text-blue-700",
    iconWrap: "border-blue-300 bg-blue-50",
    badgeWrap: "border-blue-200 bg-blue-50 text-blue-700",
    cardWrap: "border-blue-200 bg-blue-50/40",
    description:
      "Adds background facts, buying cues, event context, or audience details so campaign drafts are more relevant."
  },
  Custom: {
    label: "Custom",
    iconColor: "text-orange-700",
    iconWrap: "border-orange-300 bg-orange-50",
    badgeWrap: "border-orange-200 bg-orange-50 text-orange-700",
    cardWrap: "border-orange-200 bg-orange-50/40",
    description: "Reusable copy or instructions that should appear consistently in campaign drafts with only light refinement."
  },
  "Call-to-Action": {
    label: "Call-to-Action",
    iconColor: "text-emerald-700",
    iconWrap: "border-emerald-300 bg-emerald-50",
    badgeWrap: "border-emerald-200 bg-emerald-50 text-emerald-700",
    cardWrap: "border-emerald-200 bg-emerald-50/40",
    description: "Guides the close. Use this to define the next step, meeting ask, demo request, or follow-up action."
  }
};

export function SignalCategoryGlyph({ category }: { category: SignalCategory }) {
  if (category === "AI-Powered") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M13.5 2 5 13h6l-1 9 8.5-11h-6L13.5 2Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (category === "Contextual") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7.5h16M4 12h16M4 16.5h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6 5h12v14H6z" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
      </svg>
    );
  }

  if (category === "Custom") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.8 14.8 8l5.7.8-4.1 4 1 5.6L12 15.7l-5.4 2.7 1-5.6-4.1-4 5.7-.8L12 2.8Z" />
      </svg>
    );
  }

  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function CategoryIcon({
  category,
  className = "h-10 w-10 rounded-xl"
}: {
  category: SignalCategory;
  className?: string;
}) {
  const visual = CATEGORY_VISUALS[category];
  return (
    <span className={`inline-flex items-center justify-center border ${visual.iconWrap} ${visual.iconColor} ${className}`}>
      <SignalCategoryGlyph category={category} />
    </span>
  );
}

export function CategoryBadge({
  category,
  compact = false
}: {
  category: SignalCategory;
  compact?: boolean;
}) {
  const visual = CATEGORY_VISUALS[category];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border font-semibold ${visual.badgeWrap} ${compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"}`}
    >
      <SignalCategoryGlyph category={category} />
      <span>{visual.label}</span>
    </span>
  );
}

export function CategoryExplainerCard({ category }: { category: SignalCategory }) {
  const visual = CATEGORY_VISUALS[category];
  return (
    <article className={`rounded-xl border p-4 ${visual.cardWrap}`}>
      <div className="flex items-center gap-3">
        <CategoryIcon category={category} className="h-11 w-11 rounded-xl" />
        <h3 className="text-2xl font-bold text-slate-900">{visual.label}</h3>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-700">{visual.description}</p>
    </article>
  );
}
