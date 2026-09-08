import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { HelpBreadcrumbs, HelpDocsShell } from "@/components/help/help-docs-shell";
import { AppShell } from "@/components/layout/app-shell";
import { requireAuth } from "@/lib/auth/session";
import {
  getHelpCategories,
  getHelpCategory,
  getHelpCategoryStaticParams
} from "@/lib/help/help-content";

type HelpCategoryPageProps = {
  params: Promise<{
    category: string;
  }>;
};

type HelpSessionUser = Awaited<ReturnType<typeof requireAuth>>;

export function generateStaticParams() {
  return getHelpCategoryStaticParams();
}

export default async function HelpCategoryPage({ params }: HelpCategoryPageProps) {
  const [{ category: categorySlug }, sessionUser] = await Promise.all([params, requireAuth()]);
  const categories = getHelpCategories();
  const category = getHelpCategory(categorySlug);

  if (!category) {
    notFound();
  }

  const isGettingStarted = category.slug === "getting-started";

  return renderHelpShell(
    sessionUser,
    <HelpDocsShell categories={categories} activeCategorySlug={category.slug}>
      <div className="space-y-6">
        <HelpBreadcrumbs
          items={[
            { label: "Help", href: "/help" },
            { label: category.title }
          ]}
        />

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-sky-700">
            Help Category
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-950">
            {category.title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
            {category.description}
          </p>
          {isGettingStarted ? (
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
              Set up the mobile app, capture your first lead, and get your admin portal ready so
              the team can work from one connected event workflow.
            </p>
          ) : null}
        </section>

        {category.articles.length > 0 ? (
          <section className="grid gap-4">
            {category.articles.map((article) => (
              <Link
                key={article.href}
                href={article.href}
                className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md"
              >
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                  Article
                </p>
                <h2 className="mt-2 text-xl font-bold text-slate-950 transition group-hover:text-sky-800">
                  {article.title}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  {article.description}
                </p>
              </Link>
            ))}
          </section>
        ) : isGettingStarted ? (
          <section className="grid gap-4">
            <OnboardingBlock
              eyebrow="Guide"
              title="Download the Mobile App"
              body="Install the mobile app, sign in with the invited email, complete the verification code flow, and get each rep ready to capture leads, notes, and recordings on the event floor."
            />
            <OnboardingBlock
              eyebrow="Guide"
              title="Capture Your First Lead"
              body="Start with badge scanning, business card capture, or manual entry, then confirm the lead is synced back to the shared platform so the team can qualify and follow up from one record."
            />
            <OnboardingBlock
              eyebrow="Guide"
              title="Set Up Your Admin Portal"
              body="Use the admin portal to invite teammates, manage users, confirm event access, and keep company activity organized before the event goes live."
            />
          </section>
        ) : (
          <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">Resources coming soon</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
              This category is ready in Help Docs, but its markdown-backed articles have not been
              published yet.
            </p>
          </section>
        )}
      </div>
    </HelpDocsShell>
  );
}

function OnboardingBlock({
  eyebrow,
  title,
  body
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <section className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
        {eyebrow}
      </p>
      <h3 className="mt-2 text-xl font-bold text-slate-950 transition group-hover:text-sky-800">
        {title}
      </h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{body}</p>
    </section>
  );
}

function renderHelpShell(sessionUser: HelpSessionUser, children: ReactNode) {
  if (sessionUser.role === "platform_admin") {
    return <AdminShell sessionUser={sessionUser}>{children}</AdminShell>;
  }

  return <AppShell sessionUser={sessionUser}>{children}</AppShell>;
}
