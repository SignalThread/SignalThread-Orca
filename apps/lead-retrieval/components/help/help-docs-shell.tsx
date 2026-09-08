import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { HelpDocsNav } from "@/components/help/help-docs-nav";
import type { HelpCategory, HelpTocItem } from "@/lib/help/help-content";

type HelpDocsShellProps = {
  categories: HelpCategory[];
  activeCategorySlug?: string;
  activeArticleSlug?: string;
  toc?: HelpTocItem[];
  children: ReactNode;
};

type HelpBreadcrumb = {
  label: string;
  href?: string;
};

export function HelpDocsShell({
  categories,
  activeCategorySlug,
  activeArticleSlug,
  toc = [],
  children
}: HelpDocsShellProps) {
  const gridClassName =
    toc.length > 0
      ? "grid gap-8 xl:items-start xl:grid-cols-[17rem_minmax(0,1fr)_14rem]"
      : "grid gap-8 xl:items-start xl:grid-cols-[17rem_minmax(0,1fr)]";

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50/60 p-3 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-5">
      <div className={gridClassName}>
        <aside className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:self-start xl:overflow-y-auto xl:overscroll-contain xl:pr-1">
          <HelpDocsNav
            categories={categories}
            activeCategorySlug={activeCategorySlug}
            activeArticleSlug={activeArticleSlug}
          />
        </aside>

        <main className="min-w-0">{children}</main>

        {toc.length > 0 ? (
          <aside className="hidden xl:block">
            <div className="sticky top-6 rounded-[1.5rem] border border-slate-200 bg-white/85 p-4 shadow-sm backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                On This Page
              </p>
              <nav aria-label="Article table of contents" className="mt-3 space-y-1">
                {toc.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`block rounded-lg py-1.5 text-sm leading-5 text-slate-500 transition hover:text-slate-950 ${
                      item.level === 3 ? "pl-4" : "pl-2"
                    }`}
                  >
                    {item.title}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        ) : null}
      </div>
    </section>
  );
}

export function HelpBreadcrumbs({ items }: { items: HelpBreadcrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-2">
            {item.href && !isLast ? (
              <Link href={item.href} className="font-medium transition hover:text-slate-900">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "font-medium text-slate-900" : undefined}>{item.label}</span>
            )}
            {!isLast ? <ChevronRight size={14} className="text-slate-300" /> : null}
          </span>
        );
      })}
    </nav>
  );
}
