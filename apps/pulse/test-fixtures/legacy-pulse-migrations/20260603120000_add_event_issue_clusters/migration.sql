-- CreateTable
CREATE TABLE "EventIssueCluster" (
    "id" TEXT NOT NULL,
    "clusterKey" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "surveyId" TEXT,
    "surveyTargetId" TEXT,
    "questionId" TEXT,
    "taxonomyKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "priorityLevel" TEXT NOT NULL,
    "legacyUrgency" TEXT,
    "impactScore" DOUBLE PRECISION,
    "timeSensitivityScore" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "recommendedNextStep" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventIssueCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventIssueEvidence" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "surveyId" TEXT,
    "surveyTargetId" TEXT,
    "responseId" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "questionId" TEXT,
    "transcriptSnippet" TEXT NOT NULL,
    "sentimentScore" DOUBLE PRECISION,
    "priorityLevel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventIssueEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventIssueCluster_clusterKey_key" ON "EventIssueCluster"("clusterKey");

-- CreateIndex
CREATE INDEX "EventIssueCluster_accountId_idx" ON "EventIssueCluster"("accountId");

-- CreateIndex
CREATE INDEX "EventIssueCluster_locationId_idx" ON "EventIssueCluster"("locationId");

-- CreateIndex
CREATE INDEX "EventIssueCluster_eventId_idx" ON "EventIssueCluster"("eventId");

-- CreateIndex
CREATE INDEX "EventIssueCluster_surveyId_idx" ON "EventIssueCluster"("surveyId");

-- CreateIndex
CREATE INDEX "EventIssueCluster_surveyTargetId_idx" ON "EventIssueCluster"("surveyTargetId");

-- CreateIndex
CREATE INDEX "EventIssueCluster_questionId_idx" ON "EventIssueCluster"("questionId");

-- CreateIndex
CREATE INDEX "EventIssueCluster_eventId_status_priorityLevel_idx" ON "EventIssueCluster"("eventId", "status", "priorityLevel");

-- CreateIndex
CREATE INDEX "EventIssueCluster_eventId_taxonomyKey_idx" ON "EventIssueCluster"("eventId", "taxonomyKey");

-- CreateIndex
CREATE INDEX "EventIssueCluster_priorityLevel_idx" ON "EventIssueCluster"("priorityLevel");

-- CreateIndex
CREATE INDEX "EventIssueCluster_status_idx" ON "EventIssueCluster"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EventIssueEvidence_clusterId_answerId_key" ON "EventIssueEvidence"("clusterId", "answerId");

-- CreateIndex
CREATE INDEX "EventIssueEvidence_clusterId_idx" ON "EventIssueEvidence"("clusterId");

-- CreateIndex
CREATE INDEX "EventIssueEvidence_accountId_idx" ON "EventIssueEvidence"("accountId");

-- CreateIndex
CREATE INDEX "EventIssueEvidence_locationId_idx" ON "EventIssueEvidence"("locationId");

-- CreateIndex
CREATE INDEX "EventIssueEvidence_eventId_idx" ON "EventIssueEvidence"("eventId");

-- CreateIndex
CREATE INDEX "EventIssueEvidence_surveyId_idx" ON "EventIssueEvidence"("surveyId");

-- CreateIndex
CREATE INDEX "EventIssueEvidence_surveyTargetId_idx" ON "EventIssueEvidence"("surveyTargetId");

-- CreateIndex
CREATE INDEX "EventIssueEvidence_responseId_idx" ON "EventIssueEvidence"("responseId");

-- CreateIndex
CREATE INDEX "EventIssueEvidence_answerId_idx" ON "EventIssueEvidence"("answerId");

-- CreateIndex
CREATE INDEX "EventIssueEvidence_questionId_idx" ON "EventIssueEvidence"("questionId");

-- CreateIndex
CREATE INDEX "EventIssueEvidence_priorityLevel_idx" ON "EventIssueEvidence"("priorityLevel");

-- AddForeignKey
ALTER TABLE "EventIssueCluster" ADD CONSTRAINT "EventIssueCluster_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIssueCluster" ADD CONSTRAINT "EventIssueCluster_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIssueCluster" ADD CONSTRAINT "EventIssueCluster_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIssueCluster" ADD CONSTRAINT "EventIssueCluster_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIssueCluster" ADD CONSTRAINT "EventIssueCluster_surveyTargetId_fkey" FOREIGN KEY ("surveyTargetId") REFERENCES "SurveyTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIssueCluster" ADD CONSTRAINT "EventIssueCluster_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIssueEvidence" ADD CONSTRAINT "EventIssueEvidence_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "EventIssueCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIssueEvidence" ADD CONSTRAINT "EventIssueEvidence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIssueEvidence" ADD CONSTRAINT "EventIssueEvidence_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIssueEvidence" ADD CONSTRAINT "EventIssueEvidence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIssueEvidence" ADD CONSTRAINT "EventIssueEvidence_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIssueEvidence" ADD CONSTRAINT "EventIssueEvidence_surveyTargetId_fkey" FOREIGN KEY ("surveyTargetId") REFERENCES "SurveyTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIssueEvidence" ADD CONSTRAINT "EventIssueEvidence_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIssueEvidence" ADD CONSTRAINT "EventIssueEvidence_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIssueEvidence" ADD CONSTRAINT "EventIssueEvidence_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
