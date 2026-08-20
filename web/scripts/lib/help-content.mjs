import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import GithubSlugger from "github-slugger";
import { toString } from "mdast-util-to-string";
import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";

export const repoRoot = path.resolve(import.meta.dirname, "../../..");
export const helpRoot = path.join(repoRoot, "docs/help");
export const manifestPath = path.join(helpRoot, "help-manifest.json");
export const generatedRoot = path.join(repoRoot, "web/src/generated/help");

export const contributorFiles = new Set([
  "README.md",
  "CONTENT_AUDIT.md",
  "SCREENSHOT_PLAN.md",
  "EDITORIAL_REVIEW.md",
  "ACCEPTANCE_REPORT.md",
  "HELP_CENTER_IMPLEMENTATION_PLAN.md",
]);

export const categoryDefinitions = [
  { slug: "getting-started", label: "Getting Started", description: "Learn the Orca workspace, access model, event setup, and navigation.", order: 10 },
  { slug: "portfolio", label: "Portfolio", description: "Review account-wide event health, actions, reports, and settings.", order: 20 },
  { slug: "event-planning", label: "Event Planning", description: "Plan schedules, budgets, documents, settings, and event logistics.", order: 30 },
  { slug: "people-and-program", label: "People and Program", description: "Manage directory records, attendees, speakers, intake, and readiness.", order: 40 },
  { slug: "communications", label: "Communications", description: "Create and review marketing campaigns, audiences, sends, and compliance.", order: 50 },
  { slug: "collaboration", label: "Collaboration", description: "Understand notifications, approvals, tasks, and collaboration tools.", order: 60 },
  { slug: "administration", label: "Administration", description: "Use restricted platform administration workflows.", order: 70 },
  { slug: "workflows", label: "Workflows", description: "Follow end-to-end planning guides across multiple Orca modules.", order: 80 },
  { slug: "troubleshooting", label: "Troubleshooting", description: "Resolve common access, import, people, schedule, budget, and notification problems.", order: 90 },
];

function scalar(raw) {
  const value = raw.trim();
  if (value === "") return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number(value);
  if (value.startsWith('"')) return JSON.parse(value);
  return value;
}

export function parseFrontmatter(text, filePath) {
  if (!text.startsWith("---\n")) throw new Error(`${filePath}: missing opening frontmatter delimiter`);
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) throw new Error(`${filePath}: missing closing frontmatter delimiter`);

  const data = {};
  let listKey = null;
  for (const line of text.slice(4, end).split("\n")) {
    const item = line.match(/^\s{2}-\s+(.*)$/);
    if (item && listKey) {
      data[listKey].push(scalar(item[1]));
      continue;
    }
    const key = line.match(/^([A-Za-z][A-Za-z0-9]*):(?:\s*(.*))?$/);
    if (!key) throw new Error(`${filePath}: invalid frontmatter line: ${line}`);
    if ((key[2] ?? "").trim() === "") {
      data[key[1]] = [];
      listKey = key[1];
    } else {
      data[key[1]] = scalar(key[2]);
      listKey = null;
    }
  }
  return { data, body: text.slice(end + 5) };
}

export function readManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

export function computeSourceDigest(manifest = readManifest()) {
  const hash = crypto.createHash("sha256");
  hash.update(JSON.stringify(manifest));
  for (const entry of [...manifest].sort((a, b) => a.filePath.localeCompare(b.filePath))) {
    hash.update(entry.filePath);
    hash.update(fs.readFileSync(path.join(helpRoot, entry.filePath), "utf8"));
  }
  return hash.digest("hex");
}

