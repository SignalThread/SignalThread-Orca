import MiniSearch, { type SearchResult as MiniSearchResult } from "minisearch";
import searchData from "@/src/generated/help/search-index.json";
import { getSearchTerms, normalizeHelpSearchQuery } from "./search-query";
import type { HelpArticleStatus, HelpSearchResult } from "./types";

type StoredSearchFields = {
  articleSlug: string;
  title: string;
  description: string;
  category: string;
  categorySlug: string;
  heading: string | null;
  headingId: string | null;
  excerptSource: string;
  status: string;
  order: number;
};

type GeneratedSearchIndex = {
  schemaVersion: number;
  sourceDigest: string;
  options: {
    fields: string[];
    storeFields: string[];
  };
  index: unknown;
};

const generated = searchData as unknown as GeneratedSearchIndex;
if (generated.schemaVersion !== 1) throw new Error("Generated Help search index uses an unsupported schema.");

const searchIndex = MiniSearch.loadJSON<StoredSearchFields>(JSON.stringify(generated.index), generated.options);

const aliases: Readonly<Record<string, string>> = {
  "f&b": "fnb food beverage",
  fnb: "f&b food beverage",
  ros: "run show",
  dashboard: "command center",
  documents: "docs hub",
};

function expandQuery(query: string): string {
  const normalized = query.trim().slice(0, 200);
  const additions = Object.entries(aliases)
    .filter(([term]) => normalized.toLowerCase() === term)
    .map(([, expansion]) => expansion);
  return [normalized, ...additions].join(" ");
}

function excerpt(source: string, rawQuery: string): string {
  const compact = source.replace(/\s+/g, " ").trim();
  if (compact.length <= 220) return compact;
  const terms = rawQuery.toLowerCase().split(/\s+/).filter((term) => term.length > 2);
  const lower = compact.toLowerCase();
  const match = terms.map((term) => lower.indexOf(term)).find((index) => index >= 0) ?? 0;
  const start = Math.max(0, match - 70);
  const end = Math.min(compact.length, start + 220);
  return `${start > 0 ? "..." : ""}${compact.slice(start, end).trim()}${end < compact.length ? "..." : ""}`;
}

function normalizeForRanking(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchedFields(result: MiniSearchResult): Set<string> {
  return new Set(Object.values(result.match).flat());
}

function fieldMatchesEveryTerm(result: MiniSearchResult, field: string, terms: string[]): boolean {
  return terms.length > 0 && terms.every((term) => Object.entries(result.match).some(([matchedTerm, fields]) => (
    fields.includes(field) && (matchedTerm.startsWith(term) || term.startsWith(matchedTerm))
  )));
}

function rankResult(result: MiniSearchResult & StoredSearchFields, query: string) {
  const fields = matchedFields(result);
  const normalizedQuery = normalizeForRanking(query);
  const normalizedTitle = normalizeForRanking(result.title);
  const terms = getSearchTerms(query);
  const exactTitle = normalizedTitle === normalizedQuery;
  const strongTitle = normalizedTitle.startsWith(normalizedQuery) || fieldMatchesEveryTerm(result, "title", terms);
  const exactHeading = Boolean(result.heading && normalizeForRanking(result.heading) === normalizedQuery);

  let matchKind: HelpSearchResult["matchKind"];
  let tier: number;
  if (exactTitle) [matchKind, tier] = ["title", 6];
  else if (strongTitle) [matchKind, tier] = ["title", 5];
  else if (fieldMatchesEveryTerm(result, "tags", terms)) [matchKind, tier] = ["tag", 4];
  else if (exactHeading || fieldMatchesEveryTerm(result, "heading", terms)) [matchKind, tier] = ["heading", 3];
  else if (fieldMatchesEveryTerm(result, "category", terms)) [matchKind, tier] = ["category", 3];
  else if (fieldMatchesEveryTerm(result, "description", terms)) [matchKind, tier] = ["description", 2];
  else if (fields.has("tags")) [matchKind, tier] = ["tag", 1];
  else if (fields.has("heading")) [matchKind, tier] = ["heading", 1];
  else if (fields.has("category")) [matchKind, tier] = ["category", 1];
  else if (fields.has("description")) [matchKind, tier] = ["description", 1];
  else [matchKind, tier] = ["body", 1];

  const headingExact = exactHeading ? 800 : 0;
  const phraseBonus = normalizeForRanking(result.excerptSource).includes(normalizedQuery) ? 300 : 0;
  return { matchKind, rankScore: tier * 10_000 + headingExact + phraseBonus + result.score };
}

export function searchHelpArticles(rawQuery: string, limit = 20): HelpSearchResult[] {
  const query = normalizeHelpSearchQuery(rawQuery);
  if (!query) return [];
  const results = searchIndex.search(expandQuery(query), {
    prefix: true,
    fuzzy: 0.2,
    combineWith: "OR",
    boost: { title: 8, heading: 6, tags: 5, description: 4, category: 2, body: 1 },
  }) as Array<MiniSearchResult & StoredSearchFields>;

  const byArticle = new Map<string, { result: MiniSearchResult & StoredSearchFields; matchKind: HelpSearchResult["matchKind"]; rankScore: number }>();
  for (const result of results) {
    if (result.status === "internal") continue;
    const ranked = rankResult(result, query);
    const current = byArticle.get(result.articleSlug);
    if (!current || ranked.rankScore > current.rankScore) byArticle.set(result.articleSlug, { result, ...ranked });
  }

  return [...byArticle.values()]
    .sort((a, b) => b.rankScore - a.rankScore || a.result.order - b.result.order || a.result.articleSlug.localeCompare(b.result.articleSlug))
    .slice(0, limit)
    .map(({ result, matchKind, rankScore }) => {
      const matchedHeading = (matchKind === "heading" || matchKind === "body") ? result.heading : null;
      const excerptSource = matchKind === "heading" || matchKind === "body" ? result.excerptSource : result.description;
      return {
      articleSlug: result.articleSlug,
      title: result.title,
      description: result.description,
      category: result.category,
      status: result.status as Exclude<HelpArticleStatus, "internal">,
      matchedHeading,
      matchKind,
      href: `/help/article/${result.articleSlug}${matchedHeading && result.headingId ? `#${result.headingId}` : ""}`,
      excerpt: excerpt(excerptSource || result.description, query),
      score: rankScore,
    }; });
}
