-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "AnswerType" AS ENUM ('QUESTION', 'FREEFORM');

-- CreateEnum
CREATE TYPE "AnswerStatus" AS ENUM ('CREATED', 'UPLOADING', 'UPLOADED', 'PROCESSING_TRANSCRIPT', 'PROCESSING_ANALYSIS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendee" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "anonymousId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Response" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "status" "ResponseStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT,
    "answerType" "AnswerType" NOT NULL,
    "promptLabel" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "objectEtag" TEXT,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "durationMs" INTEGER,
    "language" TEXT,
    "status" "AnswerStatus" NOT NULL DEFAULT 'CREATED',
    "statusReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- AlterTable Transcript to support both Answer and Session
ALTER TABLE "Transcript" ADD COLUMN "answerId" TEXT;
ALTER TABLE "Transcript" ALTER COLUMN "sessionId" DROP NOT NULL;
-- Drop constraint only if it exists
DO $$ BEGIN
  ALTER TABLE "Transcript" DROP CONSTRAINT IF EXISTS "Transcript_sessionId_key";
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- AlterTable Analysis to support both Answer and Session  
ALTER TABLE "Analysis" ADD COLUMN "answerId" TEXT;
ALTER TABLE "Analysis" ALTER COLUMN "sessionId" DROP NOT NULL;
-- Drop constraint only if it exists
DO $$ BEGIN
  ALTER TABLE "Analysis" DROP CONSTRAINT IF EXISTS "Analysis_sessionId_key";
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- AlterTable ProcessingLog to support both Answer and Session
ALTER TABLE "ProcessingLog" ADD COLUMN "answerId" TEXT;
ALTER TABLE "ProcessingLog" ALTER COLUMN "sessionId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Attendee_anonymousId_key" ON "Attendee"("anonymousId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Attendee_eventId_idx" ON "Attendee"("eventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Attendee_anonymousId_idx" ON "Attendee"("anonymousId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Question_eventId_idx" ON "Question"("eventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Question_order_idx" ON "Question"("order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Response_eventId_idx" ON "Response"("eventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Response_attendeeId_idx" ON "Response"("attendeeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Response_status_idx" ON "Response"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Response_startedAt_idx" ON "Response"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Answer_objectKey_key" ON "Answer"("objectKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Answer_responseId_idx" ON "Answer"("responseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Answer_questionId_idx" ON "Answer"("questionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Answer_answerType_idx" ON "Answer"("answerType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Answer_status_idx" ON "Answer"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Answer_createdAt_idx" ON "Answer"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Event_createdAt_idx" ON "Event"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Transcript_answerId_key" ON "Transcript"("answerId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Transcript_sessionId_key" ON "Transcript"("sessionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Transcript_answerId_idx" ON "Transcript"("answerId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Analysis_answerId_key" ON "Analysis"("answerId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Analysis_sessionId_key" ON "Analysis"("sessionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Analysis_answerId_idx" ON "Analysis"("answerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessingLog_answerId_idx" ON "ProcessingLog"("answerId");

-- AddForeignKey
ALTER TABLE "Attendee" ADD CONSTRAINT "Attendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "Attendee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingLog" ADD CONSTRAINT "ProcessingLog_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
