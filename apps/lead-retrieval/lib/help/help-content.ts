import fs from "node:fs";
import path from "node:path";

export type HelpTocItem = {
  id: string;
  level: 2 | 3;
  title: string;
};

export type HelpArticleSummary = {
  slug: string;
  title: string;
  description: string;
  searchText: string;
  href: string;
  categorySlug: string;
  categoryTitle: string;
  order: number;
};

export type HelpCategory = {
  slug: string;
  title: string;
  description: string;
  href: string;
  articles: HelpArticleSummary[];
};

export type HelpRelatedArticle = HelpArticleSummary & {
  sourceLabel: string;
};

export type HelpArticle = HelpArticleSummary & {
  body: string;
  toc: HelpTocItem[];
  relatedArticles: HelpRelatedArticle[];
  previousArticle: HelpArticleSummary | null;
  nextArticle: HelpArticleSummary | null;
};

type ParsedMarkdown = {
  body: string;
  frontmatter: Record<string, string | string[]>;
};

const HELP_DOCS_ROOT = path.join(process.cwd(), "docs", "help");

const CATEGORY_DEFINITIONS = [
  {
    slug: "getting-started",
    title: "Getting Started",
    description: "Set up your event, team, and mobile app so lead capture is ready before the floor opens."
  },
  {
    slug: "capturing-leads",
    title: "Capturing Leads",
    description: "Capture leads from anywhere on the event floor using badge scanning, business card capture, or quick manual entry."
  },
  {
    slug: "lead-detail",
    title: "Lead Detail",
    description: "Turn each captured lead into a complete follow-up record with ratings, notes, AI context, and next steps."
  },
  {
    slug: "recording-and-ai",
    title: "Recording and AI",
    description: "Record conversations, prepare smarter meetings, and understand how AI turns event context into actionable insights."
  },
  {
    slug: "voice-notes",
    title: "Voice Notes",
    description: "Capture the details that matter after a conversation, keep transcripts moving, and enrich AI insights over time."
  },
  {
    slug: "leads-list",
    title: "Leads List",
    description: "Keep your pipeline organized with fast search, clear lead cards, and efficient list-level updates."
  },
  {
    slug: "admin-portal",
    title: "Admin Portal",
    description: "Manage users, roles, invites, access, licenses, and account settings."
  },
  {
    slug: "leads-briefs",
    title: "Leads & Briefs",
    description: "Import leads, manage lead records, export data, and prepare sales teams with Pre-Sales Briefs."
  },
  {
    slug: "campaigns-follow-up",
    title: "Campaigns & Follow-Up",
    description: "Build campaigns, choose recipients, use Campaign Agents, and prepare follow-up messaging."
  },
  {
    slug: "integrations-sync",
    title: "Integrations & Sync",
    description: "Connect supported systems, map fields, manage sync behavior, and troubleshoot integration issues."
  },
  {
    slug: "priority",
    title: "Priority",
    description: "Focus the team on the leads most likely to convert, follow up quickly, or need executive attention."
  },
  {
    slug: "offline",
    title: "Offline",
    description: "Keep capturing leads and voice notes when venue Wi-Fi is crowded, then sync automatically when connection returns."
  },
  {
    slug: "permissions",
    title: "Permissions",
    description: "Make sure camera and microphone access are ready for smooth scanning, recording, and event-floor workflows."
  },
  {
    slug: "settings-and-account",
    title: "Settings and Account",
    description: "Manage event context, capture preferences, profile details, and account controls from one operational hub."
  }
] as const;

const CATEGORY_BY_SLUG: Map<string, (typeof CATEGORY_DEFINITIONS)[number]> = new Map(
  CATEGORY_DEFINITIONS.map((category) => [category.slug, category])
);

export function getHelpCategories(): HelpCategory[] {
  return CATEGORY_DEFINITIONS.map((category) => {
    const articles = getArticleSummariesForCategory(category.slug);
    return {
      slug: category.slug,
      title: category.title,
      description: category.description,
      href: `/help/${category.slug}`,
      articles
    };
  });
}

export function getAllHelpArticles(): HelpArticleSummary[] {
  return getHelpCategories().flatMap((category) => category.articles);
}

export function getHelpCategory(categorySlug: string): HelpCategory | null {
  const normalizedCategorySlug = normalizeSlug(categorySlug);
  return getHelpCategories().find((category) => category.slug === normalizedCategorySlug) ?? null;
}

