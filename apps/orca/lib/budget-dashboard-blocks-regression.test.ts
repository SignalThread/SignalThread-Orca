import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const blocksSource = readFileSync(
  "app/(shell)/events/[eventId]/budget/_components/budget-blocks-section.tsx",
  "utf8",
);
const dashboardSource = readFileSync(
  "app/(shell)/events/[eventId]/budget/_components/budget-dashboard.tsx",
  "utf8",
);
const blocksRoute = readFileSync("app/api/events/[eventId]/budget/blocks/route.ts", "utf8");
const targetsRoute = readFileSync("app/api/events/[eventId]/budget/category-targets/route.ts", "utf8");
const serviceSource = readFileSync("src/server/services/budget-sessions-groups.ts", "utf8");

// --- dashboard composition -------------------------------------------------

test("the dashboard renders the block-based section", () => {
  assert.match(dashboardSource, /import \{ BudgetBlocksSection \}/);
  assert.match(dashboardSource, /<BudgetBlocksSection eventId=\{eventId\}/);
});

test("dashboard puts KPI totals above block-based category cards", () => {
  const firstKpiIndex = dashboardSource.indexOf("<KpiCard");
  const blocksIndex = dashboardSource.indexOf("<BudgetBlocksSection eventId={eventId}");
  assert.ok(firstKpiIndex > -1, "KPI cards should render on the dashboard");
  assert.ok(blocksIndex > firstKpiIndex, "category blocks should render below KPI cards");
});

test("legacy lower Budget by Category card is removed", () => {
  assert.doesNotMatch(dashboardSource, /<h2[^>]*>Budget by Category<\/h2>/);
  assert.doesNotMatch(dashboardSource, /Forecast, actual use, and variance by category\./);
});

// --- category blocks -------------------------------------------------------

test("category cards render the canonical over-budget health in destructive red", () => {
  assert.match(blocksSource, /block\.budgetHealth === "OVER_BUDGET"/);
  assert.match(blocksSource, /\? "var\(--color-rose-500\)"/);
  assert.match(blocksSource, /Over budget/);
  assert.match(blocksSource, /bg-rose-500/);
});

test("category cards render the canonical warning health in the design-system yellow", () => {
  assert.match(blocksSource, /block\.budgetHealth === "APPROACHING_BUDGET"/);
  assert.match(blocksSource, /\? "var\(--color-amber-500\)"/);
  assert.match(blocksSource, /Near target/);
  assert.match(blocksSource, /bg-amber-500/);
});

test("category cards render server-calculated Forecast, Actual, Remaining, Utilization, and health", () => {
  assert.match(blocksSource, /getBudgetCategoryPillStyle\(block\.categoryKey\)/);
  assert.match(blocksSource, /categoryCardAppearance\(accent, block\.budgetHealth\)/);
  assert.match(blocksSource, /style=\{cardAppearance\}/);
  assert.match(blocksSource, /rounded-2xl border p-4 shadow-sm transition-colors/);
  assert.match(blocksSource, /h-2\.5 w-2\.5 shrink-0 rounded-full/);
  assert.match(blocksSource, /h-2 w-full rounded-full bg-slate-200/);
  assert.match(blocksSource, /formatMoney\(block\.actualCents\)/);
  assert.match(blocksSource, /formatMoney\(block\.remainingCents\)/);
  assert.match(blocksSource, /block\.utilizationPercent/);
  assert.match(blocksSource, /block\.budgetHealth/);
  assert.match(blocksSource, /Forecast \{formatMoney\(block\.forecastCents\)\}/);
  assert.doesNotMatch(blocksSource, /Exposure/);
  assert.doesNotMatch(blocksSource, /Variance/);
  assert.match(blocksSource, /h-full min-w-0 cursor-pointer rounded-2xl border p-4 shadow-sm transition-colors/);
  assert.doesNotMatch(blocksSource, /min-h-\[230px\]/);
  assert.doesNotMatch(blocksSource, /min-h-\[220px\]/);
  assert.doesNotMatch(blocksSource, /min-h-\[150px\]/);
});

