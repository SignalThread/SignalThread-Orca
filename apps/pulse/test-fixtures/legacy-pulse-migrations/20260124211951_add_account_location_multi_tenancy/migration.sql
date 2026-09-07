-- ============================================================
-- MULTI-TENANT HIERARCHY: Account → Location → Event → Response → Answer
-- Migration is idempotent and additive (does not modify existing tables)
-- ============================================================

-- CreateEnum: AccountType
DO $$ BEGIN
  CREATE TYPE "AccountType" AS ENUM ('RETAIL', 'EVENTS', 'HOSPITALITY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: EventType
DO $$ BEGIN
  CREATE TYPE "EventType" AS ENUM ('FEEDBACK', 'SURVEY', 'INTERVIEW', 'KIOSK');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: EventStatus
DO $$ BEGIN
  CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: ResponseStatus
DO $$ BEGIN
  CREATE TYPE "ResponseStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: AnswerStatus
DO $$ BEGIN
  CREATE TYPE "AnswerStatus" AS ENUM ('CREATED', 'UPLOADING', 'UPLOADED', 'PROCESSING_TRANSCRIPT', 'PROCESSING_ANALYSIS', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: AdminRole
DO $$ BEGIN
  CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'VIEWER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: Account
CREATE TABLE IF NOT EXISTS "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL DEFAULT 'RETAIL',
    "tier" TEXT NOT NULL DEFAULT 'free',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "email" TEXT,
    "phone" TEXT,
    "billingJson" JSONB,
    "settingsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Location
CREATE TABLE IF NOT EXISTS "Location" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settingsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Event
CREATE TABLE IF NOT EXISTS "Event" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "eventType" "EventType" NOT NULL DEFAULT 'FEEDBACK',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "questionsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Response
CREATE TABLE IF NOT EXISTS "Response" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "anonymousId" TEXT NOT NULL,
    "status" "ResponseStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Answer
CREATE TABLE IF NOT EXISTS "Answer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "promptLabel" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "objectEtag" TEXT,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "durationMs" INTEGER,
    "status" "AnswerStatus" NOT NULL DEFAULT 'CREATED',
    "statusReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AnswerTranscript
CREATE TABLE IF NOT EXISTS "AnswerTranscript" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "wordsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AnswerAnalysis
CREATE TABLE IF NOT EXISTS "AnswerAnalysis" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sentimentScore" DOUBLE PRECISION,
    "sentimentLabel" TEXT,
    "themesJson" JSONB,
    "actionsJson" JSONB,
    "entitiesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AnswerProcessingLog
CREATE TABLE IF NOT EXISTS "AnswerProcessingLog" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "step" "ProcessingStep" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,

    CONSTRAINT "AnswerProcessingLog_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Event (add new multi-tenant columns if Event table was created by previous migration)
-- This handles the case where Event exists but doesn't have these columns yet
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "locationId" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "eventType" "EventType" DEFAULT 'FEEDBACK';
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "status" "EventStatus" DEFAULT 'DRAFT';
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "questionsJson" JSONB;

-- AlterTable: Response (add new multi-tenant columns if Response table was created by previous migration)
-- Make attendeeId nullable for backward compatibility (if it exists)
DO $$ BEGIN
  ALTER TABLE "Response" ALTER COLUMN "attendeeId" DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

ALTER TABLE "Response" ADD COLUMN IF NOT EXISTS "anonymousId" TEXT;
ALTER TABLE "Response" ADD COLUMN IF NOT EXISTS "status" "ResponseStatus" DEFAULT 'IN_PROGRESS';
ALTER TABLE "Response" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Response" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "Response" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- AlterTable: Answer (add new columns and make old columns nullable for backward compatibility)
-- Make old columns nullable if they exist
DO $$ BEGIN
  ALTER TABLE "Answer" ALTER COLUMN "answerType" DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Answer" ALTER COLUMN "questionId" DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Answer" ALTER COLUMN "language" DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

-- Add new columns
ALTER TABLE "Answer" ADD COLUMN IF NOT EXISTS "questionKey" TEXT;
ALTER TABLE "Answer" ADD COLUMN IF NOT EXISTS "promptLabel" TEXT;
ALTER TABLE "Answer" ADD COLUMN IF NOT EXISTS "objectEtag" TEXT;
ALTER TABLE "Answer" ADD COLUMN IF NOT EXISTS "durationMs" INTEGER;
ALTER TABLE "Answer" ADD COLUMN IF NOT EXISTS "status" "AnswerStatus" DEFAULT 'CREATED';
ALTER TABLE "Answer" ADD COLUMN IF NOT EXISTS "statusReason" TEXT;

-- AlterTable: Session (add locationId for backward compatibility)
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

-- AlterTable: Admin (add multi-tenant fields)
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "accountId" TEXT;
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "role" "AdminRole" DEFAULT 'ADMIN';
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true;

-- Update existing Admin records to have role if null
UPDATE "Admin" SET "role" = 'ADMIN' WHERE "role" IS NULL;
UPDATE "Admin" SET "isActive" = true WHERE "isActive" IS NULL;

-- CreateIndex: Account
CREATE UNIQUE INDEX IF NOT EXISTS "Account_slug_key" ON "Account"("slug");
CREATE INDEX IF NOT EXISTS "Account_slug_idx" ON "Account"("slug");
CREATE INDEX IF NOT EXISTS "Account_accountType_idx" ON "Account"("accountType");
CREATE INDEX IF NOT EXISTS "Account_isActive_idx" ON "Account"("isActive");

-- CreateIndex: Location
CREATE UNIQUE INDEX IF NOT EXISTS "Location_accountId_slug_key" ON "Location"("accountId", "slug");
CREATE INDEX IF NOT EXISTS "Location_accountId_idx" ON "Location"("accountId");
CREATE INDEX IF NOT EXISTS "Location_slug_idx" ON "Location"("slug");
CREATE INDEX IF NOT EXISTS "Location_isActive_idx" ON "Location"("isActive");

-- CreateIndex: Event
CREATE INDEX IF NOT EXISTS "Event_locationId_idx" ON "Event"("locationId");
CREATE INDEX IF NOT EXISTS "Event_status_idx" ON "Event"("status");
CREATE INDEX IF NOT EXISTS "Event_eventType_idx" ON "Event"("eventType");
CREATE INDEX IF NOT EXISTS "Event_isActive_idx" ON "Event"("isActive");
CREATE INDEX IF NOT EXISTS "Event_startDate_idx" ON "Event"("startDate");

-- CreateIndex: Response
CREATE INDEX IF NOT EXISTS "Response_eventId_idx" ON "Response"("eventId");
CREATE INDEX IF NOT EXISTS "Response_status_idx" ON "Response"("status");
CREATE INDEX IF NOT EXISTS "Response_startedAt_idx" ON "Response"("startedAt");
CREATE INDEX IF NOT EXISTS "Response_anonymousId_idx" ON "Response"("anonymousId");

-- CreateIndex: Answer
CREATE UNIQUE INDEX IF NOT EXISTS "Answer_objectKey_key" ON "Answer"("objectKey");
CREATE INDEX IF NOT EXISTS "Answer_responseId_idx" ON "Answer"("responseId");
CREATE INDEX IF NOT EXISTS "Answer_questionKey_idx" ON "Answer"("questionKey");
CREATE INDEX IF NOT EXISTS "Answer_status_idx" ON "Answer"("status");
CREATE INDEX IF NOT EXISTS "Answer_createdAt_idx" ON "Answer"("createdAt");

-- CreateIndex: AnswerTranscript
CREATE UNIQUE INDEX IF NOT EXISTS "AnswerTranscript_answerId_key" ON "AnswerTranscript"("answerId");
CREATE INDEX IF NOT EXISTS "AnswerTranscript_answerId_idx" ON "AnswerTranscript"("answerId");
CREATE INDEX IF NOT EXISTS "AnswerTranscript_provider_idx" ON "AnswerTranscript"("provider");

-- CreateIndex: AnswerAnalysis
CREATE UNIQUE INDEX IF NOT EXISTS "AnswerAnalysis_answerId_key" ON "AnswerAnalysis"("answerId");
CREATE INDEX IF NOT EXISTS "AnswerAnalysis_answerId_idx" ON "AnswerAnalysis"("answerId");
CREATE INDEX IF NOT EXISTS "AnswerAnalysis_sentimentLabel_idx" ON "AnswerAnalysis"("sentimentLabel");
CREATE INDEX IF NOT EXISTS "AnswerAnalysis_provider_idx" ON "AnswerAnalysis"("provider");

-- CreateIndex: AnswerProcessingLog
CREATE INDEX IF NOT EXISTS "AnswerProcessingLog_answerId_idx" ON "AnswerProcessingLog"("answerId");
CREATE INDEX IF NOT EXISTS "AnswerProcessingLog_step_idx" ON "AnswerProcessingLog"("step");
CREATE INDEX IF NOT EXISTS "AnswerProcessingLog_startedAt_idx" ON "AnswerProcessingLog"("startedAt");

-- CreateIndex: Session (add locationId index)
CREATE INDEX IF NOT EXISTS "Session_locationId_idx" ON "Session"("locationId");

-- CreateIndex: Admin (add new indexes)
CREATE INDEX IF NOT EXISTS "Admin_accountId_idx" ON "Admin"("accountId");
CREATE INDEX IF NOT EXISTS "Admin_role_idx" ON "Admin"("role");

-- AddForeignKey: Location → Account
DO $$ BEGIN
  ALTER TABLE "Location" ADD CONSTRAINT "Location_accountId_fkey" 
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey: Event → Location
DO $$ BEGIN
  ALTER TABLE "Event" ADD CONSTRAINT "Event_locationId_fkey" 
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey: Response → Event
DO $$ BEGIN
  ALTER TABLE "Response" ADD CONSTRAINT "Response_eventId_fkey" 
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey: Answer → Response
DO $$ BEGIN
  ALTER TABLE "Answer" ADD CONSTRAINT "Answer_responseId_fkey" 
    FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey: AnswerTranscript → Answer
DO $$ BEGIN
  ALTER TABLE "AnswerTranscript" ADD CONSTRAINT "AnswerTranscript_answerId_fkey" 
    FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey: AnswerAnalysis → Answer
DO $$ BEGIN
  ALTER TABLE "AnswerAnalysis" ADD CONSTRAINT "AnswerAnalysis_answerId_fkey" 
    FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey: AnswerProcessingLog → Answer
DO $$ BEGIN
  ALTER TABLE "AnswerProcessingLog" ADD CONSTRAINT "AnswerProcessingLog_answerId_fkey" 
    FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey: Session → Location (optional, for backward compatibility)
DO $$ BEGIN
  ALTER TABLE "Session" ADD CONSTRAINT "Session_locationId_fkey" 
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey: Admin → Account (optional, null = global admin)
DO $$ BEGIN
  ALTER TABLE "Admin" ADD CONSTRAINT "Admin_accountId_fkey" 
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
