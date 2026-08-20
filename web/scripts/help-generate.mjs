import fs from "node:fs";
import path from "node:path";
import MiniSearch from "minisearch";
import { generatedRoot, loadHelpSource } from "./lib/help-content.mjs";

const schemaVersion = 1;
const { articles, categories, sourceDigest } = loadHelpSource();
const contentPath = path.join(generatedRoot, "content.json");
const searchPath = path.join(generatedRoot, "search-index.json");

let generatedAt = new Date().toISOString();
if (fs.existsSync(contentPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(contentPath, "utf8"));
    if (existing.sourceDigest === sourceDigest && typeof existing.generatedAt === "string") generatedAt = existing.generatedAt;
  } catch {
    // A malformed prior artifact is replaced below.
  }
}

const contentArticles = articles.map(({ plainText, sections, ...article }) => article);
const content = { schemaVersion, sourceDigest, generatedAt, categories, articles: contentArticles };

const searchRecords = [];
for (const article of articles) {
  if (article.status === "internal") continue;
  const sections = article.sections.length > 0
    ? article.sections
    : [{ heading: null, headingId: null, body: article.plainText }];
  sections.forEach((section, index) => {
    searchRecords.push({
      id: `${article.slug}:${index}`,
      articleSlug: article.slug,
      title: article.title,
      description: article.description,
      category: article.category,
      categorySlug: article.categorySlug,
      heading: section.heading,
      headingId: section.headingId,
      tags: article.tags.join(" "),
      body: section.body,
      excerptSource: section.body || article.description,
      status: article.status,
      order: article.order,
    });
  });
}

const searchOptions = {
  fields: ["title", "heading", "tags", "description", "category", "body"],
  storeFields: ["articleSlug", "title", "description", "category", "categorySlug", "heading", "headingId", "excerptSource", "status", "order"],
};
const miniSearch = new MiniSearch(searchOptions);
miniSearch.addAll(searchRecords);
const search = { schemaVersion, sourceDigest, generatedAt, options: searchOptions, index: miniSearch.toJSON() };

fs.mkdirSync(generatedRoot, { recursive: true });
fs.writeFileSync(contentPath, JSON.stringify(content, null, 2) + "\n");
fs.writeFileSync(searchPath, JSON.stringify(search, null, 2) + "\n");
console.log(`Generated ${articles.length} Help articles and ${searchRecords.length} search sections.`);

