import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { HelpBreadcrumbs, HelpDocsShell } from "@/components/help/help-docs-shell";
import { HelpMarkdown } from "@/components/help/help-markdown";
import { AppShell } from "@/components/layout/app-shell";
import { requireAuth } from "@/lib/auth/session";
import {
  getHelpArticle,
  getHelpArticleStaticParams,
  getHelpCategories
} from "@/lib/help/help-content";

type HelpArticlePageProps = {
  params: Promise<{
    category: string;
    slug: string;
  }>;
};

type HelpSessionUser = Awaited<ReturnType<typeof requireAuth>>;

export function generateStaticParams() {
  return getHelpArticleStaticParams();
}

export default async function HelpArticlePage({ params }: HelpArticlePageProps) {
  const [{ category, slug }, sessionUser] = await Promise.all([params, requireAuth()]);
  const categories = getHelpCategories();
  const article = getHelpArticle(category, slug);

  if (!article) {
    notFound();
  }

  return renderHelpShell(
    sessionUser,
    <HelpDocsShell
      categories={categories}
      activeCategorySlug={article.categorySlug}
      activeArticleSlug={article.slug}
      toc={article.toc}
    >
      <div className="space-y-6">
        <HelpBreadcrumbs
          items={[
            { label: "Help", href: "/help" },
            { label: article.categoryTitle, href: `/help/${article.categorySlug}` },
            { label: article.title }
          ]}
        />

        <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
          <header className="border-b border-slate-100 pb-8">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-sky-700">
              {article.categoryTitle}
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight text-slate-950">
              {article.title}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
              {article.description}
            </p>
          </header>

          <div className="pt-8">
            <HelpMarkdown markdown={article.body} currentCategorySlug={article.categorySlug} />
          </div>
        </article>

        <nav className="grid gap-3 md:grid-cols-2" aria-label="Previous and next help articles">
          {article.previousArticle ? (
            <Link
              href={article.previousArticle.href}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/50"
            >
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                Previous
              </p>
              <p className="mt-2 font-semibold text-slate-950">{article.previousArticle.title}</p>
            </Link>
          ) : (
            <span />
          )}

          {article.nextArticle ? (
            <Link
              href={article.nextArticle.href}
              className="rounded-2xl border border-slate-200 bg-white p-5 text-right shadow-sm transition hover:border-sky-200 hover:bg-sky-50/50"
            >
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Next</p>
              <p className="mt-2 font-semibold text-slate-950">{article.nextArticle.title}</p>
            </Link>
          ) : null}
        </nav>
      </div>
    </HelpDocsShell>
  );
}

function renderHelpShell(sessionUser: HelpSessionUser, children: ReactNode) {
  if (sessionUser.role === "platform_admin") {
    return <AdminShell sessionUser={sessionUser}>{children}</AdminShell>;
  }

  return <AppShell sessionUser={sessionUser}>{children}</AppShell>;
}
