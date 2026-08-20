ALTER TABLE "SessionFnbCatalogAssignment"
  ADD COLUMN "catalogItemSnapshot" JSONB;

UPDATE "SessionFnbCatalogAssignment" a
SET "catalogItemSnapshot" = jsonb_build_object(
  'itemId', i."id",
  'version', a."catalogItemVersion",
  'itemName', i."itemName",
  'category', i."category",
  'description', i."description",
  'publishedPriceCents', i."publishedPriceCents",
  'negotiatedPriceCents', i."negotiatedPriceCents",
  'discountCents', i."discountCents",
  'currency', i."currency",
  'pricingUnit', i."pricingUnit",
  'unit', i."unit",
  'minimumQuantity', i."minimumQuantity",
  'isCustom', i."isCustom",
  'verificationStatus', i."verificationStatus",
  'claims', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'kind', c."kind",
      'code', c."code",
      'customLabel', c."customLabel",
      'verificationStatus', c."verificationStatus",
      'evidenceSource', c."evidenceSource"
    ) ORDER BY c."kind", c."code")
    FROM "EventFnbCatalogItemClaim" c
    WHERE c."itemId" = i."id"
  ), '[]'::jsonb)
)
FROM "EventFnbCatalogItem" i
WHERE i."id" = a."eventFnbCatalogItemId"
  AND a."catalogItemSnapshot" IS NULL;

CREATE INDEX "SessionFnbAssignmentSafetyResolution_sessionId_resolvedAt_idx"
  ON "SessionFnbAssignmentSafetyResolution"("sessionId", "resolvedAt");

ALTER TABLE "SessionFnbAssignmentSafetyResolution"
  ADD CONSTRAINT "SessionFnbAssignmentSafetyResolution_verified_modification_check"
  CHECK (
    "modificationStatus" <> 'VERIFIED'
    OR (
      "modification" IS NOT NULL
      AND length(btrim("modification")) > 0
      AND "evidenceSource" IS NOT NULL
      AND length(btrim("evidenceSource")) > 0
      AND "resolvedByUserId" IS NOT NULL
      AND "resolvedAt" IS NOT NULL
    )
  );