test("category and group cards render through the shared responsive paged grid", () => {
  assert.match(blocksSource, /function PagedBudgetBlockSection<T>/);
  assert.match(blocksSource, /function useBudgetBlockGrid/);
  assert.match(blocksSource, /budgetBlockColumnCountForWidth/);
  assert.match(blocksSource, /ResizeObserver/);
  assert.match(blocksSource, /budgetBlockPageItems\(items, pageIndex, columns\)/);
  assert.match(blocksSource, /gridTemplateColumns: `repeat\(\$\{columns\}, minmax\(0, 1fr\)\)`/);
  assert.match(blocksSource, /data-budget-block-page-size=\{pageSize\}/);
  assert.match(blocksSource, /<PagedBudgetBlockSection[\s\S]*title="Categories"/);
  assert.match(blocksSource, /<PagedBudgetBlockSection[\s\S]*title="Groups"/);
  assert.match(blocksSource, /Show previous \$\{pageLabel\} page/);
  assert.match(blocksSource, /Show next \$\{pageLabel\} page/);
  assert.match(blocksSource, /disabled=\{!canPageBackward\}/);
  assert.match(blocksSource, /disabled=\{!canPageForward\}/);
  assert.match(blocksSource, /ChevronLeft/);
  assert.match(blocksSource, /ChevronRight/);
  assert.doesNotMatch(blocksSource, /categoryRailRef/);
  assert.doesNotMatch(blocksSource, /groupRailRef/);
  assert.doesNotMatch(blocksSource, /scrollRail/);
  assert.doesNotMatch(blocksSource, /scrollWidth/);
  assert.doesNotMatch(blocksSource, /overflow-x-auto/);
  assert.doesNotMatch(blocksSource, /snap-x/);
  assert.doesNotMatch(blocksSource, /overscroll-x-contain/);
  assert.doesNotMatch(blocksSource, /overflow-y-auto/);
  assert.doesNotMatch(blocksSource, /max-h-\[/);
});

test("category grid sorts active categories first and highlights selected category", () => {
  assert.match(blocksSource, /function categoryHasActivity/);
  assert.match(blocksSource, /actualCents > 0 \|\| block\.forecastCents > 0 \|\| block\.rowCount > 0/);
  assert.match(blocksSource, /Number\(categoryHasActivity\(right\)\) - Number\(categoryHasActivity\(left\)\)/);
  assert.match(blocksSource, /compareBudgetCategories\(left\.categoryLabel, right\.categoryLabel\)/);
  assert.match(blocksSource, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(blocksSource, /getBudgetCategoryDisplay\(block\.categoryKey\) === activeCategory/);
});

test("category cards use the canonical category color with a nearly-white wash", () => {
  assert.match(blocksSource, /const accent = getBudgetCategoryPillStyle\(block\.categoryKey\)/);
  assert.match(blocksSource, /`var\(--color-\$\{accent\.key\}-500\)`/);
  assert.match(blocksSource, /backgroundColor: `color-mix\(in srgb, \$\{color\} 3%, white\)`/);
  assert.match(blocksSource, /borderColor: `color-mix\(in srgb, \$\{color\} \$\{borderMix\}, white\)`/);
  assert.match(blocksSource, /accent\.dot/);
  assert.match(blocksSource, /accent\.bar/);
  const categoryCardSource = blocksSource.slice(blocksSource.indexOf("function CategoryCard"), blocksSource.indexOf("export function BudgetBlocksSection"));
  assert.doesNotMatch(categoryCardSource, /bg-(?:rose|amber|purple|blue|indigo|pink|cyan|violet|teal|emerald)-50(?!\d)/);
});

test("category-card status colors override the on-track category accent in priority order", () => {
  const appearanceStart = blocksSource.indexOf("function categoryCardAppearance");
  const appearance = blocksSource.slice(appearanceStart, appearanceStart + 1400);
  assert.match(appearance, /budgetHealth === "OVER_BUDGET"/);
  assert.match(appearance, /budgetHealth === "APPROACHING_BUDGET"/);
  assert.match(appearance, /budgetHealth === "UNCLASSIFIED"/);
  assert.match(appearance, /\? "40%" : "35%"/);
  assert.ok(appearance.indexOf('budgetHealth === "OVER_BUDGET"') < appearance.indexOf('budgetHealth === "APPROACHING_BUDGET"'));
  assert.ok(appearance.indexOf('budgetHealth === "APPROACHING_BUDGET"') < appearance.indexOf("accent.key"));
});

test("category cards do not let custom targets alter dashboard financials", () => {
  assert.doesNotMatch(blocksSource, /Target budget/);
  assert.doesNotMatch(blocksSource, /Set custom target/);
  assert.doesNotMatch(blocksSource, /parseBudgetCurrencyToCents/);
});

// --- group blocks + drilldowns ---------------------------------------------

test("groups section only renders when groups exist", () => {
  assert.match(blocksSource, /title="Groups"/);
  assert.match(blocksSource, /groups\.length > 0 \? \(/);
  assert.doesNotMatch(blocksSource, /No groups yet\. Groups are created from the budget grid\./);
});

test("dashboard groups render with the same tile system and shared grid tag colors", () => {
  assert.match(blocksSource, /budgetGroupColorTone\(group\.groupId, group\.groupName, group\.groupColor\)/);
  assert.match(blocksSource, /budgetGroupTagClasses\(group\.groupId, group\.groupName, group\.groupColor\)/);
  assert.match(blocksSource, /rounded-2xl border border-slate-200 bg-white p-4 shadow-sm/);
  assert.match(blocksSource, /h-2\.5 w-2\.5 shrink-0 rounded-full/);
  assert.match(blocksSource, /h-2 w-full rounded-full bg-slate-200/);
  assert.match(blocksSource, /formatMoney\(group\.actualCents\)/);
  assert.match(blocksSource, /Forecast \{formatMoney\(group\.forecastCents\)\}/);
  assert.match(blocksSource, /Over forecast/);
  assert.doesNotMatch(blocksSource, /min-h-\[96px\]/);
});

test("group cards use the shared paged grid and keep grid drilldown", () => {
  assert.match(blocksSource, /pageLabel="group cards"/);
  assert.match(blocksSource, /group\.groupId === activeGroupId/);
  assert.match(blocksSource, /href=\{gridHref\(eventId, \{ groupId: group\.groupId \}\)\}/);
  assert.match(blocksSource, /h-full min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300/);
});

test("category and group cards drill into the grid with stable filter params", () => {
  assert.match(blocksSource, /gridHref\(eventId, \{ category: block\.categoryKey \}\)/);
  assert.match(blocksSource, /gridHref\(eventId, \{ groupId: group\.groupId \}\)/);
  assert.match(blocksSource, /view: "grid"/);
});

// --- service + routes ------------------------------------------------------

test("blocks summary combines derived category and group totals", () => {
  assert.match(serviceSource, /export async function getBudgetBlocksSummary/);
  // B6: the Budget row is resolved once (read-only, no upsert) and its id is
  // passed into both total helpers so the summary does not upsert twice.
  assert.match(serviceSource, /getBudgetForEventReadOnly\(eventId\)/);
  assert.match(serviceSource, /getCategoryBudgetTotals\(eventId, budget\.id\)/);
  assert.match(serviceSource, /getGroupBudgetTotals\(eventId, budget\.id\)/);
});

test("category blocks derive health from the shared per-line money helper", () => {
  assert.match(serviceSource, /import \{[\s\S]*calculateBudgetCategoryHealth[\s\S]*\} from "@\/lib\/budget-money"/);
  assert.match(serviceSource, /const health = calculateBudgetCategoryHealth\(totals\.rows\)/);
  assert.match(serviceSource, /select: \{ category: true, forecastCents: true, actualCents: true \}/);
});

test("group blocks and selectors exclude persisted groups without current assigned rows", () => {
  assert.match(serviceSource, /if \(!totals \|\| totals\.rowCount === 0\) return \[\];/);
  assert.match(serviceSource, /export async function listBudgetGroups/);
  assert.match(serviceSource, /const groups = await getGroupBudgetTotals\(eventId\);/);
});

test("routes delegate to canonical helpers and gate target writes behind write access", () => {
  assert.match(blocksRoute, /getBudgetBlocksSummary/);
  assert.match(targetsRoute, /upsertBudgetCategoryTarget/);
  assert.match(targetsRoute, /requireBudgetRouteAccess\(request, eventId, "write"\)/);
});
