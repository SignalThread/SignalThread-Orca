import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const boardSource = readFileSync("app/(shell)/timeline/_components/TimelineBoardView.tsx", "utf8");
const pageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");

test("roadmap board cards expose a keyboard-accessible item action", () => {
  assert.match(boardSource, /onOpenItem: \(itemId: string\) => void/);
  assert.match(boardSource, /type="button"[\s\S]*onClick=\{\(\) => onOpenItem\(item\.id\)\}[\s\S]*Open item/);
  assert.match(boardSource, /aria-label=\{`Open \$\{item\.title\}`\}/);
});

test("opening a board item reuses the canonical timeline quick-edit experience", () => {
  assert.match(pageSource, /setSelectedTimelineItemId\(itemId\);\s*setViewMode\("TIMELINE"\);/);
  assert.match(pageSource, /selectedItemId=\{selectedTimelineItemId\}/);
});

test("board columns reflow from practical card width rather than a framework breakpoint", () => {
  assert.match(boardSource, /repeat\(auto-fit, minmax\(min\(100%, 240px\), 1fr\)\)/);
  assert.doesNotMatch(boardSource, /xl:grid-cols-5/);
});
