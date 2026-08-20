import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  CircleHelp,
  Compass,
  KeyRound,
  LifeBuoy,
  PlayCircle,
} from "lucide-react";
import { FEATURED_HELP_ARTICLE_SLUGS } from "@/lib/help/featured";
import { getCategorySummaries, getFeaturedArticles } from "@/lib/help/help-content.server";
import { HelpArticleCard } from "./_components/help-article-card";
import { HelpCategoryIcon } from "./_components/help-category-icon";
import { HelpSearchForm } from "./_components/help-search-form";
import { HelpReturnLink } from "./_components/help-return-link";

export const metadata: Metadata = {
  title: "Orca Help Center",
  description: "Find Orca product guidance, planning workflows, and troubleshooting help.",
};

const utilities = [
  {
    title: "Contact Support",
    description: "Start with practical fixes for common Orca issues.",
    action: "Browse troubleshooting",
    href: "/help/category/troubleshooting",
    icon: LifeBuoy,
  },
  {
    title: "Product Walkthroughs",
    description: "Follow step-by-step guides for learning the workspace.",
    action: "Explore getting started",
    href: "/help/category/getting-started",
    icon: PlayCircle,
  },
  {
    title: "Access and Account Help",
    description: "Resolve permissions, read-only access, and organization context.",
    action: "Review access help",
    href: "/help/article/read-only-access-and-permission-problems",
    icon: KeyRound,
  },
] as const;

export default async function HelpLandingPage({ searchParams }: { searchParams: Promise<{ from?: string | string[] }> }) {
  const { from } = await searchParams;
  const categories = getCategorySummaries();
  const featured = getFeaturedArticles(FEATURED_HELP_ARTICLE_SLUGS);
  return (
    <main className="pb-10">
      <header className="border-b border-slate-200 bg-white px-5 py-10 sm:px-8 lg:px-10 lg:py-12">
        <div className="max-w-4xl">
          <HelpReturnLink from={from} />
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase text-[#28439A]">
            <CircleHelp className="h-4 w-4" aria-hidden="true" />Help Center
          </p>
          <h1 className="mt-3 max-w-3xl text-[30px] font-semibold leading-[38px] text-slate-950 sm:text-[34px] sm:leading-[42px]">
            Answers for planning, coordinating, and delivering events in Orca.
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-slate-600">
            Find feature guidance, end-to-end planning workflows, and practical troubleshooting from the validated Orca documentation library.
          </p>
          <div className="mt-7"><HelpSearchForm suggestions /></div>
        </div>
      </header>

      <div className="space-y-10 px-5 py-8 sm:px-8 lg:px-10">
        <section aria-labelledby="help-resources-heading">
          <h2 id="help-resources-heading" className="sr-only">Support resources</h2>
          <div className="grid gap-3 lg:grid-cols-3">
            {utilities.map(({ title, description, action, href, icon: Icon }) => (
              <Link key={title} href={href} className="group flex min-h-36 items-start gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/30 transition hover:border-[#28439A]/35 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#28439A]/25">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#28439A]" aria-hidden="true"><Icon className="h-5 w-5" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-950">{title}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">{description}</span>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#28439A]">{action}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" /></span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {featured.length > 0 ? (
          <section aria-labelledby="featured-guides-heading">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase text-[#28439A]">Recommended starting points</p>
                <h2 id="featured-guides-heading" className="mt-1 text-xl font-semibold text-slate-950">Featured guides</h2>
              </div>
              <BookOpenText className="h-5 w-5 text-slate-300" aria-hidden="true" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {featured.map((article) => <HelpArticleCard key={article.slug} article={article} />)}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="help-topics-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase text-[#28439A]">Documentation library</p>
              <h2 id="help-topics-heading" className="mt-1 text-xl font-semibold text-slate-950">Browse by topic</h2>
            </div>
            <Compass className="h-5 w-5 text-slate-300" aria-hidden="true" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {categories.map((category) => (
              <Link key={category.slug} href={`/help/category/${category.slug}`} className="group flex min-h-40 flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/30 transition hover:border-[#28439A]/35 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#28439A]/25">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-[#28439A]"><HelpCategoryIcon categorySlug={category.slug} /></span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">{category.articleCount} {category.articleCount === 1 ? "article" : "articles"}</span>
                </div>
                <h3 className="mt-4 text-sm font-semibold text-slate-950 group-hover:text-[#28439A]">{category.label}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">{category.description}</p>
                <span className="mt-auto flex justify-end pt-3 text-[#28439A]"><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" /></span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
