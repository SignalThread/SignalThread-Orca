import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getAllPublicArticles,
  getArticleBySlug,
  getArticleHeadings,
  getArticlesByCategory,
  getCategorySummaries,
  getFeaturedArticles,
  getPreviousAndNextArticles,
  getRelatedArticles,
  getHelpContentInfo,
} from "./help-content.server";

test("generated content matches the validated manifest and excludes internal articles publicly", () => {
  const manifest = JSON.parse(readFileSync("../../docs/help/help-manifest.json", "utf8")) as Array<{ slug: string; status: string }>;
  const publicManifest = manifest.filter((entry) => entry.status !== "internal");
  const articles = getAllPublicArticles();

  assert.equal(manifest.length, 67);
  assert.equal(articles.length, publicManifest.length);
  assert.deepEqual(articles.map((article) => article.slug).sort(), publicManifest.map((article) => article.slug).sort());
  assert.equal(getArticleBySlug("use-platform-administration"), null);
  assert.equal(getArticleBySlug("not-a-real-help-slug"), null);
  assert.equal(getHelpContentInfo().schemaVersion, 1);
});

test("category grouping exposes only non-empty public categories", () => {
  const categories = getCategorySummaries();
  assert.equal(categories.some((category) => category.slug === "administration"), false);
  assert.ok(categories.find((category) => category.slug === "event-planning")?.articleCount);
  assert.ok(getArticlesByCategory("event-planning").every((article) => article.categorySlug === "event-planning"));
});

test("article bodies contain screenshot paths and stable headings without duplicating related navigation", () => {
  const article = getArticleBySlug("use-the-budget-dashboard");
  assert.ok(article);
  assert.match(article.bodyMarkdown, /\/help\/screenshots\//);
  assert.doesNotMatch(article.bodyMarkdown, /^## Related Articles$/m);
  const headings = getArticleHeadings(article);
  assert.ok(headings.length > 5);
  assert.equal(headings[0]?.text, "Overview");
  assert.equal(headings[0]?.id, "overview");
  assert.equal(new Set(headings.map((heading) => heading.id)).size, headings.length);
});

test("public Markdown never creates a route to an internal article", () => {
  for (const article of getAllPublicArticles()) {
    assert.doesNotMatch(article.bodyMarkdown, /\/help\/article\/use-platform-administration/, article.slug);
  }
  assert.doesNotMatch(getArticleBySlug("understand-organizations-and-access")?.bodyMarkdown ?? "", /Use Platform Administration/);
});

test("related articles and category neighbors resolve through public slugs", () => {
  const article = getArticleBySlug("use-the-budget-dashboard");
  assert.ok(article);
  const related = getRelatedArticles(article);
  assert.ok(related.some((item) => item.slug === "manage-the-full-budget-grid"));
  assert.ok(related.every((item) => item.status !== "internal"));

  const neighbors = getPreviousAndNextArticles(article);
  assert.ok(neighbors.previous || neighbors.next);
  assert.equal(neighbors.previous?.categorySlug ?? article.categorySlug, article.categorySlug);
  assert.equal(neighbors.next?.categorySlug ?? article.categorySlug, article.categorySlug);
});

test("featured article lookup is configuration-driven and public-only", () => {
  assert.deepEqual(getFeaturedArticles(), []);
  assert.deepEqual(
    getFeaturedArticles(["welcome-to-orca", "use-platform-administration"]).map((article) => article.slug),
    ["welcome-to-orca"],
  );
});
