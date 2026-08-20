ALTER TYPE "FnbCompatibilityOutcome" ADD VALUE IF NOT EXISTS 'STALE_VERIFICATION';

ALTER TABLE "EventFnbCatalogItem"
  ADD COLUMN "modificationStatus" "FnbVerificationStatus",
  ADD COLUMN "modificationEvidenceSource" TEXT,
  ADD COLUMN "modificationVerifiedByUserId" UUID,
  ADD COLUMN "modificationVerifiedAt" TIMESTAMP(3);

ALTER TABLE "EventFnbCatalogItem"
  ADD CONSTRAINT "EventFnbCatalogItem_modificationVerifiedByUserId_fkey"
  FOREIGN KEY ("modificationVerifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "EventFnbCatalogItem_modificationVerifiedByUserId_idx"
  ON "EventFnbCatalogItem"("modificationVerifiedByUserId");
