import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const landing = readFileSync("app/(shell)/help/page.tsx", "utf8");
const category = readFileSync("app/(shell)/help/category/[categorySlug]/page.tsx", "utf8");
const article = readFileSync("app/(shell)/help/article/[slug]/page.tsx", "utf8");
const search = readFileSync("app/(shell)/help/search/page.tsx", "utf8");
const status = readFileSync("app/(shell)/help/_components/help-status.tsx", "utf8");
const toc = readFileSync("app/(shell)/help/_components/help-table-of-contents.tsx", "utf8");
const accountNav = readFileSync("app/(shell)/_components/sidebar-nav.tsx", "utf8");
const eventShell = readFileSync("app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx", "utf8");
const contextualAction = readFileSync("app/(shell)/_components/contextual-help-action.tsx", "utf8");

test("landing contains required practical Help Center sections", () => {
  for (const text of [
    "Answers for planning, coordinating, and delivering events in Orca.",
    "Contact Support",
    "Product Walkthroughs",
    "Access and Account Help",
    "Featured guides",
    "Browse by topic",
  ]) assert.match(landing, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(landing, /FEATURED_HELP_ARTICLE_SLUGS/);
  assert.match(landing, /getCategorySummaries/);
  assert.doesNotMatch(landing, /Popular/);
});

test("category interface preserves manifest order metadata and empty state", () => {
  assert.match(category, /getArticlesByCategory/);
  assert.match(category, /estimatedReadTime/);
  assert.match(category, /HelpStatusBadge/);
  assert.match(category, /No articles are available in this topic yet/);
  assert.match(category, /HelpSearchForm/);
});

test("article interface includes complete metadata, status, toc, related, and pager", () => {
  for (const token of [
    "estimatedReadTime",
    "difficulty",
    "lastReviewed",
    "HelpStatusCallout",
    "HelpTableOfContents",
    "Related articles",
    "Article navigation",
    "View all",
  ]) assert.match(article, new RegExp(token));
  assert.match(article, /Skip to article/);
  assert.match(article, /HelpReturnLink/);
});

test("Preview and Coming Soon use restrained textual callouts", () => {
  assert.match(status, /This feature is in Preview/);
  assert.match(status, /This feature is Coming Soon/);
  assert.match(status, /border-blue-400/);
  assert.match(status, /border-amber-400/);
});

test("toc and layouts include responsive and accessibility-critical behavior", () => {
  assert.match(toc, /<details/);
  assert.match(toc, /xl:hidden/);
  assert.match(toc, /order-1/);
  assert.match(toc, /sticky top-6/);
  assert.match(toc, /aria-current/);
  assert.match(toc, /IntersectionObserver/);
  assert.match(landing, /sm:grid-cols-2/);
  assert.match(article, /sm:grid-cols-2/);
});

test("search and not-found states offer practical recovery", () => {
  assert.match(search, /No results for/);
  assert.match(search, /Browse Help topics/);
  const notFound = readFileSync("app/(shell)/help/not-found.tsx", "utf8");
  const articleNotFound = readFileSync("app/(shell)/help/article/[slug]/not-found.tsx", "utf8");
  assert.match(notFound, /This Help article is unavailable/);
  assert.match(notFound, /Return to Help Center/);
  assert.match(articleNotFound, /\.\.\/\.\.\/not-found/);
});

test("Help Center lives in the event Support navigation without duplicating contextual Help", () => {
  assert.doesNotMatch(accountNav, /label: "Resources"/);
  assert.doesNotMatch(accountNav, /href: "\/help"/);
  assert.match(contextualAction, /resolveContextualHelp/);
  assert.match(contextualAction, /aria-label/);
  assert.match(eventShell, /ContextualHelpAction/);
  assert.match(eventShell, /label: "Support"/);
  assert.match(eventShell, /label: "Help Center"/);
  assert.match(eventShell, /href: "\/help"/);
  assert.equal((eventShell.match(/label: "Help Center"/g) ?? []).length, 1);
  assert.equal((eventShell.match(/href: "\/help"/g) ?? []).length, 1);
  assert.doesNotMatch(eventShell, /help\/article/);
});
