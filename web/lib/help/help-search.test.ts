import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GET } from "@/app/api/help/search/route";
import { searchHelpArticles } from "./help-search.server";
import { getSearchHighlightSegments } from "./search-highlight";
import { getNextSuggestionIndex, normalizeHelpSearchQuery } from "./search-query";

test("exact and strong title matches rank first", () => {
  const exact = searchHelpArticles("Use the Budget Dashboard");
  assert.equal(exact[0]?.articleSlug, "use-the-budget-dashboard");
  assert.equal(exact[0]?.matchKind, "title");

  const strong = searchHelpArticles("budget approval");
  assert.deepEqual(strong.slice(0, 2).map((result) => result.matchKind), ["title", "title"]);
});

test("heading matches keep the strongest anchor and collapse duplicate articles", () => {
  const results = searchHelpArticles("Review Budget Health");
  const budget = results.find((result) => result.articleSlug === "use-the-budget-dashboard");
  assert.ok(budget);
  assert.equal(budget.matchKind, "heading");
  assert.equal(budget.matchedHeading, "Review Budget Health");
  assert.match(budget.href, /#review-budget-health$/);
  assert.equal(new Set(results.map((result) => result.articleSlug)).size, results.length);
});

test("tag and body-only matches are classified transparently", () => {
  const tag = searchHelpArticles("critical-path")[0];
  assert.equal(tag?.articleSlug, "use-the-roadmap");
  assert.equal(tag?.matchKind, "tag");

  const body = searchHelpArticles("benchmarks")[0];
  assert.equal(body?.articleSlug, "use-the-budget-dashboard");
  assert.equal(body?.matchKind, "body");
});

test("search covers descriptions and categories", () => {
  assert.ok(searchHelpArticles("variance").some((result) => result.articleSlug === "use-the-budget-dashboard"));
  assert.ok(searchHelpArticles("troubleshooting").some((result) => result.category === "Troubleshooting"));
});

test("aliases work, empty queries return nothing, and internal articles never appear", () => {
  assert.ok(searchHelpArticles("FNB").length > 0);
  assert.ok(searchHelpArticles("ROS").some((result) => result.articleSlug === "use-the-run-of-show"));
  assert.equal(searchHelpArticles("Platform Administration").some((result) => result.articleSlug === "use-platform-administration"), false);
  assert.deepEqual(searchHelpArticles("qzxvplm"), []);
  assert.deepEqual(searchHelpArticles("   "), []);
});

test("query normalization and local suggestion endpoint preserve URL search state", async () => {
  assert.equal(normalizeHelpSearchQuery(["  budget approval  ", "ignored"]), "budget approval");
  const response = await GET(new Request("http://orca.test/api/help/search?q=budget+approval&limit=3"));
  const payload = await response.json() as { query: string; results: Array<{ articleSlug: string }> };
  assert.equal(payload.query, "budget approval");
  assert.equal(payload.results.length, 3);
  assert.equal(payload.results[0]?.articleSlug, "submit-and-review-budget-approvals");
});

test("keyboard suggestion movement wraps without trapping focus", () => {
  assert.equal(getNextSuggestionIndex(-1, "ArrowDown", 3), 0);
  assert.equal(getNextSuggestionIndex(2, "ArrowDown", 3), 0);
  assert.equal(getNextSuggestionIndex(0, "ArrowUp", 3), 2);
  assert.equal(getNextSuggestionIndex(1, "Home", 3), 0);
  assert.equal(getNextSuggestionIndex(1, "End", 3), 2);
  assert.equal(getNextSuggestionIndex(-1, "ArrowDown", 0), -1);
});

test("highlighting marks query terms while preserving all text", () => {
  const text = "Review budget health without losing readability.";
  const segments = getSearchHighlightSegments(text, "budget health");
  assert.equal(segments.map((segment) => segment.text).join(""), text);
  assert.deepEqual(segments.filter((segment) => segment.matched).map((segment) => segment.text), ["budget", "health"]);
});

test("search interfaces retain URL, keyboard, clear, and focus contracts", () => {
  const form = readFileSync("app/(shell)/help/_components/help-search-form.tsx", "utf8");
  const page = readFileSync("app/(shell)/help/search/page.tsx", "utf8");
  assert.match(form, /action="\/help\/search"/);
  assert.match(form, /aria-activedescendant/);
  assert.match(form, /event\.key === "Escape"/);
  assert.match(form, /Clear Help search/);
  assert.match(form, /setTimeout[\s\S]*180/);
  assert.match(page, /normalizeHelpSearchQuery/);
  assert.match(page, /help-search-results-status/);
  assert.match(page, /HelpSearchHighlight/);
});
