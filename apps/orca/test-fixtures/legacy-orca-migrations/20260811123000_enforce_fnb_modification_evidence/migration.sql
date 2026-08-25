ALTER TABLE "EventFnbCatalogItem"
  ADD CONSTRAINT "EventFnbCatalogItem_verified_modification_evidence_check"
  CHECK (
    "modificationStatus" <> 'VERIFIED'
    OR (
      "preparationNotes" IS NOT NULL
      AND length(btrim("preparationNotes")) > 0
      AND "modificationEvidenceSource" IS NOT NULL
      AND length(btrim("modificationEvidenceSource")) > 0
      AND "modificationVerifiedByUserId" IS NOT NULL
      AND "modificationVerifiedAt" IS NOT NULL
    )
  );
