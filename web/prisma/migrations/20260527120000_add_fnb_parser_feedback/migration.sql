CREATE TABLE IF NOT EXISTS "FnbParserFeedback" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "clientId" UUID,
  "documentId" UUID,
  "sourceMenuFileName" TEXT,
  "action" TEXT NOT NULL,
  "changeFlags" JSONB NOT NULL,
  "originalRow" JSONB NOT NULL,
  "finalRow" JSONB,
  "rejectionReason" TEXT,
  "sourcePageNumber" INTEGER,
  "sourceSection" TEXT,
  "extractionSource" TEXT,
  "confidence" TEXT,
  "parserVersion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FnbParserFeedback_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FnbParserFeedback_orgId_fkey'
  ) THEN
    ALTER TABLE "FnbParserFeedback"
      ADD CONSTRAINT "FnbParserFeedback_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FnbParserFeedback_eventId_fkey'
  ) THEN
    ALTER TABLE "FnbParserFeedback"
      ADD CONSTRAINT "FnbParserFeedback_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "Event"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FnbParserFeedback_clientId_fkey'
  ) THEN
    ALTER TABLE "FnbParserFeedback"
      ADD CONSTRAINT "FnbParserFeedback_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FnbParserFeedback_documentId_fkey'
  ) THEN
    ALTER TABLE "FnbParserFeedback"
      ADD CONSTRAINT "FnbParserFeedback_documentId_fkey"
      FOREIGN KEY ("documentId") REFERENCES "Document"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "FnbParserFeedback_orgId_eventId_createdAt_idx"
  ON "FnbParserFeedback"("orgId", "eventId", "createdAt");

CREATE INDEX IF NOT EXISTS "FnbParserFeedback_clientId_idx"
  ON "FnbParserFeedback"("clientId");

CREATE INDEX IF NOT EXISTS "FnbParserFeedback_documentId_idx"
  ON "FnbParserFeedback"("documentId");

CREATE INDEX IF NOT EXISTS "FnbParserFeedback_sourceMenuFileName_idx"
  ON "FnbParserFeedback"("sourceMenuFileName");
