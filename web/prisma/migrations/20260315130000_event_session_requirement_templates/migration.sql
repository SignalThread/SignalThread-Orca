ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "sessionRequirementTemplateId" UUID;

CREATE TABLE IF NOT EXISTS "SessionRequirementTemplate" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "eventId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionRequirementTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SessionRequirementSection" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "templateId" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "icon" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionRequirementSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SessionRequirementItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sectionId" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "hasQuantity" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionRequirementItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SessionRequirementSelection" (
  "sessionId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "quantity" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionRequirementSelection_pkey" PRIMARY KEY ("sessionId", "itemId")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SessionRequirementTemplate_eventId_fkey'
  ) THEN
    ALTER TABLE "SessionRequirementTemplate"
      ADD CONSTRAINT "SessionRequirementTemplate_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "Event"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Event_sessionRequirementTemplateId_fkey'
  ) THEN
    ALTER TABLE "Event"
      ADD CONSTRAINT "Event_sessionRequirementTemplateId_fkey"
      FOREIGN KEY ("sessionRequirementTemplateId") REFERENCES "SessionRequirementTemplate"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SessionRequirementSection_templateId_fkey'
  ) THEN
    ALTER TABLE "SessionRequirementSection"
      ADD CONSTRAINT "SessionRequirementSection_templateId_fkey"
      FOREIGN KEY ("templateId") REFERENCES "SessionRequirementTemplate"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SessionRequirementItem_sectionId_fkey'
  ) THEN
    ALTER TABLE "SessionRequirementItem"
      ADD CONSTRAINT "SessionRequirementItem_sectionId_fkey"
      FOREIGN KEY ("sectionId") REFERENCES "SessionRequirementSection"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SessionRequirementSelection_sessionId_fkey'
  ) THEN
    ALTER TABLE "SessionRequirementSelection"
      ADD CONSTRAINT "SessionRequirementSelection_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "MatrixRow"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SessionRequirementSelection_itemId_fkey'
  ) THEN
    ALTER TABLE "SessionRequirementSelection"
      ADD CONSTRAINT "SessionRequirementSelection_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "SessionRequirementItem"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SessionRequirementSection_templateId_key_key'
  ) THEN
    ALTER TABLE "SessionRequirementSection"
      ADD CONSTRAINT "SessionRequirementSection_templateId_key_key"
      UNIQUE ("templateId", "key");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SessionRequirementItem_sectionId_key_key'
  ) THEN
    ALTER TABLE "SessionRequirementItem"
      ADD CONSTRAINT "SessionRequirementItem_sectionId_key_key"
      UNIQUE ("sectionId", "key");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SessionRequirementTemplate_eventId_key'
  ) THEN
    ALTER TABLE "SessionRequirementTemplate"
      ADD CONSTRAINT "SessionRequirementTemplate_eventId_key"
      UNIQUE ("eventId");
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "Event_sessionRequirementTemplateId_idx"
  ON "Event"("sessionRequirementTemplateId");

CREATE INDEX IF NOT EXISTS "SessionRequirementTemplate_eventId_idx"
  ON "SessionRequirementTemplate"("eventId");

CREATE INDEX IF NOT EXISTS "SessionRequirementSection_templateId_sortOrder_idx"
  ON "SessionRequirementSection"("templateId", "sortOrder");

CREATE INDEX IF NOT EXISTS "SessionRequirementItem_sectionId_sortOrder_idx"
  ON "SessionRequirementItem"("sectionId", "sortOrder");

CREATE INDEX IF NOT EXISTS "SessionRequirementSelection_itemId_idx"
  ON "SessionRequirementSelection"("itemId");
