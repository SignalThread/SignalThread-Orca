import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Clock3,
  Gauge,
  LayoutList,
} from "lucide-react";
import {
  getAllPublicArticles,
  getArticleBySlug,
  getPreviousAndNextArticles,
  getRelatedArticles,
} from "@/lib/help/help-content.server";
import { HelpArticleCard } from "../../_components/help-article-card";
import { HelpBreadcrumbs } from "../../_components/help-breadcrumbs";
import { HelpMarkdown } from "../../_components/help-markdown";
import { HelpStatusBadge, HelpStatusCallout } from "../../_components/help-status";
import { HelpTableOfContents } from "../../_components/help-table-of-contents";
import { HelpReturnLink } from "../../_components/help-return-link";

type ArticlePageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
};

export function generateStaticParams() {
  return getAllPublicArticles().map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const article = getArticleBySlug((await params).slug);
  if (!article) return { title: "Help article not found" };
  return { title: `${article.title} | Orca Help`, description: article.description };
}

function formatReviewedDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`));
}

export default async function HelpArticlePage({ params, searchParams }: ArticlePageProps) {
  const article = getArticleBySlug((await params).slug);
  if (!article) notFound();
  const related = getRelatedArticles(article);
  const neighbors = getPreviousAndNextArticles(article);
  const rawFrom = (await searchParams).from;

  return (
    <main className="pb-10">
      <a href="#help-article-content" className="sr-only z-50 rounded-md bg-white px-3 py-2 text-sm font-semibold text-[#28439A] shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to article</a>
      <header className="border-b border-slate-200 bg-white px-5 py-7 sm:px-8 lg:px-10">
        <HelpBreadcrumbs items={[
          { label: "Help Center", href: "/help" },
          { label: article.category, href: `/help/category/${article.categorySlug}` },
          { label: article.title },
        ]} />
        <HelpReturnLink from={rawFrom} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase text-[#28439A]">{article.category}</span>
          <HelpStatusBadge status={article.status} />
        </div>
        <h1 className="mt-3 max-w-4xl break-words text-[30px] font-semibold leading-[38px] text-slate-950 sm:text-[34px] sm:leading-[42px]">{article.title}</h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-7 text-slate-600">{article.description}</p>
        <dl className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /><dt className="sr-only">Reading time</dt><dd>{article.estimatedReadTime} min read</dd></div>
          <div className="flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" aria-hidden="true" /><dt className="sr-only">Difficulty</dt><dd className="capitalize">{article.difficulty}</dd></div>
          <div className="flex items-center gap-1.5"><CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" /><dt className="sr-only">Last reviewed</dt><dd>Reviewed {formatReviewedDate(article.lastReviewed)}</dd></div>
        </dl>
        <HelpStatusCallout status={article.status} />
      </header>

      <div className="px-5 py-7 sm:px-8 lg:px-10">
        <div className="grid min-w-0 gap-7 xl:grid-cols-[minmax(0,760px)_220px] xl:items-start xl:justify-between xl:gap-12">
          <article id="help-article-content" className="order-2 min-w-0 max-w-[760px] xl:order-1" tabIndex={-1}>
            <HelpMarkdown markdown={article.bodyMarkdown} />
          </article>
          <HelpTableOfContents headings={article.headings} />
        </div>

        <Link href={`/help/category/${article.categorySlug}`} className="mt-10 inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-[#28439A] hover:underline focus:outline-none focus:ring-2 focus:ring-[#28439A]/20">
          <LayoutList className="h-4 w-4" aria-hidden="true" />View all {article.category} articles
        </Link>

        {related.length > 0 ? (
          <section className="mt-8 border-t border-slate-200 pt-8" aria-labelledby="related-heading">
            <p className="text-[10px] font-semibold uppercase text-[#28439A]">Keep exploring</p>
            <h2 id="related-heading" className="mt-1 text-xl font-semibold text-slate-950">Related articles</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => <HelpArticleCard key={item.slug} article={item} compact />)}
            </div>
          </section>
        ) : null}

        <nav aria-label="Article navigation" className="mt-8 grid gap-3 border-t border-slate-200 pt-8 sm:grid-cols-2">
          {neighbors.previous ? (
            <Link href={`/help/article/${neighbors.previous.slug}`} className="group flex min-h-24 items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 focus:outline-none focus:ring-2 focus:ring-[#28439A]/25">
              <ArrowLeft className="h-4 w-4 shrink-0 text-[#28439A] transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
              <span className="min-w-0"><span className="block text-[10px] font-semibold uppercase text-slate-500">Previous</span><span className="mt-1 block break-words text-sm font-semibold leading-5 text-slate-950 group-hover:text-[#28439A]">{neighbors.previous.title}</span></span>
            </Link>
          ) : <span />}
          {neighbors.next ? (
            <Link href={`/help/article/${neighbors.next.slug}`} className="group flex min-h-24 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 text-right focus:outline-none focus:ring-2 focus:ring-[#28439A]/25">
              <span className="min-w-0"><span className="block text-[10px] font-semibold uppercase text-slate-500">Next</span><span className="mt-1 block break-words text-sm font-semibold leading-5 text-slate-950 group-hover:text-[#28439A]">{neighbors.next.title}</span></span>
              <ArrowRight className="h-4 w-4 shrink-0 text-[#28439A] transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
            </Link>
          ) : null}
        </nav>
      </div>
    </main>
  );
}
