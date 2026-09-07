-- CreateEnum
CREATE TYPE "SurveyTargetCategory" AS ENUM ('EVENT', 'SESSION', 'LOCATION', 'CUSTOM');

-- AlterTable
ALTER TABLE "Answer" ADD COLUMN "questionId" TEXT;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN "surveyId" TEXT;

-- AlterTable
ALTER TABLE "Response" ADD COLUMN "publicSurveyLinkId" TEXT,
ADD COLUMN "surveyId" TEXT,
ADD COLUMN "surveyTargetId" TEXT;

-- CreateTable
CREATE TABLE "SurveyTarget" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "locationId" TEXT,
    "category" "SurveyTargetCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "surveyTargetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "responseMode" "ResponseMode" NOT NULL DEFAULT 'VOICE_ONLY',
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "settingsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicSurveyLink" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "slug" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicSurveyLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SurveyTarget_eventId_slug_key" ON "SurveyTarget"("eventId", "slug");

-- CreateIndex
CREATE INDEX "SurveyTarget_eventId_category_idx" ON "SurveyTarget"("eventId", "category");

-- CreateIndex
CREATE INDEX "SurveyTarget_locationId_idx" ON "SurveyTarget"("locationId");

-- CreateIndex
CREATE INDEX "Survey_eventId_idx" ON "Survey"("eventId");

-- CreateIndex
CREATE INDEX "Survey_surveyTargetId_idx" ON "Survey"("surveyTargetId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicSurveyLink_token_key" ON "PublicSurveyLink"("token");

-- CreateIndex
CREATE INDEX "PublicSurveyLink_surveyId_idx" ON "PublicSurveyLink"("surveyId");

-- CreateIndex
CREATE INDEX "PublicSurveyLink_isActive_idx" ON "PublicSurveyLink"("isActive");

-- CreateIndex
CREATE INDEX "Question_surveyId_idx" ON "Question"("surveyId");

-- CreateIndex
CREATE INDEX "Response_surveyId_idx" ON "Response"("surveyId");

-- CreateIndex
CREATE INDEX "Response_surveyTargetId_idx" ON "Response"("surveyTargetId");

-- CreateIndex
CREATE INDEX "Response_publicSurveyLinkId_idx" ON "Response"("publicSurveyLinkId");

-- CreateIndex
CREATE INDEX "Answer_questionId_idx" ON "Answer"("questionId");

-- AddForeignKey
ALTER TABLE "SurveyTarget" ADD CONSTRAINT "SurveyTarget_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyTarget" ADD CONSTRAINT "SurveyTarget_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_surveyTargetId_fkey" FOREIGN KEY ("surveyTargetId") REFERENCES "SurveyTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicSurveyLink" ADD CONSTRAINT "PublicSurveyLink_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_surveyTargetId_fkey" FOREIGN KEY ("surveyTargetId") REFERENCES "SurveyTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_publicSurveyLinkId_fkey" FOREIGN KEY ("publicSurveyLinkId") REFERENCES "PublicSurveyLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
