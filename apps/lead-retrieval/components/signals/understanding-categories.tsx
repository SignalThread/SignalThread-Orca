import { CategoryExplainerCard } from "@/components/signals/category-badge";
import { SIGNAL_CATEGORIES } from "@/components/signals/signal-types";

export function UnderstandingCategories({
  expanded,
  onToggle
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 text-left hover:bg-slate-50"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-700">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 8.4v.2m0 2.2v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Understanding Agent Types</h2>
            <p className="text-sm text-slate-600">Learn how each Campaign Agent type works</p>
          </div>
        </div>
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-transform ${expanded ? "" : "-rotate-90"}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {expanded ? (
        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          {SIGNAL_CATEGORIES.map((category) => (
            <CategoryExplainerCard key={category} category={category} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
