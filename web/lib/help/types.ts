export type HelpArticleStatus = "published" | "preview" | "coming-soon" | "internal";

export type HelpDifficulty = "beginner" | "intermediate" | "advanced";

export type HelpScreenshotStatus = "captured" | "partial" | "needed" | "none";

export type HelpArticleManifestEntry = {
  slug: string;
  title: string;
  description: string;
  category: string;
  filePath: string;
  status: HelpArticleStatus;
  order: number;
  tags: string[];
  related: string[];
  sourceRoutes: string[];
  screenshotStatus: HelpScreenshotStatus;
};

export type HelpHeading = {
  depth: 2 | 3;
  id: string;
  text: string;
};

export type HelpArticle = HelpArticleManifestEntry & {
  categorySlug: string;
  subcategory: string;
  audience: string[];
  difficulty: HelpDifficulty;
  estimatedReadTime: number;
  lastReviewed: string;
  bodyMarkdown: string;
  headings: HelpHeading[];
};

export type HelpCategory = {
  slug: string;
  label: string;
  description: string;
  order: number;
  articleSlugs: string[];
  articleCount: number;
};

export type HelpSearchRecord = {
  id: string;
  articleSlug: string;
  title: string;
  description: string;
  category: string;
  categorySlug: string;
  heading: string | null;
  headingId: string | null;
  tags: string;
  body: string;
  excerptSource: string;
  status: Exclude<HelpArticleStatus, "internal">;
  order: number;
};

export type HelpSearchResult = {
  articleSlug: string;
  title: string;
  description: string;
  category: string;
  status: Exclude<HelpArticleStatus, "internal">;
  matchedHeading: string | null;
  matchKind: "title" | "tag" | "heading" | "category" | "description" | "body";
  href: string;
  excerpt: string;
  score: number;
};

export type ContextualHelpMapping = {
  pattern: string;
  query?: Readonly<Record<string, string>>;
  articleSlug: string;
  returnLabel: string;
};

export type ContextualHelpResolution = {
  href: string;
  label: string;
  ariaLabel: string;
  kind: "article" | "category" | "landing";
};

export type HelpArticleNeighbors = {
  previous: HelpArticle | null;
  next: HelpArticle | null;
};
