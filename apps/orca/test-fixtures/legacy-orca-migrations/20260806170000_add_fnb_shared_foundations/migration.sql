-- Additive shared foundations for menu lifecycle, safety, pricing provenance,
-- audited requirement disposition, and export provenance.

CREATE TYPE "FnbPricingUnit" AS ENUM ('PER_PERSON', 'PER_ITEM', 'PER_DOZEN', 'FLAT');
CREATE TYPE "FnbOperationalStatus" AS ENUM ('OUTSTANDING', 'RECEIVED', 'CODED', 'CONFIRMED', 'NEEDS_REVIEW');
CREATE TYPE "FnbVerificationStatus" AS ENUM ('UNVERIFIED', 'NEEDS_REVIEW', 'VERIFIED', 'REJECTED', 'STALE');
CREATE TYPE "FnbClaimKind" AS ENUM ('SUITABILITY', 'CONTAINS', 'FREE_OF');
CREATE TYPE "FnbRequirementKind" AS ENUM ('DIETARY', 'ALLERGEN', 'ACCESSIBILITY');
CREATE TYPE "RequirementDisposition" AS ENUM ('REQUIRED', 'COMPLETE', 'AT_RISK', 'MISSING', 'NOT_NEEDED');
CREATE TYPE "FnbExportRecipient" AS ENUM ('INTERNAL', 'HOTEL', 'CATERER', 'AV', 'PUBLIC');

ALTER TABLE "EventFnbSourceMenu"
  ADD COLUMN "operationalStatus" "FnbOperationalStatus" NOT NULL DEFAULT 'RECEIVED',
  ADD COLUMN "venueOrCaterer" TEXT,
  ADD COLUMN "mealContext" TEXT,
  ADD COLUMN "expectedAt" TIMESTAMP(3),
  ADD COLUMN "receivedAt" TIMESTAMP(3),
  ADD COLUMN "effectiveAt" TIMESTAMP(3),
  ADD COLUMN "versionLabel" TEXT,
  ADD COLUMN "ownerUserId" UUID,
  ADD COLUMN "verificationStatus" "FnbVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "verifiedByUserId" UUID,
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "verificationSource" TEXT,
  ADD COLUMN "verificationNotes" TEXT,
  ADD COLUMN "internalNotes" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "EventFnbCatalogItem"
  ADD COLUMN "publishedPriceCents" INTEGER,
  ADD COLUMN "negotiatedPriceCents" INTEGER,
  ADD COLUMN "discountCents" INTEGER,
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN "pricingUnit" "FnbPricingUnit",
  ADD COLUMN "minimumQuantity" INTEGER,
  ADD COLUMN "isCustom" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "crossContactNotes" TEXT,
  ADD COLUMN "preparationNotes" TEXT,
  ADD COLUMN "internalNotes" TEXT,
  ADD COLUMN "verificationStatus" "FnbVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "verifiedByUserId" UUID,
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "verificationSource" TEXT,
  ADD COLUMN "verificationNotes" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "EventFnbCatalogItem"
  ADD CONSTRAINT "EventFnbCatalogItem_price_provenance_check"
  CHECK (("publishedPriceCents" IS NULL OR "publishedPriceCents" >= 0)
    AND ("negotiatedPriceCents" IS NULL OR "negotiatedPriceCents" >= 0)
    AND ("discountCents" IS NULL OR "discountCents" >= 0)
    AND ("minimumQuantity" IS NULL OR "minimumQuantity" > 0));

CREATE TABLE "EventFnbCatalogItemClaim" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "kind" "FnbClaimKind" NOT NULL,
  "code" TEXT NOT NULL,
  "customLabel" TEXT,
  "verificationStatus" "FnbVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "verifiedByUserId" UUID,
  "verifiedAt" TIMESTAMP(3),
  "evidenceSource" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventFnbCatalogItemClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SessionFnbRequirement" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "kind" "FnbRequirementKind" NOT NULL,
  "code" TEXT NOT NULL,
  "customLabel" TEXT,
  "quantity" INTEGER,
  "disposition" "RequirementDisposition" NOT NULL DEFAULT 'REQUIRED',
  "dispositionReason" TEXT,
  "dispositionActorUserId" UUID,
  "dispositionAt" TIMESTAMP(3),
  "source" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionFnbRequirement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SessionFnbRequirement_quantity_check" CHECK ("quantity" IS NULL OR "quantity" > 0),
  CONSTRAINT "SessionFnbRequirement_not_needed_reason_check" CHECK ("disposition" <> 'NOT_NEEDED' OR ("dispositionReason" IS NOT NULL AND length(btrim("dispositionReason")) > 0))
);

CREATE TABLE "EventFnbExportRecord" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "recipient" "FnbExportRecipient" NOT NULL,
  "filters" JSONB,
  "sourceDataVersion" TEXT NOT NULL,
  "generatedByUserId" UUID,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventFnbExportRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventFnbCatalogItemClaim_itemId_kind_code_key" ON "EventFnbCatalogItemClaim"("itemId", "kind", "code");
CREATE INDEX "EventFnbCatalogItemClaim_eventId_kind_code_idx" ON "EventFnbCatalogItemClaim"("eventId", "kind", "code");
CREATE INDEX "EventFnbCatalogItemClaim_itemId_verificationStatus_idx" ON "EventFnbCatalogItemClaim"("itemId", "verificationStatus");
CREATE UNIQUE INDEX "SessionFnbRequirement_sessionId_kind_code_key" ON "SessionFnbRequirement"("sessionId", "kind", "code");
CREATE INDEX "SessionFnbRequirement_eventId_disposition_idx" ON "SessionFnbRequirement"("eventId", "disposition");
CREATE INDEX "SessionFnbRequirement_sessionId_kind_idx" ON "SessionFnbRequirement"("sessionId", "kind");
CREATE INDEX "EventFnbExportRecord_eventId_recipient_generatedAt_idx" ON "EventFnbExportRecord"("eventId", "recipient", "generatedAt");
CREATE INDEX "EventFnbSourceMenu_eventId_operationalStatus_idx" ON "EventFnbSourceMenu"("eventId", "operationalStatus");
CREATE INDEX "EventFnbSourceMenu_ownerUserId_idx" ON "EventFnbSourceMenu"("ownerUserId");
CREATE INDEX "EventFnbSourceMenu_verifiedByUserId_idx" ON "EventFnbSourceMenu"("verifiedByUserId");
CREATE INDEX "EventFnbCatalogItem_eventId_verificationStatus_idx" ON "EventFnbCatalogItem"("eventId", "verificationStatus");
CREATE INDEX "EventFnbCatalogItem_verifiedByUserId_idx" ON "EventFnbCatalogItem"("verifiedByUserId");

ALTER TABLE "EventFnbSourceMenu" ADD CONSTRAINT "EventFnbSourceMenu_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventFnbSourceMenu" ADD CONSTRAINT "EventFnbSourceMenu_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventFnbCatalogItem" ADD CONSTRAINT "EventFnbCatalogItem_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventFnbCatalogItemClaim" ADD CONSTRAINT "EventFnbCatalogItemClaim_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventFnbCatalogItemClaim" ADD CONSTRAINT "EventFnbCatalogItemClaim_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "EventFnbCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionFnbRequirement" ADD CONSTRAINT "SessionFnbRequirement_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionFnbRequirement" ADD CONSTRAINT "SessionFnbRequirement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MatrixRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventFnbExportRecord" ADD CONSTRAINT "EventFnbExportRecord_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
