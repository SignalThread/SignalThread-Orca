-- Budget sections redesign: session links, user-defined groups, category targets.
-- All additions are nullable / new tables so existing budgets remain valid.

-- 1. Optional session + group links on budget rows (nullable-first).
ALTER TABLE "BudgetLineItem"
ADD COLUMN "matrixRowId" UUID,
ADD COLUMN "groupId" UUID;

-- 2. User-defined, budget-scoped groups.
CREATE TABLE "BudgetGroup" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetGroup_pkey" PRIMARY KEY ("id")
);

-- 3. Dashboard-editable category target budgets (independent of rows).
CREATE TABLE "BudgetCategoryTarget" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "categoryLabel" TEXT,
    "targetAmountCents" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" UUID,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetCategoryTarget_pkey" PRIMARY KEY ("id")
);

-- 4. Indexes.
CREATE INDEX "BudgetLineItem_budgetId_matrixRowId_idx" ON "BudgetLineItem"("budgetId", "matrixRowId");
CREATE INDEX "BudgetLineItem_budgetId_groupId_idx" ON "BudgetLineItem"("budgetId", "groupId");

CREATE UNIQUE INDEX "BudgetGroup_budgetId_normalizedName_key" ON "BudgetGroup"("budgetId", "normalizedName");
CREATE INDEX "BudgetGroup_budgetId_sortOrder_idx" ON "BudgetGroup"("budgetId", "sortOrder");

CREATE UNIQUE INDEX "BudgetCategoryTarget_budgetId_categoryKey_key" ON "BudgetCategoryTarget"("budgetId", "categoryKey");
CREATE INDEX "BudgetCategoryTarget_budgetId_idx" ON "BudgetCategoryTarget"("budgetId");

-- 5. Foreign keys.
ALTER TABLE "BudgetLineItem"
ADD CONSTRAINT "BudgetLineItem_matrixRowId_fkey"
FOREIGN KEY ("matrixRowId") REFERENCES "MatrixRow"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BudgetLineItem"
ADD CONSTRAINT "BudgetLineItem_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "BudgetGroup"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BudgetGroup"
ADD CONSTRAINT "BudgetGroup_budgetId_fkey"
FOREIGN KEY ("budgetId") REFERENCES "Budget"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BudgetCategoryTarget"
ADD CONSTRAINT "BudgetCategoryTarget_budgetId_fkey"
FOREIGN KEY ("budgetId") REFERENCES "Budget"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Backfill session links ONLY where a provable source relationship exists:
--    an F&B catalog assignment that already points at a budget line item carries
--    the canonical session (MatrixRow) for that generated row. We never infer a
--    session from legacy subcategory text.
UPDATE "BudgetLineItem" AS bli
SET "matrixRowId" = sfca."sessionId"
FROM "SessionFnbCatalogAssignment" AS sfca
WHERE sfca."budgetLineItemId" = bli."id"
  AND bli."matrixRowId" IS NULL;
