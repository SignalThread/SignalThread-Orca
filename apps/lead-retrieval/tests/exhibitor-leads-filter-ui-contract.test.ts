import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd());

test("leads table keeps filters visually distinct from sort controls", () => {
  const source = readFileSync(join(root, "components/leads/exhibitor-leads-table.tsx"), "utf8");
  assert.match(source, /aria-label="Lead filters"/);
  assert.match(source, /Narrow the lead list\. Sorting is separate\./);
  assert.match(source, /aria-label="Sort leads"/);
  assert.match(source, /<span className="text-xs font-semibold text-slate-500">Sort:<\/span>/);
  assert.match(source, /Clear filters/);
  assert.doesNotMatch(source, /LEADS_INTELLIGENCE_TABLE_CHIPS/);
  assert.doesNotMatch(source, /parseLeadsTemperatureView/);
  assert.doesNotMatch(source, /role="toolbar"/);
  assert.doesNotMatch(source, /SortDirectionGlyph/);
  assert.doesNotMatch(source, /data-testid="leads-filter-hot"/);
  assert.doesNotMatch(source, /data-testid="leads-filter-warm"/);
  assert.doesNotMatch(source, /data-testid="leads-filter-cold"/);
});

test("leads table sorting still composes over filtered rows", () => {
  const source = readFileSync(join(root, "components/leads/exhibitor-leads-table.tsx"), "utf8");
  assert.match(source, /if \(!sortState\) return filteredRows/);
  assert.match(source, /const next = \[\.\.\.filteredRows\]/);
});

test("leads table routes approval review to workflows source of truth", () => {
  const source = readFileSync(join(root, "components/leads/exhibitor-leads-table.tsx"), "utf8");
  assert.match(source, /lead-card-review-approval/);
  assert.match(source, /workflow\?\.reviewHref/);
  assert.doesNotMatch(source, /Approve<\/button>[\s\S]*Reject<\/button>/);
});

test("leads page rewrites legacy temperature drilldown params into canonical filters", () => {
  const pageSource = readFileSync(join(root, "app/(app)/exhibitor/leads/page.tsx"), "utf8");
  assert.match(pageSource, /const legacyTemperature = parseLeadTemperature\(rawViewParam\)/);
  assert.match(pageSource, /if \(hasLegacyDrilldown \|\| rawViewParam !== null\)/);
  assert.match(pageSource, /params\.set\("temperature", legacyTemperature\)/);
  assert.doesNotMatch(pageSource, /buildExhibitorLeadsIntelligenceHref/);
});
