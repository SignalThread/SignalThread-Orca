import Link from "next/link";
import type { ReactNode } from "react";
import { createHeadingId, resolveHelpMarkdownHref } from "@/lib/help/help-content";

type HelpMarkdownProps = {
  markdown: string;
  currentCategorySlug: string;
};

type MarkdownBlock =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "blockquote"; text: string }
  | { type: "code"; language: string; code: string }
  | { type: "table"; rows: string[][] }
  | { type: "rule" };

export function HelpMarkdown({ markdown, currentCategorySlug }: HelpMarkdownProps) {
  const headingIds = new Map<string, number>();
  const blocks = parseMarkdownBlocks(markdown);

  return (
    <div className="space-y-6">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const baseId = createHeadingId(block.text);
          const count = headingIds.get(baseId) ?? 0;
          headingIds.set(baseId, count + 1);
          const id = count === 0 ? baseId : `${baseId}-${count + 1}`;
          const HeadingTag = `h${block.level}` as "h2" | "h3" | "h4";
          const headingClassName =
            block.level === 2
              ? "scroll-mt-28 text-2xl font-bold tracking-tight text-slate-950"
              : block.level === 3
                ? "scroll-mt-28 text-xl font-semibold tracking-tight text-slate-900"
                : "scroll-mt-28 text-lg font-semibold text-slate-900";

          return (
            <HeadingTag key={`${block.type}-${id}`} id={id} className={headingClassName}>
              {renderInline(block.text, currentCategorySlug)}
            </HeadingTag>
          );
        }

        if (block.type === "paragraph") {
          return (
            <p key={`${block.type}-${index}`} className="text-base leading-8 text-slate-700">
              {renderInline(block.text, currentCategorySlug)}
            </p>
          );
        }

        if (block.type === "unordered-list") {
          return (
            <ul
              key={`${block.type}-${index}`}
              className="ml-5 list-disc space-y-2 text-base leading-7 text-slate-700"
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>{renderInline(item, currentCategorySlug)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === "ordered-list") {
          return (
            <ol
              key={`${block.type}-${index}`}
              className="ml-5 list-decimal space-y-2 text-base leading-7 text-slate-700"
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>{renderInline(item, currentCategorySlug)}</li>
              ))}
            </ol>
          );
        }

        if (block.type === "blockquote") {
          return (
            <blockquote
              key={`${block.type}-${index}`}
              className="rounded-2xl border border-sky-100 bg-sky-50 px-5 py-4 text-sm leading-7 text-slate-700"
            >
              {renderInline(block.text, currentCategorySlug)}
            </blockquote>
          );
        }

        if (block.type === "code") {
          return (
            <pre
              key={`${block.type}-${index}`}
              className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-950 p-5 text-sm leading-7 text-slate-100"
            >
              <code>{block.code}</code>
            </pre>
          );
        }

        if (block.type === "table") {
          const [headerRow, ...bodyRows] = block.rows;
          return (
            <div
              key={`${block.type}-${index}`}
              className="overflow-x-auto rounded-2xl border border-slate-200"
            >
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {headerRow.map((cell, cellIndex) => (
                      <th
                        key={`${cell}-${cellIndex}`}
                        className="px-4 py-3 text-left font-semibold text-slate-900"
                      >
                        {renderInline(cell, currentCategorySlug)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {bodyRows.map((row, rowIndex) => (
                    <tr key={`${row.join("-")}-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`${cell}-${cellIndex}`} className="px-4 py-3 text-slate-700">
                          {renderInline(cell, currentCategorySlug)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return <hr key={`${block.type}-${index}`} className="border-slate-200" />;
      })}
    </div>
  );
}

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "code", language, code: codeLines.join("\n") });
      index += 1;
      continue;
    }

    if (trimmed === "---") {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{2,4})\s+(.+)$/);
    if (heading?.[1] && heading[2]) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 2 | 3 | 4,
        text: heading[2]
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "blockquote", text: quoteLines.join(" ") });
      continue;
    }

    if (isTableStart(lines, index)) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        tableLines.push(lines[index]);
        index += 1;
      }
      const rows = tableLines
        .filter((tableLine) => !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(tableLine))
        .map((tableLine) => splitTableRow(tableLine));
      blocks.push({ type: "table", rows });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "unordered-list", items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "ordered-list", items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function isBlockStart(lines: string[], index: number): boolean {
  const trimmed = lines[index].trim();
  return (
    trimmed.startsWith("```") ||
    trimmed === "---" ||
    /^(#{2,4})\s+/.test(trimmed) ||
    trimmed.startsWith(">") ||
    isTableStart(lines, index) ||
    /^[-*]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed)
  );
}

function isTableStart(lines: string[], index: number): boolean {
  const current = lines[index]?.trim() ?? "";
  const next = lines[index + 1]?.trim() ?? "";
  return current.includes("|") && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(next);
}

function splitTableRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderInline(text: string, currentCategorySlug: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenPattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${token}-${match.index}`} className="font-semibold text-slate-950">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={`${token}-${match.index}`}
          className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.92em] font-medium text-slate-900"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link?.[1] && link[2]) {
        const href = resolveHelpMarkdownHref(link[2], currentCategorySlug);
        const isExternal = href.startsWith("http://") || href.startsWith("https://");
        nodes.push(
          <Link
            key={`${token}-${match.index}`}
            href={href}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noreferrer" : undefined}
            className="font-semibold text-sky-700 underline decoration-sky-200 underline-offset-4 transition hover:text-sky-900 hover:decoration-sky-400"
          >
            {link[1]}
          </Link>
        );
      }
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}
