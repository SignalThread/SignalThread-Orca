-- Existing events retain their current approval behavior by default.
ALTER TABLE "Event"
  ADD COLUMN "budgetApprovalsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "documentApprovalsEnabled" BOOLEAN NOT NULL DEFAULT true;
