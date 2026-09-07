-- CreateTable
CREATE TABLE "AnswerEventIntelligence" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "surveyId" TEXT,
    "surveyTargetId" TEXT,
    "responseId" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "questionId" TEXT,
    "sentimentLabel" TEXT NOT NULL,
    "sentimentScore" DOUBLE PRECISION,
    "urgency" TEXT NOT NULL,
    "frictionCategory" TEXT,
    "actionWindow" TEXT,
    "recommendedAction" TEXT,
    "confidence" DOUBLE PRECISION,
    "promptVersion" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnswerEventIntelligence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerEventTheme" (
    "id" TEXT NOT NULL,
    "intelligenceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "surveyId" TEXT,
    "surveyTargetId" TEXT,
    "answerId" TEXT NOT NULL,
    "themeKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sentimentLabel" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerEventTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerEventEntity" (
    "id" TEXT NOT NULL,
    "intelligenceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "surveyId" TEXT,
    "surveyTargetId" TEXT,
    "answerId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerEventEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerEventAction" (
    "id" TEXT NOT NULL,
    "intelligenceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "surveyId" TEXT,
    "surveyTargetId" TEXT,
    "answerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL,
    "urgency" TEXT NOT NULL,
    "actionWindow" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnswerEventAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventIntelligenceAggregate" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "surveyId" TEXT,
    "surveyTargetId" TEXT,
    "questionId" TEXT,
    "bucketType" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "responseCount" INTEGER NOT NULL DEFAULT 0,
    "answerCount" INTEGER NOT NULL DEFAULT 0,
    "avgSentiment" DOUBLE PRECISION,
    "highUrgencyCount" INTEGER NOT NULL DEFAULT 0,
    "topThemesJson" JSONB,
    "topEntitiesJson" JSONB,
    "topActionsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventIntelligenceAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnswerEventIntelligence_answerId_key" ON "AnswerEventIntelligence"("answerId");

-- CreateIndex
CREATE INDEX "AnswerEventIntelligence_accountId_idx" ON "AnswerEventIntelligence"("accountId");

-- CreateIndex
CREATE INDEX "AnswerEventIntelligence_locationId_idx" ON "AnswerEventIntelligence"("locationId");

-- CreateIndex
CREATE INDEX "AnswerEventIntelligence_eventId_idx" ON "AnswerEventIntelligence"("eventId");

-- CreateIndex
CREATE INDEX "AnswerEventIntelligence_surveyId_idx" ON "AnswerEventIntelligence"("surveyId");

-- CreateIndex
CREATE INDEX "AnswerEventIntelligence_surveyTargetId_idx" ON "AnswerEventIntelligence"("surveyTargetId");

-- CreateIndex
CREATE INDEX "AnswerEventIntelligence_responseId_idx" ON "AnswerEventIntelligence"("responseId");

-- CreateIndex
CREATE INDEX "AnswerEventIntelligence_questionId_idx" ON "AnswerEventIntelligence"("questionId");

-- CreateIndex
CREATE INDEX "AnswerEventIntelligence_urgency_idx" ON "AnswerEventIntelligence"("urgency");

-- CreateIndex
CREATE INDEX "AnswerEventIntelligence_sentimentLabel_idx" ON "AnswerEventIntelligence"("sentimentLabel");

-- CreateIndex
CREATE INDEX "AnswerEventIntelligence_eventId_surveyTargetId_idx" ON "AnswerEventIntelligence"("eventId", "surveyTargetId");

-- CreateIndex
CREATE INDEX "AnswerEventIntelligence_eventId_surveyId_idx" ON "AnswerEventIntelligence"("eventId", "surveyId");

-- CreateIndex
CREATE INDEX "AnswerEventTheme_intelligenceId_idx" ON "AnswerEventTheme"("intelligenceId");

-- CreateIndex
CREATE INDEX "AnswerEventTheme_eventId_idx" ON "AnswerEventTheme"("eventId");

-- CreateIndex
CREATE INDEX "AnswerEventTheme_surveyId_idx" ON "AnswerEventTheme"("surveyId");

-- CreateIndex
CREATE INDEX "AnswerEventTheme_surveyTargetId_idx" ON "AnswerEventTheme"("surveyTargetId");

-- CreateIndex
CREATE INDEX "AnswerEventTheme_answerId_idx" ON "AnswerEventTheme"("answerId");

-- CreateIndex
CREATE INDEX "AnswerEventTheme_themeKey_idx" ON "AnswerEventTheme"("themeKey");

-- CreateIndex
CREATE INDEX "AnswerEventTheme_sentimentLabel_idx" ON "AnswerEventTheme"("sentimentLabel");

-- CreateIndex
CREATE INDEX "AnswerEventTheme_eventId_surveyTargetId_idx" ON "AnswerEventTheme"("eventId", "surveyTargetId");

-- CreateIndex
CREATE INDEX "AnswerEventTheme_eventId_surveyId_idx" ON "AnswerEventTheme"("eventId", "surveyId");

-- CreateIndex
CREATE INDEX "AnswerEventEntity_intelligenceId_idx" ON "AnswerEventEntity"("intelligenceId");

-- CreateIndex
CREATE INDEX "AnswerEventEntity_eventId_idx" ON "AnswerEventEntity"("eventId");

-- CreateIndex
CREATE INDEX "AnswerEventEntity_surveyId_idx" ON "AnswerEventEntity"("surveyId");

-- CreateIndex
CREATE INDEX "AnswerEventEntity_surveyTargetId_idx" ON "AnswerEventEntity"("surveyTargetId");

-- CreateIndex
CREATE INDEX "AnswerEventEntity_answerId_idx" ON "AnswerEventEntity"("answerId");

-- CreateIndex
CREATE INDEX "AnswerEventEntity_entityType_idx" ON "AnswerEventEntity"("entityType");

-- CreateIndex
CREATE INDEX "AnswerEventEntity_label_idx" ON "AnswerEventEntity"("label");

-- CreateIndex
CREATE INDEX "AnswerEventEntity_eventId_surveyTargetId_idx" ON "AnswerEventEntity"("eventId", "surveyTargetId");

-- CreateIndex
CREATE INDEX "AnswerEventEntity_eventId_surveyId_idx" ON "AnswerEventEntity"("eventId", "surveyId");

-- CreateIndex
CREATE INDEX "AnswerEventAction_intelligenceId_idx" ON "AnswerEventAction"("intelligenceId");

-- CreateIndex
CREATE INDEX "AnswerEventAction_eventId_idx" ON "AnswerEventAction"("eventId");

-- CreateIndex
CREATE INDEX "AnswerEventAction_surveyId_idx" ON "AnswerEventAction"("surveyId");

-- CreateIndex
CREATE INDEX "AnswerEventAction_surveyTargetId_idx" ON "AnswerEventAction"("surveyTargetId");

-- CreateIndex
CREATE INDEX "AnswerEventAction_answerId_idx" ON "AnswerEventAction"("answerId");

-- CreateIndex
CREATE INDEX "AnswerEventAction_priority_idx" ON "AnswerEventAction"("priority");

-- CreateIndex
CREATE INDEX "AnswerEventAction_urgency_idx" ON "AnswerEventAction"("urgency");

-- CreateIndex
CREATE INDEX "AnswerEventAction_status_idx" ON "AnswerEventAction"("status");

-- CreateIndex
CREATE INDEX "AnswerEventAction_eventId_surveyTargetId_idx" ON "AnswerEventAction"("eventId", "surveyTargetId");

-- CreateIndex
CREATE INDEX "AnswerEventAction_eventId_surveyId_idx" ON "AnswerEventAction"("eventId", "surveyId");

-- CreateIndex
CREATE INDEX "EventIntelligenceAggregate_accountId_idx" ON "EventIntelligenceAggregate"("accountId");

-- CreateIndex
CREATE INDEX "EventIntelligenceAggregate_locationId_idx" ON "EventIntelligenceAggregate"("locationId");

-- CreateIndex
CREATE INDEX "EventIntelligenceAggregate_eventId_idx" ON "EventIntelligenceAggregate"("eventId");

-- CreateIndex
CREATE INDEX "EventIntelligenceAggregate_surveyId_idx" ON "EventIntelligenceAggregate"("surveyId");

-- CreateIndex
CREATE INDEX "EventIntelligenceAggregate_surveyTargetId_idx" ON "EventIntelligenceAggregate"("surveyTargetId");

-- CreateIndex
CREATE INDEX "EventIntelligenceAggregate_questionId_idx" ON "EventIntelligenceAggregate"("questionId");

-- CreateIndex
CREATE INDEX "EventIntelligenceAggregate_bucketType_bucketKey_idx" ON "EventIntelligenceAggregate"("bucketType", "bucketKey");

-- CreateIndex
CREATE INDEX "EventIntelligenceAggregate_eventId_surveyTargetId_idx" ON "EventIntelligenceAggregate"("eventId", "surveyTargetId");

-- CreateIndex
CREATE INDEX "EventIntelligenceAggregate_eventId_surveyId_idx" ON "EventIntelligenceAggregate"("eventId", "surveyId");

-- AddForeignKey
ALTER TABLE "AnswerEventIntelligence" ADD CONSTRAINT "AnswerEventIntelligence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventIntelligence" ADD CONSTRAINT "AnswerEventIntelligence_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventIntelligence" ADD CONSTRAINT "AnswerEventIntelligence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventIntelligence" ADD CONSTRAINT "AnswerEventIntelligence_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventIntelligence" ADD CONSTRAINT "AnswerEventIntelligence_surveyTargetId_fkey" FOREIGN KEY ("surveyTargetId") REFERENCES "SurveyTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventIntelligence" ADD CONSTRAINT "AnswerEventIntelligence_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventIntelligence" ADD CONSTRAINT "AnswerEventIntelligence_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventIntelligence" ADD CONSTRAINT "AnswerEventIntelligence_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventTheme" ADD CONSTRAINT "AnswerEventTheme_intelligenceId_fkey" FOREIGN KEY ("intelligenceId") REFERENCES "AnswerEventIntelligence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventTheme" ADD CONSTRAINT "AnswerEventTheme_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventTheme" ADD CONSTRAINT "AnswerEventTheme_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventTheme" ADD CONSTRAINT "AnswerEventTheme_surveyTargetId_fkey" FOREIGN KEY ("surveyTargetId") REFERENCES "SurveyTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventTheme" ADD CONSTRAINT "AnswerEventTheme_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventEntity" ADD CONSTRAINT "AnswerEventEntity_intelligenceId_fkey" FOREIGN KEY ("intelligenceId") REFERENCES "AnswerEventIntelligence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventEntity" ADD CONSTRAINT "AnswerEventEntity_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventEntity" ADD CONSTRAINT "AnswerEventEntity_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventEntity" ADD CONSTRAINT "AnswerEventEntity_surveyTargetId_fkey" FOREIGN KEY ("surveyTargetId") REFERENCES "SurveyTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventEntity" ADD CONSTRAINT "AnswerEventEntity_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventAction" ADD CONSTRAINT "AnswerEventAction_intelligenceId_fkey" FOREIGN KEY ("intelligenceId") REFERENCES "AnswerEventIntelligence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventAction" ADD CONSTRAINT "AnswerEventAction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventAction" ADD CONSTRAINT "AnswerEventAction_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventAction" ADD CONSTRAINT "AnswerEventAction_surveyTargetId_fkey" FOREIGN KEY ("surveyTargetId") REFERENCES "SurveyTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEventAction" ADD CONSTRAINT "AnswerEventAction_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIntelligenceAggregate" ADD CONSTRAINT "EventIntelligenceAggregate_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIntelligenceAggregate" ADD CONSTRAINT "EventIntelligenceAggregate_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIntelligenceAggregate" ADD CONSTRAINT "EventIntelligenceAggregate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIntelligenceAggregate" ADD CONSTRAINT "EventIntelligenceAggregate_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIntelligenceAggregate" ADD CONSTRAINT "EventIntelligenceAggregate_surveyTargetId_fkey" FOREIGN KEY ("surveyTargetId") REFERENCES "SurveyTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIntelligenceAggregate" ADD CONSTRAINT "EventIntelligenceAggregate_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
