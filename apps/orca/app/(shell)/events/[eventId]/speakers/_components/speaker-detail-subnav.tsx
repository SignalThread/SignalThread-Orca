"use client";

import { navCount, SUBNAV_ITEMS, type OverviewData, type SpeakerDetailSection } from "./speaker-detail-shared";

export function SpeakerDetailSubnav({
  activeSection,
  overview,
  onSelectSection,
}: {
  activeSection: SpeakerDetailSection;
  overview: OverviewData;
  onSelectSection: (section: SpeakerDetailSection) => void;
}) {
  return (
    <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
      <nav
        className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 p-1.5 shadow-[0_12px_30px_rgba(15,23,42,0.045)] lg:block lg:space-y-1 lg:overflow-visible"
        aria-label="Speaker sections"
      >
        {SUBNAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const count = navCount(item.count, overview);
          const isActive = item.key === activeSection;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => onSelectSection(item.key)}
              className={`flex h-9 shrink-0 items-center justify-between gap-3 rounded-xl px-3 text-left text-[12px] font-semibold transition lg:w-full ${
                isActive
                  ? "bg-violet-50 text-violet-700 shadow-sm ring-1 ring-violet-100"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span className="flex items-center gap-2 whitespace-nowrap">
                <Icon className={`h-4 w-4 ${isActive ? "text-violet-600" : "text-slate-400"}`} />
                {item.label}
              </span>
              {count !== null && count > 0 ? (
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${isActive ? "border-violet-200 bg-white text-violet-700" : "border-slate-200 bg-white text-slate-600"}`}>
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
