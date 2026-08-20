import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rootSchema = readFileSync("../prisma/schema.prisma", "utf8");
const webSchema = readFileSync("prisma/schema.prisma", "utf8");
const rootMigration = readFileSync("../prisma/migrations/20260710120000_add_session_fnb_tax_configuration/migration.sql", "utf8");
const webMigration = readFileSync("prisma/migrations/20260710120000_add_session_fnb_tax_configuration/migration.sql", "utf8");
const serviceSource = readFileSync("lib/fnb-catalog.ts", "utf8");
const planRouteSource = readFileSync("app/api/events/[eventId]/matrix-2/sessions/[sessionId]/fnb-plan/route.ts", "utf8");
const assignmentRouteSource = readFileSync("app/api/events/[eventId]/matrix-2/sessions/[sessionId]/fnb-catalog-assignments/[assignmentId]/route.ts", "utf8");
const workspaceSource = readFileSync("app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx", "utf8");

test("both Prisma schemas carry the approved normalized F&B tax structure", () => {
  for (const schema of [rootSchema, webSchema]) {
    assert.match(schema, /fnbTaxPercent\s+Decimal\s+@default\(0\) @db\.Decimal\(7, 4\)/);
    assert.match(schema, /fnbServiceChargePercent\s+Decimal\s+@default\(0\) @db\.Decimal\(7, 4\)/);
    assert.match(schema, /taxes\s+SessionFnbCatalogAssignmentTax\[\]/);
    assert.match(schema, /model SessionFnbCatalogAssignmentTax \{[\s\S]*percentage\s+Decimal\s+@db\.Decimal\(7, 4\)/);
    assert.match(schema, /assignment\s+SessionFnbCatalogAssignment\s+@relation\(fields: \[assignmentId\], references: \[id\], onDelete: Cascade\)/);
    assert.match(schema, /@@index\(\[assignmentId, sortOrder\]\)/);
  }
});

test("mirrored migration is additive, defaults existing sessions to zero, and cascades item taxes", () => {
  assert.equal(rootMigration, webMigration);
  assert.match(rootMigration, /ADD COLUMN "fnbTaxPercent" DECIMAL\(7,4\) NOT NULL DEFAULT 0/);
  assert.match(rootMigration, /ADD COLUMN "fnbServiceChargePercent" DECIMAL\(7,4\) NOT NULL DEFAULT 0/);
  assert.match(rootMigration, /CREATE TABLE "SessionFnbCatalogAssignmentTax"/);
  assert.match(rootMigration, /ON DELETE CASCADE ON UPDATE CASCADE/);
});

test("plan and assignment writes enforce authentication, write access, and thin routes", () => {
  assert.match(planRouteSource, /resolveRequestUser\(request\)/);
  assert.match(planRouteSource, /assertEventAccessForUser\(eventId, authResult\.user, "write"\)/);
  assert.match(planRouteSource, /updateSessionFnbPlan\(eventId, sessionId, body\)/);
  assert.match(assignmentRouteSource, /assertEventAccessForUser\(eventId, authResult\.user, "write"\)/);
  assert.match(assignmentRouteSource, /updateSessionFnbCatalogAssignment\(eventId, sessionId, assignmentId, body\)/);
});

test("service rejects cross-event sessions and assignments and validates percentages server-side", () => {
  assert.match(serviceSource, /where: \{ id: sessionId, eventId \}/);
  assert.match(serviceSource, /id: assignmentId,[\s\S]*sessionId,[\s\S]*catalogItem: \{ eventId \}/);
  assert.match(serviceSource, /normalizePercentage\(input\.taxPercent, "taxPercent"\)/);
  assert.match(serviceSource, /normalizeAssignmentTaxes\(input\.taxes\)/);
});

test("all relevant F&B mutations are transactional and budget forecasts use canonical all-in totals", () => {
  assert.match(serviceSource, /createSessionFnbCatalogAssignment[\s\S]*getPrisma\(\)\.\$transaction/);
  assert.match(serviceSource, /updateSessionFnbCatalogAssignment[\s\S]*getPrisma\(\)\.\$transaction/);
  assert.match(serviceSource, /updateSessionFnbPlan[\s\S]*getPrisma\(\)\.\$transaction/);
  assert.match(serviceSource, /updateFnbCatalogItem[\s\S]*getPrisma\(\)\.\$transaction/);
  assert.match(serviceSource, /forecastCents: calculation\.totalCents \?\? 0/);
  assert.match(serviceSource, /await assertBudgetLineEditable\(tx, assignment\.budgetLineItemId\)/);
  assert.match(serviceSource, /await syncAssignmentBudgetLine\(tx, eventId, assignment\.id\)/);
  assert.doesNotMatch(serviceSource, /Preserve locked budget approvals/);
});

test("F&B Planner autosaves session rates and unlimited assignment tax editing", () => {
  assert.match(workspaceSource, />Tax</);
  assert.match(workspaceSource, />Service charge</);
  assert.doesNotMatch(workspaceSource, />Save Session</);
  assert.match(workspaceSource, /function handleWorkspaceSave\(\) \{[\s\S]*if \(activeTab === "fnb"\) return;[\s\S]*void handleSave\(\);/);
  assert.match(workspaceSource, /onSave=\{handleWorkspaceSave\}/);
  assert.match(workspaceSource, /showSave=\{activeTab !== "fnb" && activeTab !== "show-flow"\}/);
  assert.match(workspaceSource, /disabled=\{isSaving \|\| saveDisabled\}/);
  assert.match(workspaceSource, /function addFnbAssignmentTax/);
  assert.match(workspaceSource, /function updateFnbAssignmentTax/);
  assert.match(workspaceSource, /function removeFnbAssignmentTax/);
  assert.match(workspaceSource, /assignment\.taxes\.map/);
  assert.match(workspaceSource, /<Plus[^>]*>[\s\S]*Add tax|<Plus[^/]*\/>[\s\S]*Add tax/);
  assert.match(workspaceSource, /Remove/);
  assert.match(workspaceSource, /taxes: assignment\.taxes\.map/);
  assert.match(workspaceSource, /useFnbAutosaveCoordinator/);
  assert.doesNotMatch(workspaceSource, /function saveFnbAssignment/);
});

test("F&B session rate inputs format to two decimals and preserve failed-save drafts", () => {
  assert.match(workspaceSource, /function formatFnbPercentageForInput\(value: unknown\): string \{[\s\S]*Math\.round\(parsed \* 100\) \/ 100\)\.toFixed\(2\)/);
  assert.match(workspaceSource, /useState\("0\.00"\)/);
  assert.match(workspaceSource, /setFnbTaxPercentText\(formatFnbPercentageForInput\(plan\.taxPercent\)\)/);
  assert.match(workspaceSource, /setFnbServiceChargePercentText\(formatFnbPercentageForInput\(plan\.serviceChargePercent\)\)/);
  assert.match(workspaceSource, /const taxPercentInput = formatFnbPercentageForInput\(fnbTaxPercentText\)/);
  assert.match(workspaceSource, /const serviceChargePercentInput = formatFnbPercentageForInput\(fnbServiceChargePercentText\)/);
  assert.match(workspaceSource, /step="0\.01"/);
  assert.match(workspaceSource, /aria-label="F&B tax percent"/);
  assert.match(workspaceSource, /aria-label="F&B service charge percent"/);
  assert.match(workspaceSource, /onBlur=\{\(\) => \{[\s\S]*flushFnbPlanAutosave\(\)/);
  assert.match(workspaceSource, /function flushFnbPlanAutosave\(\)[\s\S]*setFnbTaxPercentText\(formatFnbPercentageForInput\(fnbTaxPercentText\)\)/);
  assert.match(workspaceSource, /body: JSON\.stringify\(\{[\s\S]*taxPercent: payload\.taxPercent,[\s\S]*serviceChargePercent: payload\.serviceChargePercent,/);
  assert.match(workspaceSource, /fnbAutosaveStatus\.state === "error"/);
  assert.match(workspaceSource, /retryFnbAutosave/);
});

test("Budget-linked F&B additional item tax percentages display as two-decimal rates", () => {
  assert.match(workspaceSource, /function formatOptionalFnbPercentageForInput\(value: unknown\): string \{[\s\S]*return ""/);
  assert.match(workspaceSource, /formatFnbPercentageForInput\(raw\)/);
  assert.match(workspaceSource, /function formatFnbAssignmentTaxesForInput/);
  assert.match(workspaceSource, /percentage: formatOptionalFnbPercentageForInput\(tax\.percentage\)/);
  assert.match(workspaceSource, /setFnbAssignments\([\s\S]*\.map\(formatFnbAssignmentTaxesForInput\)/);
  assert.match(workspaceSource, /function blurFnbAssignmentTaxPercentage/);
  assert.match(workspaceSource, /onBlur=\{\(\) => blurFnbAssignmentTaxPercentage\(assignment\.id, tax\.id\)\}/);
  assert.match(workspaceSource, /step="0\.01"[\s\S]*value=\{tax\.percentage\}/);
  assert.match(workspaceSource, /taxes: assignment\.taxes\.map\(\(tax\) => \(\{[\s\S]*percentage: formatOptionalFnbPercentageForInput\(tax\.percentage\)/);

  const formatter = new Function(
    "value",
    `
      const raw = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
      if (!raw) return "";
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return raw;
      return (Math.round(parsed * 100) / 100).toFixed(2);
    `,
  ) as (value: unknown) => string;

  assert.equal(formatter("10.0000"), "10.00");
  assert.equal(formatter("5.0000"), "5.00");
  assert.equal(formatter("25.0000"), "25.00");
  assert.equal(formatter("7"), "7.00");
  assert.equal(formatter("7.5"), "7.50");
  assert.equal(formatter("7.555"), "7.56");
  assert.equal(formatter(""), "");
});

test("compact F&B header exposes autosave state instead of a competing save action", () => {
  const fnbHeaderStart = workspaceSource.indexOf('className={`${FNB_WORKSPACE_GRID_CLASS} items-start border-b border-slate-200 px-4 py-2.5 sm:px-5`}');
  assert.ok(fnbHeaderStart > -1, "compact F&B header not found");
  const fnbHeaderEnd = workspaceSource.indexOf("<FnbSourceMenusSection", fnbHeaderStart);
  assert.ok(fnbHeaderEnd > fnbHeaderStart, "F&B header end not found");
  const fnbHeaderSource = workspaceSource.slice(fnbHeaderStart, fnbHeaderEnd);

  assert.match(fnbHeaderSource, /F&B Planner/);
  assert.match(fnbHeaderSource, /Food operations/);
  assert.match(fnbHeaderSource, /xl:col-span-2/);
  assert.match(fnbHeaderSource, /xl:col-start-3/);
  assert.match(fnbHeaderSource, /w-\[7\.75rem\]/);
  assert.match(fnbHeaderSource, /w-\[8\.5rem\]/);
  assert.match(fnbHeaderSource, /h-8 items-center/);
  assert.match(fnbHeaderSource, /Saving…/);
  assert.match(fnbHeaderSource, />Saved</);
  assert.match(fnbHeaderSource, />Retry</);
  assert.doesNotMatch(fnbHeaderSource, /Save Session|void saveFnbPlan\(\)/);
});

test("Source Menus header aligns actions to the shared F&B grid without hijacking button clicks", () => {
  const sourceMenusStart = workspaceSource.indexOf("function FnbSourceMenusSection({");
  assert.ok(sourceMenusStart > -1, "FnbSourceMenusSection not found");
  const sourceMenusEnd = workspaceSource.indexOf("function SessionModuleTabs({", sourceMenusStart);
  assert.ok(sourceMenusEnd > sourceMenusStart, "FnbSourceMenusSection end not found");
  const sourceMenusSource = workspaceSource.slice(sourceMenusStart, sourceMenusEnd);

  assert.match(sourceMenusSource, /const summary = `\$\{menus\.length\} menu/);
  assert.match(sourceMenusSource, /approvedItemCount\} approved item/);
  assert.match(sourceMenusSource, /className=\{`relative \$\{FNB_WORKSPACE_GRID_CLASS\} items-center px-4 py-2\.5 sm:px-5`\}/);
  assert.match(sourceMenusSource, /xl:col-span-2/);
  assert.match(sourceMenusSource, /xl:col-start-3/);
  assert.match(sourceMenusSource, /<p className="mt-0\.5 text-\[11px\] leading-snug text-slate-500">\{summary\}<\/p>/);
  assert.match(sourceMenusSource, /pointer-events-none relative z-10 flex min-w-0 flex-wrap items-center gap-2/);
  assert.match(sourceMenusSource, /pointer-events-auto inline-flex h-8[\s\S]*Edit Catalog/);
  assert.match(sourceMenusSource, /pointer-events-auto inline-flex h-8[\s\S]*Upload Menu/);
});

test("responsive F&B layout keeps estimate visible and stacks in the required mobile order", () => {
  assert.doesNotMatch(workspaceSource, /min-w-\[1120px\]/);
  assert.doesNotMatch(workspaceSource, /grid-cols-\[308px_minmax\(520px,1fr\)_260px\]/);
  assert.match(workspaceSource, /const FNB_WORKSPACE_GRID_CLASS =\s+"grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-\[minmax\(260px,320px\)_minmax\(0,1fr\)\] xl:grid-cols-\[minmax\(280px,308px\)_minmax\(0,1fr\)_minmax\(300px,340px\)\]"/);
  assert.match(workspaceSource, /className=\{`\$\{FNB_WORKSPACE_GRID_CLASS\} items-start`\}/);
  assert.match(workspaceSource, /order-1[^"]*lg:order-2/);
  assert.match(workspaceSource, /order-2[^"]*lg:order-1/);
  assert.match(workspaceSource, /order-3[^"]*lg:col-span-2 xl:col-span-1 xl:col-start-3/);
  assert.match(workspaceSource, /sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1/);
  assert.match(workspaceSource, /bg-slate-100\/60 px-4 py-4 sm:px-5/);
});

test("estimate panel renders the authoritative transparent tax breakdown", () => {
  for (const label of ["F&B subtotal", "Tax ·", "Service charge ·", "Additional item taxes", "Total estimated cost", "Per person cost", "Forecast attendance"]) {
    assert.match(workspaceSource, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(workspaceSource, /fnbAssignmentEstimate\.subtotalCents/);
  assert.match(workspaceSource, /fnbAssignmentEstimate\.taxCents/);
  assert.match(workspaceSource, /fnbAssignmentEstimate\.serviceChargeCents/);
  assert.match(workspaceSource, /fnbAssignmentEstimate\.additionalTaxCents/);
  assert.match(workspaceSource, /fnbAssignmentEstimate\.totalEstimatedCents/);
});

test("Source Menus accordion preserves setup access, actions, drafts, and source-menu summaries", () => {
  assert.match(workspaceSource, /const isExpanded = !hasMenus \|\| expanded/);
  assert.match(workspaceSource, /setIsFnbSourceMenusExpanded\(nextSourceMenus\.length === 0\)/);
  assert.match(workspaceSource, /const summary = `\$\{menus\.length\} menu/);
  assert.match(workspaceSource, /approvedItemCount\} approved item/);
  assert.match(workspaceSource, /fnbLibraryItems\.filter\(\(item\) => item\.sourceMenuId && sourceMenuIds\.has\(item\.sourceMenuId\)\)\.length/);
  assert.match(workspaceSource, /onClick=\{onToggle\}[\s\S]{0,260}aria-controls="fnb-source-menus-content"/);
  assert.match(workspaceSource, /pointer-events-none relative z-10 flex min-w-0 flex-wrap items-center gap-2 lg:justify-self-end xl:col-start-3[\s\S]{0,1000}pointer-events-auto inline-flex h-8/);
  assert.match(workspaceSource, /\{isExpanded \? \([\s\S]{0,450}<FnbSourceMenusTable/);
  assert.match(workspaceSource, /onArchive=\{onArchive\}[\s\S]{0,120}onRerun=\{onRerun\}/);
  assert.match(workspaceSource, /const sourceMenu = normalizeFnbSourceMenuRecord\([\s\S]{0,180}setIsFnbSourceMenusExpanded\(true\)/);
  assert.match(workspaceSource, /onToggle=\{\(\) => setIsFnbSourceMenusExpanded\(\(current\) => !current\)\}/);
  assert.doesNotMatch(workspaceSource, /onToggle=\{\(\) =>[\s\S]{0,160}loadFnbCatalogItems/);
});

test("F&B catalog reads preserve prior state on malformed responses and validate destructive success", () => {
  assert.match(workspaceSource, /F&B catalog response was invalid/);
  assert.match(workspaceSource, /if \(!nextItems \|\| !nextSourceMenus/);
  assert.doesNotMatch(workspaceSource, /setFnbLibraryItems\(\[\]\);\s*setFnbSourceMenus\(\[\]\);/);
  assert.match(workspaceSource, /payload\.id !== menu\.id/);
  assert.match(workspaceSource, /payload\.status !== "ARCHIVED"/);
  assert.match(workspaceSource, /payload\.sourceMenuId !== menu\.id/);
  assert.match(workspaceSource, /Number\.isInteger\(payload\.deletedCatalogItemCount\)/);
});
