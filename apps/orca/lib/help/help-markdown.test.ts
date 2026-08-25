import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { HelpMarkdown } from "../../app/(shell)/help/_components/help-markdown";

test("Markdown renderer supports required elements and stable heading IDs", () => {
  const markdown = [
    "## A Heading",
    "",
    "Paragraph with **bold**, *italic*, and [Help](/help/article/welcome-to-orca).",
    "",
    "- One",
    "- Two",
    "",
    "> Guidance",
    "",
    "| A | B |",
    "| - | - |",
    "| 1 | 2 |",
    "",
    "```ts",
    "const value = 1;",
    "```",
    "",
    "---",
    "",
    "![Budget](/help/screenshots/hc-16-use-the-budget-dashboard.png)",
  ].join("\n");
  const html = renderToStaticMarkup(createElement(HelpMarkdown, { markdown }));

  assert.match(html, /id="a-heading"/);
  assert.match(html, /<strong/);
  assert.match(html, /<em/);
  assert.match(html, /<ul/);
  assert.match(html, /<blockquote/);
  assert.match(html, /<table/);
  assert.match(html, /<pre/);
  assert.match(html, /<hr/);
  assert.match(html, /src="\/help\/screenshots\/hc-16-use-the-budget-dashboard.png"/);
});

test("Markdown renderer treats external links safely and does not render raw HTML", () => {
  const html = renderToStaticMarkup(createElement(HelpMarkdown, {
    markdown: "[External](https://example.com)\n\n<script>unsafe()</script>",
  }));
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noreferrer noopener"/);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /&lt;script&gt;unsafe\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /node="\[object Object\]"/);
});
