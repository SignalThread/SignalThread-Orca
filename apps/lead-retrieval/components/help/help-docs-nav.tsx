"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { BookOpen, Search } from "lucide-react";
import type { HelpCategory } from "@/lib/help/help-content";

type HelpDocsNavProps = {
  categories: HelpCategory[];
  activeCategorySlug?: string;
  activeArticleSlug?: string;
};

export function HelpDocsNav({
  categories,
  activeCategorySlug,
  activeArticleSlug
}: HelpDocsNavProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalizeSearch(deferredQuery);
  const visibleCategories = getVisibleCategories(categories, normalizedQuery);

  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
      <Link href="/help" className="flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-slate-50">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
          <BookOpen size={18} />
        </span>
        <span>
          <span className="block text-sm font-bold text-slate-950">Help Docs</span>
          <span className="block text-xs text-slate-500">SignalThread Help</span>
        </span>
      </Link>

      <div className="relative mt-4">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          aria-label="Search help docs"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search help docs"
          className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
        />
      </div>

      {visibleCategories.length > 0 ? (
        <nav aria-label="Help documentation" className="mt-5 space-y-4">
          {visibleCategories.map(({ category, articles, categoryMatches }) => {
            const isActiveCategory = category.slug === activeCategorySlug;
            const displayArticles = normalizedQuery && categoryMatches ? category.articles : articles;
            return (
              <section key={category.slug} className="space-y-1">
                <Link
                  href={category.href}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    isActiveCategory
                      ? "bg-slate-950 text-white"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  <span>{category.title}</span>
                  <span className={isActiveCategory ? "text-white/70" : "text-slate-400"}>
                    {normalizedQuery ? displayArticles.length : category.articles.length}
                  </span>
                </Link>

                {displayArticles.length > 0 ? (
                  <div className="space-y-0.5 pl-3">
                    {displayArticles.map((article) => {
                      const isActiveArticle =
                        category.slug === activeCategorySlug && article.slug === activeArticleSlug;
                      return (
                        <Link
                          key={article.href}
                          href={article.href}
                          className={`block rounded-lg px-3 py-1.5 text-sm leading-5 transition ${
                            isActiveArticle
                              ? "bg-sky-50 font-semibold text-sky-800"
                              : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                          }`}
                        >
                          {article.title}
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <p className="px-3 py-1 text-xs text-slate-400">Resources publishing soon</p>
                )}
              </section>
            );
          })}
        </nav>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          <p className="font-semibold text-slate-900">No matching docs found</p>
          <p className="mt-1">Try searching for leads, voice notes, permissions, or sync.</p>
        </div>
      )}
    </div>
  );
}

function getVisibleCategories(categories: HelpCategory[], query: string) {
  return categories
    .map((category) => {
      const categoryMatches = searchMatches([category.title, category.description], query);
      const articles = query
        ? category.articles.filter((article) => searchMatches([article.searchText], query))
        : category.articles;

      if (query && !categoryMatches && articles.length === 0) {
        return null;
      }

      return { category, articles, categoryMatches };
    })
    .filter((category): category is NonNullable<typeof category> => category !== null);
}

function searchMatches(values: string[], query: string): boolean {
  if (!query) {
    return true;
  }
  return values.some((value) => value.toLowerCase().includes(query));
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}
