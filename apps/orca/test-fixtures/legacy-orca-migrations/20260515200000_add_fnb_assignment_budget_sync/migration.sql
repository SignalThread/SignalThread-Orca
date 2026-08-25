-- Add durable F&B assignment budget sync metadata.
ALTER TABLE "SessionFnbCatalogAssignment"
ADD COLUMN "budgetLineItemId" UUID,
ADD COLUMN "manualPriceCents" INTEGER;

CREATE UNIQUE INDEX "SessionFnbCatalogAssignment_budgetLineItemId_key"
ON "SessionFnbCatalogAssignment"("budgetLineItemId");

ALTER TABLE "SessionFnbCatalogAssignment"
ADD CONSTRAINT "SessionFnbCatalogAssignment_budgetLineItemId_fkey"
FOREIGN KEY ("budgetLineItemId") REFERENCES "BudgetLineItem"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
