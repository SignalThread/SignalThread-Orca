import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const budgetPageSource = readFileSync("app/(shell)/budgets/page.tsx", "utf8");
const fullBudgetGridSource = readFileSync("app/(shell)/budgets/_components/full-budget-grid.tsx", "utf8");
const eventBudgetPageSource = readFileSync("app/(shell)/events/[eventId]/budget/page.tsx", "utf8");

test("account budget page delegates to the reusable full budget grid", () => {
  assert.equal(
    budgetPageSource.includes('import { FullBudgetGrid } from "./_components/full-budget-grid";'),
    true,
  );
  assert.equal(budgetPageSource.includes("export default function BudgetsPage()"), true);
  assert.equal(budgetPageSource.includes("return <FullBudgetGrid />;"), true);
  assert.equal(budgetPageSource.includes("FullBudgetGridProps"), false);
});

test("full budget grid preserves the prior client component props", () => {
  assert.equal(fullBudgetGridSource.startsWith('"use client";'), true);
  assert.equal(fullBudgetGridSource.includes("export type FullBudgetGridProps"), true);
  assert.equal(fullBudgetGridSource.includes("eventIdOverride?: string;"), true);
  assert.equal(fullBudgetGridSource.includes("hideEventSelector?: boolean;"), true);
  assert.equal(
    fullBudgetGridSource.includes(
      "export function FullBudgetGrid({ eventIdOverride = \"\", hideEventSelector = false }: FullBudgetGridProps)",
    ),
    true,
  );
});

test("event budget grid view still renders the reusable full budget grid with scoped event props", () => {
  assert.equal(
    eventBudgetPageSource.includes('import { FullBudgetGrid } from "@/app/(shell)/budgets/_components/full-budget-grid";'),
    true,
  );
  assert.equal(eventBudgetPageSource.includes('firstSearchParam(resolvedSearchParams.view) === "grid"'), true);
  assert.equal(eventBudgetPageSource.includes("<FullBudgetGrid eventIdOverride={eventId} hideEventSelector />"), true);
});