function visibleText(node) {
  if (node.type === "html") return "";
  if (!node.children) return toString(node);
  return node.children.map(visibleText).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function resolveArticleLinks(node, articleFilePath, entryByFilePath) {
  if (!node.children) return;
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    if (child.type === "link" && typeof child.url === "string") {
      const match = child.url.match(/^([^?#]+\.mdx?)(#[^?]*)?$/i);
      if (match) {
        const targetFile = path
          .relative(helpRoot, path.resolve(path.dirname(path.join(helpRoot, articleFilePath)), match[1]))
          .replaceAll(path.sep, "/");
        const target = entryByFilePath.get(targetFile);
        if (!target) throw new Error(`${articleFilePath}: cannot resolve Help article link ${child.url}`);
        if (target.status === "internal") {
          node.children.splice(index, 1, ...(child.children ?? []));
          index += (child.children?.length ?? 1) - 1;
          continue;
        }
        child.url = `/help/article/${target.slug}${match[2] ?? ""}`;
      }
    }
    resolveArticleLinks(child, articleFilePath, entryByFilePath);
  }
}

function prepareArticleBody(body, article, entryByFilePath) {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkStringify, {
    bullet: "-",
    fences: true,
  });
  const tree = processor.parse(body);
  const first = tree.children[0];
  if (first?.type === "heading" && first.depth === 1) {
    const heading = toString(first).trim();
    if (heading !== article.title) throw new Error(`${article.filePath}: leading H1 must match frontmatter title`);
    tree.children.shift();
  }

  const relatedHeadingIndex = tree.children.findIndex(
    (child) => child.type === "heading" && child.depth === 2 && toString(child).trim() === "Related Articles",
  );
  if (relatedHeadingIndex >= 0) {
    const nextSectionOffset = tree.children
      .slice(relatedHeadingIndex + 1)
      .findIndex((child) => child.type === "heading" && child.depth === 2);
    const deleteCount = nextSectionOffset >= 0
      ? nextSectionOffset + 1
      : tree.children.length - relatedHeadingIndex;
    tree.children.splice(relatedHeadingIndex, deleteCount);
  }

  resolveArticleLinks(tree, article.filePath, entryByFilePath);

  const slugger = new GithubSlugger();
  const headings = [];
  for (const child of tree.children) {
    if (child.type !== "heading" || (child.depth !== 2 && child.depth !== 3)) continue;
    const text = toString(child).trim();
    headings.push({ depth: child.depth, id: slugger.slug(text), text });
  }

  const sections = [];
  let current = { heading: null, headingId: null, nodes: [] };
  let headingIndex = 0;
  for (const child of tree.children) {
    if (child.type === "heading" && (child.depth === 2 || child.depth === 3)) {
      if (current.nodes.length > 0) sections.push(current);
      const heading = headings[headingIndex++];
      current = { heading: heading?.text ?? toString(child).trim(), headingId: heading?.id ?? null, nodes: [] };
      continue;
    }
    current.nodes.push(child);
  }
  if (current.nodes.length > 0) sections.push(current);

  return {
    bodyMarkdown: String(processor.stringify(tree)).trim() + "\n",
    headings,
    plainText: visibleText(tree),
    sections: sections.map((section) => ({
      heading: section.heading,
      headingId: section.headingId,
      body: section.nodes.map(visibleText).filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
    })).filter((section) => section.body || section.heading),
  };
}

export function loadHelpSource() {
  const manifest = readManifest();
  const entryByFilePath = new Map(manifest.map((entry) => [entry.filePath, entry]));
  const categoryByLabel = new Map(categoryDefinitions.map((category) => [category.label, category]));
  const articles = manifest.map((entry) => {
    const source = fs.readFileSync(path.join(helpRoot, entry.filePath), "utf8");
    const { data, body } = parseFrontmatter(source, entry.filePath);
    const category = categoryByLabel.get(data.category);
    if (!category) throw new Error(`${entry.filePath}: unknown Help category ${data.category}`);
    const article = { ...entry, ...data, categorySlug: category.slug };
    return { ...article, ...prepareArticleBody(body, article, entryByFilePath) };
  });

  const categories = categoryDefinitions.map((category) => ({
    ...category,
    articleSlugs: articles
      .filter((article) => article.category === category.label)
      .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
      .map((article) => article.slug),
  }));

  return { manifest, articles, categories, sourceDigest: computeSourceDigest(manifest) };
}
