-- Add session-wide F&B rates and normalized assignment-specific taxes.
ALTER TABLE "MatrixRow"
ADD COLUMN "fnbTaxPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
ADD COLUMN "fnbServiceChargePercent" DECIMAL(7,4) NOT NULL DEFAULT 0;

CREATE TABLE "SessionFnbCatalogAssignmentTax" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "assignmentId" UUID NOT NULL,
  "label" TEXT,
  "percentage" DECIMAL(7,4) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionFnbCatalogAssignmentTax_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SessionFnbCatalogAssignmentTax_assignmentId_sortOrder_idx"
ON "SessionFnbCatalogAssignmentTax"("assignmentId", "sortOrder");

ALTER TABLE "SessionFnbCatalogAssignmentTax"
ADD CONSTRAINT "SessionFnbCatalogAssignmentTax_assignmentId_fkey"
FOREIGN KEY ("assignmentId") REFERENCES "SessionFnbCatalogAssignment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