export function getHelpArticle(categorySlug: string, articleSlug: string): HelpArticle | null {
  const category = getHelpCategory(categorySlug);
  if (!category) {
    return null;
  }

  const normalizedArticleSlug = normalizeSlug(articleSlug);
  const summary = category.articles.find((article) => article.slug === normalizedArticleSlug);
  if (!summary) {
    return null;
  }

  const markdown = readArticleMarkdown(category.slug, summary.slug);
  if (!markdown) {
    return null;
  }

  const { body } = readArticleParts(markdown);
  const bodyWithoutIntro = removeLeadingDescriptionParagraph(body, summary.description);
  const displayBody = removeRelatedArticlesSection(bodyWithoutIntro);
  const articleIndex = category.articles.findIndex((article) => article.slug === summary.slug);
  return {
    ...summary,
    body: displayBody,
    toc: extractToc(displayBody),
    relatedArticles: extractRelatedArticles(body, category.slug),
    previousArticle: category.articles[articleIndex - 1] ?? null,
    nextArticle: category.articles[articleIndex + 1] ?? null
  };
}

export function getHelpArticleStaticParams(): Array<{ category: string; slug: string }> {
  return getAllHelpArticles().map((article) => ({
    category: article.categorySlug,
    slug: article.slug
  }));
}

export function getHelpCategoryStaticParams(): Array<{ category: string }> {
  return getHelpCategories().map((category) => ({
    category: category.slug
  }));
}

export function createHeadingId(title: string): string {
  const normalized = stripMarkdown(title)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  return normalized || "section";
}

export function resolveHelpMarkdownHref(href: string, currentCategorySlug: string): string {
  if (
    href.startsWith("#") ||
    href.startsWith("/") ||
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:")
  ) {
    return href;
  }

  const [hrefPath, hash] = href.split("#");
  if (!hrefPath.endsWith(".md")) {
    return href;
  }

  const normalizedPath = path.posix.normalize(path.posix.join(currentCategorySlug, hrefPath));
  const [categorySlug, fileName] = normalizedPath.split("/");
  if (!categorySlug || !fileName) {
    return href;
  }

  const articleSlug = fileName.replace(/\.md$/, "");
  return `/help/${categorySlug}/${articleSlug}${hash ? `#${hash}` : ""}`;
}

function getArticleSummariesForCategory(categorySlug: string): HelpArticleSummary[] {
  const category = CATEGORY_BY_SLUG.get(categorySlug);
  if (!category) {
    return [];
  }

  return getMarkdownFiles(categorySlug)
    .map((fileName): HelpArticleSummary | null => {
      const slug = fileName.replace(/\.md$/, "");
      const markdown = readArticleMarkdown(categorySlug, slug);
      if (!markdown) {
        return null;
      }

      const parsedMarkdown = parseFrontmatter(markdown);
      const { frontmatter, body } = readArticleParts(markdown);
      const title = getArticleTitle(parsedMarkdown.body, frontmatter, slug);
      const description = getArticleDescription(body, frontmatter);
      return {
        slug,
        title,
        description,
        searchText: buildArticleSearchText({
          title,
          description,
          body,
          categoryTitle: category.title
        }),
        href: `/help/${categorySlug}/${slug}`,
        categorySlug,
        categoryTitle: category.title,
        order: getArticleOrder(frontmatter)
      };
    })
    .filter((article): article is HelpArticleSummary => article !== null)
    .sort(compareArticles);
}

function getMarkdownFiles(categorySlug: string): string[] {
  const categoryPath = path.join(HELP_DOCS_ROOT, categorySlug);
  if (!fs.existsSync(categoryPath)) {
    return [];
  }

  return fs
    .readdirSync(categoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name);
}

function readArticleMarkdown(categorySlug: string, articleSlug: string): string | null {
  const articlePath = path.join(HELP_DOCS_ROOT, categorySlug, `${articleSlug}.md`);
  if (!articlePath.startsWith(HELP_DOCS_ROOT) || !fs.existsSync(articlePath)) {
    return null;
  }

  return fs.readFileSync(articlePath, "utf8");
}

function readArticleParts(markdown: string): ParsedMarkdown {
  const parsed = parseFrontmatter(markdown);
  const withoutTitle = removeFirstHeading(parsed.body);
  return {
    frontmatter: parsed.frontmatter,
    body: withoutTitle.trim()
  };
}

