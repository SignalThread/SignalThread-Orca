import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Clock3, SearchX } from "lucide-react";
import { getArticlesByCategory, getCategoryBySlug, getCategorySummaries } from "@/lib/help/help-content.server";
import { HelpBreadcrumbs } from "../../_components/help-breadcrumbs";
import { HelpCategoryIcon } from "../../_components/help-category-icon";
import { HelpSearchForm } from "../../_components/help-search-form";
import { HelpStatusBadge } from "../../_components/help-status";
import { HelpReturnLink } from "../../_components/help-return-link";

type CategoryPageProps = {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
};
export const dynamicParams = false;

export function generateStaticParams() {
  return getCategorySummaries().map((category) => ({ categorySlug: category.slug }));
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const category = getCategoryBySlug((await params).categorySlug);
  if (!category) return { title: "Help category not found" };
  return { title: `${category.label} | Orca Help`, description: category.description };
}

export default async function HelpCategoryPage({ params, searchParams }: CategoryPageProps) {
  const { categorySlug } = await params;
  const category = getCategoryBySlug(categorySlug);
  if (!category) notFound();
  const { from } = await searchParams;
  const articles = getArticlesByCategory(categorySlug);
  return (
    <main className="pb-10">
      <header className="border-b border-slate-200 bg-white px-5 py-7 sm:px-8 lg:px-10">
        <HelpReturnLink from={from} />
        <HelpBreadcrumbs items={[{ label: "Help Center", href: "/help" }, { label: category.label }]} />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#28439A]"><HelpCategoryIcon categorySlug={category.slug} /></span>
            <div className="min-w-0">
              <h1 className="break-words text-[26px] font-semibold leading-8 text-slate-950">{category.label}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{category.description}</p>
              <p className="mt-2 text-xs font-medium text-slate-500">{articles.length} {articles.length === 1 ? "article" : "articles"}</p>
            </div>
          </div>
          <div className="w-full lg:max-w-md"><HelpSearchForm compact /></div>
        </div>
      </header>

      <section className="px-5 py-7 sm:px-8 lg:px-10" aria-labelledby="category-articles-heading">
        <h2 id="category-articles-heading" className="text-base font-semibold text-slate-950">Articles in {category.label}</h2>
        {articles.length === 0 ? (
          <div className="mt-4 border-y border-slate-200 py-12 text-center">
            <SearchX className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
            <h3 className="mt-3 text-sm font-semibold text-slate-950">No articles are available in this topic yet</h3>
            <p className="mt-1 text-xs text-slate-600">Browse another Help topic or search the full documentation library.</p>
            <Link href="/help" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-[#28439A] hover:underline">Return to Help Center</Link>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200 border-y border-slate-200 bg-white">
            {articles.map((article) => (
              <li key={article.slug}>
                <Link href={`/help/article/${article.slug}`} className="group flex min-h-28 items-center gap-4 px-1 py-5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#28439A]/20 sm:px-4">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="break-words text-[15px] font-semibold text-slate-950 group-hover:text-[#28439A]">{article.title}</span>
                      <HelpStatusBadge status={article.status} />
                    </span>
                    <span className="mt-1.5 block max-w-3xl text-xs leading-5 text-slate-600">{article.description}</span>
                    <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-500"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{article.estimatedReadTime} min read</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[#28439A] transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
