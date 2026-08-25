-- Add an optional 1:1 link from session requirement selections to budget line items.
ALTER TABLE "SessionRequirementSelection"
ADD COLUMN "budgetLineItemId" UUID;

CREATE UNIQUE INDEX "SessionRequirementSelection_budgetLineItemId_key"
ON "SessionRequirementSelection"("budgetLineItemId");

ALTER TABLE "SessionRequirementSelection"
ADD CONSTRAINT "SessionRequirementSelection_budgetLineItemId_fkey"
FOREIGN KEY ("budgetLineItemId")
REFERENCES "BudgetLineItem"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
