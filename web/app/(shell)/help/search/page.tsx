import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, SearchX } from "lucide-react";
import { getCategorySummaries } from "@/lib/help/help-content.server";
import { searchHelpArticles } from "@/lib/help/help-search.server";
import { normalizeHelpSearchQuery } from "@/lib/help/search-query";
import { HelpBreadcrumbs } from "../_components/help-breadcrumbs";
import { HelpSearchForm } from "../_components/help-search-form";
import { HelpSearchFocus } from "../_components/help-search-focus";
import { HelpSearchHighlight } from "../_components/help-search-highlight";
import { HelpStatusBadge } from "../_components/help-status";

export const metadata: Metadata = { title: "Search | Orca Help", description: "Search Orca Help Center articles." };

export default async function HelpSearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const raw = (await searchParams).q;
  const query = normalizeHelpSearchQuery(raw);
  const results = searchHelpArticles(query);
  const categories = getCategorySummaries();
  return (
    <main className="pb-10">
      <HelpSearchFocus query={query} />
      <header className="border-b border-slate-200 bg-white px-5 py-7 sm:px-8 lg:px-10">
        <HelpBreadcrumbs items={[{ label: "Help Center", href: "/help" }, { label: "Search" }]} />
        <h1 className="text-[26px] font-semibold leading-8 text-slate-950">Search Orca Help</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Find feature guidance, planner workflows, and troubleshooting steps.</p>
        <div className="mt-5 max-w-3xl"><HelpSearchForm defaultValue={query} suggestions /></div>
      </header>
      <div className="px-5 py-7 sm:px-8 lg:px-10">
        {!query ? (
          <div className="border-y border-slate-200 py-12 text-center">
            <p className="text-sm font-semibold text-slate-950">What can we help you find?</p>
            <p className="mt-1 text-xs text-slate-600">Enter a feature, workflow, or problem above.</p>
          </div>
        ) : results.length === 0 ? (
          <div className="border-y border-slate-200 py-12 text-center">
            <SearchX className="mx-auto h-9 w-9 text-slate-300" aria-hidden="true" />
            <h2 id="help-search-results-status" tabIndex={-1} className="mt-3 break-words text-base font-semibold text-slate-950 outline-none">No results for “{query}”</h2>
            <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-600">Try a broader term, check the feature name, or browse the documentation by topic.</p>
            <Link href="/help" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#28439A] hover:underline">Browse Help topics<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          </div>
        ) : (
          <section aria-labelledby="help-search-results-status">
            <h2 id="help-search-results-status" tabIndex={-1} className="break-words text-sm font-semibold text-slate-950 outline-none">{results.length} {results.length === 1 ? "result" : "results"} for “{query}”</h2>
            <p className="sr-only" role="status" aria-live="polite">{results.length} Help {results.length === 1 ? "result" : "results"} found.</p>
            <ul className="mt-4 divide-y divide-slate-200 border-y border-slate-200 bg-white">
              {results.map((result) => (
                <li key={result.articleSlug}>
                  <Link href={result.href} className="group flex min-h-28 items-center gap-4 px-1 py-5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#28439A]/20 sm:px-4">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase text-slate-500"><HelpSearchHighlight text={result.category} query={query} /></span>
                        <HelpStatusBadge status={result.status} />
                      </span>
                      <span className="mt-1 block break-words text-[15px] font-semibold text-slate-950 group-hover:text-[#28439A]"><HelpSearchHighlight text={result.title} query={query} /></span>
                      {result.matchedHeading ? <span className="mt-1 block text-xs font-semibold text-[#28439A]">In <HelpSearchHighlight text={result.matchedHeading} query={query} /></span> : null}
                      <span className="mt-1.5 block max-w-3xl text-xs leading-5 text-slate-600"><HelpSearchHighlight text={result.excerpt || result.description} query={query} /></span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-[#28439A] transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {query && results.length > 0 ? null : (
          <nav aria-label="Browse Help categories" className="mt-8">
            <p className="text-[10px] font-semibold uppercase text-slate-500">Browse by topic</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.map((category) => (
                <Link key={category.slug} href={`/help/category/${category.slug}`} className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-[#28439A]/40 hover:text-[#28439A] focus:outline-none focus:ring-2 focus:ring-[#28439A]/20">
                  {category.label}<span className="ml-2 text-slate-400">{category.articleCount}</span>
                </Link>
              ))}
            </div>
          </nav>
        )}
      </div>
    </main>
  );
}
