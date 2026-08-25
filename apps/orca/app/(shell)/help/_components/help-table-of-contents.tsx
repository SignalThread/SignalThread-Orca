"use client";

import { useEffect, useState } from "react";
import { List } from "lucide-react";
import type { HelpHeading } from "@/lib/help/types";

function TocLinks({ headings, activeId }: { headings: HelpHeading[]; activeId: string | null }) {
  return (
    <ul className="space-y-1.5 text-xs">
      {headings.map((heading) => (
        <li key={heading.id} className={heading.depth === 3 ? "pl-3" : ""}>
          <a
            href={`#${heading.id}`}
            aria-current={activeId === heading.id ? "location" : undefined}
            className={[
              "block break-words border-l-2 py-1 pl-3 leading-5 transition-colors focus:outline-none focus:ring-2 focus:ring-[#28439A]/20 motion-reduce:transition-none",
              activeId === heading.id
                ? "border-[#28439A] font-semibold text-[#28439A]"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900",
            ].join(" ")}
          >
            {heading.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function HelpTableOfContents({ headings }: { headings: HelpHeading[] }) {
  const [activeId, setActiveId] = useState<string | null>(headings[0]?.id ?? null);

  useEffect(() => {
    const elements = headings.map((heading) => document.getElementById(heading.id)).filter(Boolean) as HTMLElement[];
    if (elements.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]?.target.id) setActiveId(visible[0].target.id);
    }, { rootMargin: "-96px 0px -70% 0px", threshold: [0, 1] });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;
  return (
    <>
      <details className="group order-1 rounded-lg border border-slate-200 bg-white xl:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#28439A]/20">
          <List className="h-4 w-4 text-[#28439A]" aria-hidden="true" />
          On this page
        </summary>
        <nav aria-label="Article table of contents" className="border-t border-slate-100 px-4 py-3">
          <TocLinks headings={headings} activeId={activeId} />
        </nav>
      </details>
      <aside className="order-2 hidden xl:block" aria-label="On this page">
        <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto border-l border-slate-200 pl-5">
          <p className="mb-3 text-[11px] font-semibold uppercase text-slate-500">On this page</p>
          <nav aria-label="Article table of contents"><TocLinks headings={headings} activeId={activeId} /></nav>
        </div>
      </aside>
    </>
  );
}
