"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import {
  Bot,
  CalendarCheck2,
  FileText,
  KeyRound,
  LifeBuoy,
  ListChecks,
  Mic2,
  RadioTower,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Tags,
  UserRoundCheck,
  WifiOff,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { HelpArticleSummary, HelpCategory } from "@/lib/help/help-content";

type HelpHomeProps = {
  categories: HelpCategory[];
  articles: HelpArticleSummary[];
  supportEmail: string;
  mobileAppUrl: string;
  adminPortalUrl: string;
};

type VisibleCategory = HelpCategory & {
  displayCount: number;
};

export function HelpHome({ categories, articles, supportEmail, mobileAppUrl, adminPortalUrl }: HelpHomeProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalizeSearch(deferredQuery);

  const visibleCategories = getVisibleCategories(categories, normalizedQuery);
  const matchingArticleCount = getMatchingArticleCount(articles, normalizedQuery);

  return (
    <section className="-m-4 min-h-[calc(100vh-4rem)] bg-[#f8fafc] px-4 py-2 md:-m-6 md:px-8 md:py-3">
      <div className="mx-auto max-w-7xl">
        <div className="space-y-5 py-3 md:space-y-6 md:py-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <p className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-sky-700 shadow-sm shadow-sky-100/70">
              Help Center
            </p>
            <h1 className="mt-4 max-w-4xl text-4xl font-bold text-slate-950 sm:text-5xl">
              Answers for capturing, qualifying, and following up with leads.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              Practical guides for every event workflow: setting up access, capturing leads,
              recording context, understanding AI insights, and keeping the team moving in real
              time.
            </p>
            <div className="relative mt-6 max-w-3xl">
              <Search
                size={20}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                aria-label="Search help documentation"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search guides, app docs, and more..."
                className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
              />
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            <InfoCard
              icon={LifeBuoy}
              label="Support"
              title={supportEmail}
              body="Include your event name, company, and the screen where you need help."
              href={`mailto:${supportEmail}`}
            />
            <InfoCard
              icon={Smartphone}
              label="Mobile App"
              title="Download the mobile app"
              body="Use the mobile app on-site to scan badges, record notes, and sync activity."
              href={mobileAppUrl}
              external
            />
            <InfoCard
              icon={ShieldCheck}
              label="Admin Portal"
              title="Manage access here"
              body="Use the portal for events, users, companies, exports, and account settings."
              href={adminPortalUrl}
            />
          </section>

          <section>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-950">Browse by topic</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Explore focused guides for capture, qualification, AI context, offline work,
                  permissions, and account operations.
                </p>
              </div>
              <p className="text-sm font-medium text-slate-500" aria-live="polite">
                {normalizedQuery
                  ? `${visibleCategories.length} topics and ${matchingArticleCount} articles found`
                  : `${categories.length} topics and ${articles.length} articles`}
              </p>
            </div>

            {visibleCategories.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleCategories.map((category) => (
                  <TopicCard
                    key={category.slug}
                    category={category}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
                <h3 className="text-lg font-bold text-slate-950">No matching docs found</h3>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
                  Try searching for scanning, voice notes, offline mode, permissions, or account
                  settings.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

function InfoCard({
  icon: Icon,
  label,
  title,
  body,
  href,
  external = false
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  body: string;
  href?: string;
  external?: boolean;
}) {
  const content = (
    <article className="group h-full cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition group-hover:bg-sky-50 group-hover:text-sky-700">
          <Icon size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
          <h2 className="mt-2 text-base font-bold text-slate-950">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
        </div>
      </div>
    </article>
  );

  return href ? (
    <Link
      href={href}
      className="block rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100"
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
    >
      {content}
    </Link>
  ) : (
    content
  );
}

function TopicCard({ category }: { category: VisibleCategory }) {
  const Icon = getCategoryIcon(category.slug);

  return (
    <Link
      href={category.href}
      className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition group-hover:bg-sky-50 group-hover:text-sky-700">
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-lg font-bold text-slate-950 transition group-hover:text-sky-800">
              {category.title}
            </h3>
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {category.displayCount}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{category.description}</p>
        </div>
      </div>
    </Link>
  );
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function getVisibleCategories(categories: HelpCategory[], query: string): VisibleCategory[] {
  if (!query) {
    return categories.map((category) => ({
      ...category,
      displayCount: getCategoryDisplayCount(category)
    }));
  }

  return categories
    .map((category) => {
      const categoryMatches = searchMatches([category.title, category.description], query);
      const matchingArticles = category.articles.filter((article) =>
        searchMatches([article.searchText], query)
      );

      if (!categoryMatches && matchingArticles.length === 0) {
        return null;
      }

      return {
        ...category,
        displayCount: getCategoryDisplayCount(category)
      };
    })
    .filter((category): category is VisibleCategory => category !== null);
}

function getMatchingArticleCount(articles: HelpArticleSummary[], query: string): number {
  if (!query) {
    return articles.length;
  }

  return articles.filter((article) =>
    searchMatches([article.searchText], query)
  ).length;
}

function searchMatches(values: string[], query: string): boolean {
  return values.some((value) => value.toLowerCase().includes(query));
}

function getCategoryDisplayCount(category: HelpCategory): number {
  return category.articles.length;
}

function getCategoryIcon(slug: string): LucideIcon {
  switch (slug) {
    case "getting-started":
      return Zap;
    case "capturing-leads":
      return RadioTower;
    case "lead-detail":
      return UserRoundCheck;
    case "recording-and-ai":
      return Bot;
    case "voice-notes":
      return Mic2;
    case "leads-list":
      return ListChecks;
    case "admin-portal":
      return ShieldCheck;
    case "leads-briefs":
      return UserRoundCheck;
    case "campaigns-follow-up":
      return CalendarCheck2;
    case "integrations-sync":
      return Settings2;
    case "priority":
      return Tags;
    case "offline":
      return WifiOff;
    case "permissions":
      return KeyRound;
    case "settings-and-account":
      return Settings2;
    default:
      return FileText;
  }
}
