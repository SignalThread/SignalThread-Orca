CREATE TYPE "FnbCompatibilityOutcome" AS ENUM ('VERIFIED_MATCH', 'POSSIBLE_MATCH', 'CONFLICT', 'INSUFFICIENT_INFORMATION');

ALTER TABLE "SessionFnbCatalogAssignment" ADD COLUMN "catalogItemVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "SessionFnbAssignmentSafetyResolution" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "assignmentId" UUID NOT NULL,
  "requirementId" UUID NOT NULL,
  "outcome" "FnbCompatibilityOutcome" NOT NULL,
  "reasonCodes" JSONB NOT NULL,
  "modification" TEXT,
  "modificationStatus" "FnbVerificationStatus",
  "evidenceSource" TEXT,
  "resolvedByUserId" UUID,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionFnbAssignmentSafetyResolution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionFnbAssignmentSafetyResolution_assignmentId_requirementId_key" ON "SessionFnbAssignmentSafetyResolution"("assignmentId", "requirementId");
CREATE INDEX "SessionFnbAssignmentSafetyResolution_eventId_sessionId_outcome_idx" ON "SessionFnbAssignmentSafetyResolution"("eventId", "sessionId", "outcome");
CREATE INDEX "SessionFnbAssignmentSafetyResolution_requirementId_idx" ON "SessionFnbAssignmentSafetyResolution"("requirementId");
ALTER TABLE "SessionFnbAssignmentSafetyResolution" ADD CONSTRAINT "SessionFnbAssignmentSafetyResolution_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionFnbAssignmentSafetyResolution" ADD CONSTRAINT "SessionFnbAssignmentSafetyResolution_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MatrixRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionFnbAssignmentSafetyResolution" ADD CONSTRAINT "SessionFnbAssignmentSafetyResolution_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "SessionFnbCatalogAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionFnbAssignmentSafetyResolution" ADD CONSTRAINT "SessionFnbAssignmentSafetyResolution_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "SessionFnbRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
