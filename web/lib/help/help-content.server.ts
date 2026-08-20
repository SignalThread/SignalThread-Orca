import contentData from "@/src/generated/help/content.json";
import type {
  HelpArticle,
  HelpArticleNeighbors,
  HelpCategory,
} from "./types";

type GeneratedHelpContent = {
  schemaVersion: number;
  sourceDigest: string;
  generatedAt: string;
  categories: Array<Omit<HelpCategory, "articleCount">>;
  articles: HelpArticle[];
};

const content = contentData as unknown as GeneratedHelpContent;

if (content.schemaVersion !== 1 || !Array.isArray(content.articles) || !Array.isArray(content.categories)) {
  throw new Error("Generated Help content is missing or uses an unsupported schema. Run npm run help:generate.");
}

const publicArticles = content.articles
  .filter((article) => article.status !== "internal")
  .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
const publicBySlug = new Map(publicArticles.map((article) => [article.slug, article]));

export function getAllPublicArticles(): HelpArticle[] {
  return [...publicArticles];
}

export function getArticleBySlug(slug: string): HelpArticle | null {
  return publicBySlug.get(slug) ?? null;
}

export function getArticlesByCategory(categorySlug: string): HelpArticle[] {
  return publicArticles.filter((article) => article.categorySlug === categorySlug);
}

export function getCategorySummaries(): HelpCategory[] {
  return content.categories
    .map((category) => {
      const articleSlugs = category.articleSlugs.filter((slug) => publicBySlug.has(slug));
      return { ...category, articleSlugs, articleCount: articleSlugs.length };
    })
    .filter((category) => category.articleCount > 0)
    .sort((a, b) => a.order - b.order);
}

export function getCategoryBySlug(categorySlug: string): HelpCategory | null {
  return getCategorySummaries().find((category) => category.slug === categorySlug) ?? null;
}

export function getRelatedArticles(articleOrSlug: HelpArticle | string): HelpArticle[] {
  const article = typeof articleOrSlug === "string" ? getArticleBySlug(articleOrSlug) : articleOrSlug;
  if (!article || article.status === "internal") return [];
  return article.related.flatMap((slug) => {
    const related = publicBySlug.get(slug);
    return related ? [related] : [];
  });
}

export function getPreviousAndNextArticles(articleOrSlug: HelpArticle | string): HelpArticleNeighbors {
  const article = typeof articleOrSlug === "string" ? getArticleBySlug(articleOrSlug) : articleOrSlug;
  if (!article || article.status === "internal") return { previous: null, next: null };
  const categoryArticles = getArticlesByCategory(article.categorySlug);
  const index = categoryArticles.findIndex((candidate) => candidate.slug === article.slug);
  return {
    previous: index > 0 ? categoryArticles[index - 1] : null,
    next: index >= 0 && index < categoryArticles.length - 1 ? categoryArticles[index + 1] : null,
  };
}

export function getArticleHeadings(articleOrSlug: HelpArticle | string) {
  const article = typeof articleOrSlug === "string" ? getArticleBySlug(articleOrSlug) : articleOrSlug;
  return article && article.status !== "internal" ? [...article.headings] : [];
}

export function getFeaturedArticles(featuredSlugs: readonly string[] = []): HelpArticle[] {
  return featuredSlugs.flatMap((slug) => {
    const article = publicBySlug.get(slug);
    return article ? [article] : [];
  });
}

export function getHelpContentInfo() {
  return { schemaVersion: content.schemaVersion, sourceDigest: content.sourceDigest, generatedAt: content.generatedAt };
}

