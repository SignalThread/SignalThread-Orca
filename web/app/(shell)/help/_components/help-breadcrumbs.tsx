import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type HelpBreadcrumb = { label: string; href?: string };

export function HelpBreadcrumbs({ items }: { items: HelpBreadcrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-5 min-w-0 text-xs text-slate-500">
      <ol className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className={[
            "flex min-w-0 items-center gap-1.5",
            index === items.length - 1 ? "flex-1" : "shrink-0",
          ].join(" ")}>
            {index > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden="true" /> : null}
            {item.href ? (
              <Link href={item.href} className="truncate rounded-sm hover:text-[#28439A] hover:underline focus:outline-none focus:ring-2 focus:ring-[#28439A]/20">{item.label}</Link>
            ) : (
              <span aria-current="page" className="truncate font-medium text-slate-700" title={item.label}>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