function parseFrontmatter(markdown: string): ParsedMarkdown {
  if (!markdown.startsWith("---\n")) {
    return {
      body: markdown,
      frontmatter: {}
    };
  }

  const closingIndex = markdown.indexOf("\n---", 4);
  if (closingIndex === -1) {
    return {
      body: markdown,
      frontmatter: {}
    };
  }

  const frontmatterBlock = markdown.slice(4, closingIndex).trim();
  const body = markdown.slice(closingIndex + 4);
  const frontmatter: Record<string, string | string[]> = {};
  for (const line of frontmatterBlock.split(/\r?\n/)) {
    const [rawKey, ...rawValueParts] = line.split(":");
    const key = rawKey?.trim();
    const value = rawValueParts.join(":").trim();
    if (!key || !value) {
      continue;
    }
    if (value.startsWith("[") && value.endsWith("]")) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    } else {
      frontmatter[key] = value.replace(/^['"]|['"]$/g, "");
    }
  }

  return { body, frontmatter };
}

function removeFirstHeading(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => /^#\s+/.test(line));
  if (headingIndex === -1) {
    return markdown;
  }

  lines.splice(headingIndex, 1);
  return lines.join("\n");
}

function removeRelatedArticlesSection(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const relatedHeadingIndex = lines.findIndex((line) => /^##\s+Related Articles\s*$/i.test(line));
  if (relatedHeadingIndex === -1) {
    return markdown;
  }

  return lines.slice(0, relatedHeadingIndex).join("\n").trim();
}

function removeLeadingDescriptionParagraph(markdown: string, description: string): string {
  const trimmedMarkdown = markdown.trim();
  const normalizedDescription = normalizeMarkdownParagraph(description);

  if (!trimmedMarkdown || !normalizedDescription) {
    return trimmedMarkdown;
  }

  const paragraphs = trimmedMarkdown.split(/\n\s*\n/);
  const firstParagraph = paragraphs[0]?.trim();
  if (!firstParagraph) {
    return trimmedMarkdown;
  }

  if (normalizeMarkdownParagraph(firstParagraph) !== normalizedDescription) {
    return trimmedMarkdown;
  }

  return paragraphs.slice(1).join("\n\n").trim();
}

function getArticleTitle(
  markdownBody: string,
  frontmatter: Record<string, string | string[]>,
  slug: string
): string {
  const frontmatterTitle = frontmatter.title;
  if (typeof frontmatterTitle === "string" && frontmatterTitle.trim()) {
    return frontmatterTitle.trim();
  }

  const heading = markdownBody.match(/^#\s+(.+)$/m);
  if (heading?.[1]) {
    return stripMarkdown(heading[1]).trim();
  }

  return titleFromSlug(slug);
}

function getArticleDescription(
  markdownBody: string,
  frontmatter: Record<string, string | string[]>
): string {
  const frontmatterDescription = frontmatter.description;
  if (typeof frontmatterDescription === "string" && frontmatterDescription.trim()) {
    return frontmatterDescription.trim();
  }

  const paragraph = markdownBody
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .find((block) => {
      return (
        block &&
        !block.startsWith("#") &&
        !block.startsWith("---") &&
        !block.startsWith("|") &&
        !block.startsWith("- ")
      );
    });

  if (!paragraph) {
    return "Step-by-step guidance for this part of the SignalThread Scan workflow.";
  }

  return stripMarkdown(paragraph).replace(/\s+/g, " ").trim();
}

function getArticleOrder(frontmatter: Record<string, string | string[]>): number {
  const rawOrder = frontmatter.order;
  if (typeof rawOrder !== "string") {
    return Number.MAX_SAFE_INTEGER;
  }

  const order = Number.parseInt(rawOrder, 10);
  return Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER;
}

function buildArticleSearchText({
  title,
  description,
  body,
  categoryTitle
}: {
  title: string;
  description: string;
  body: string;
  categoryTitle: string;
}): string {
  return stripMarkdown([title, description, categoryTitle, body].join(" "))
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function compareArticles(a: HelpArticleSummary, b: HelpArticleSummary): number {
  if (a.order !== b.order) {
    return a.order - b.order;
  }
  return a.title.localeCompare(b.title);
}

function extractToc(markdownBody: string): HelpTocItem[] {
  const headingIds = new Map<string, number>();
  return markdownBody
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^(##|###)\s+(.+)$/);
      if (!match) {
        return null;
      }

      const title = stripMarkdown(match[2]).trim();
      const baseId = createHeadingId(title);
      const count = headingIds.get(baseId) ?? 0;
      headingIds.set(baseId, count + 1);

      return {
        id: count === 0 ? baseId : `${baseId}-${count + 1}`,
        level: match[1] === "##" ? 2 : 3,
        title
      };
    })
    .filter((item): item is HelpTocItem => item !== null);
}

function extractRelatedArticles(markdownBody: string, currentCategorySlug: string): HelpRelatedArticle[] {
  const lines = markdownBody.split(/\r?\n/);
  const relatedHeadingIndex = lines.findIndex((line) => /^##\s+Related Articles\s*$/i.test(line));
  if (relatedHeadingIndex === -1) {
    return [];
  }

  return lines
    .slice(relatedHeadingIndex + 1)
    .map((line) => line.match(/^\s*[-*]\s+\[([^\]]+)\]\(([^)]+)\)/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => {
      const href = resolveHelpMarkdownHref(match[2], currentCategorySlug);
      const article = getAllHelpArticles().find((item) => item.href === href);
      if (!article) {
        return null;
      }
      return {
        ...article,
        sourceLabel: match[1]
      };
    })
    .filter((article): article is HelpRelatedArticle => article !== null);
}

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stripMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~>#]/g, "")
    .trim();
}

function normalizeMarkdownParagraph(value: string): string {
  return stripMarkdown(value).replace(/\s+/g, " ").trim();
}
