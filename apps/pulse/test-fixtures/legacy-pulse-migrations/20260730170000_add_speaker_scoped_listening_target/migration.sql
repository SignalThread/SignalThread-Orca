-- Speaker intelligence must be backed by an explicit speaker-in-session
-- context. Existing targets remain generic because inferring attribution from
-- target, survey, question, or speaker display text would be unsafe.
ALTER TABLE "SurveyTarget"
ADD COLUMN "speakerAssignmentId" TEXT;

CREATE INDEX "SurveyTarget_speakerAssignmentId_idx"
ON "SurveyTarget"("speakerAssignmentId");

ALTER TABLE "SurveyTarget"
ADD CONSTRAINT "SurveyTarget_speakerAssignmentId_fkey"
FOREIGN KEY ("speakerAssignmentId") REFERENCES "EventSessionSpeakerAssignment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
