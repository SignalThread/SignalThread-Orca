-- Direct event-speaker surveys keep the durable account speaker identity on
-- SurveyTarget. The existing speakerAssignmentId remains the optional
-- speaker-in-session scope used by legacy/session-specific intelligence.
ALTER TYPE "SurveyTargetCategory" ADD VALUE IF NOT EXISTS 'SPEAKER';

ALTER TABLE "SurveyTarget"
ADD COLUMN "speakerId" TEXT;

CREATE INDEX "SurveyTarget_eventId_speakerId_category_idx"
ON "SurveyTarget"("eventId", "speakerId", "category");

ALTER TABLE "SurveyTarget"
ADD CONSTRAINT "SurveyTarget_speakerId_fkey"
FOREIGN KEY ("speakerId") REFERENCES "EventSpeakerProfile"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- A public link can represent a particular session launch of a reusable
-- speaker survey. Copy that context to each response at kiosk start.
ALTER TABLE "PublicSurveyLink"
ADD COLUMN "speakerAssignmentId" TEXT;

CREATE INDEX "PublicSurveyLink_speakerAssignmentId_idx"
ON "PublicSurveyLink"("speakerAssignmentId");

ALTER TABLE "PublicSurveyLink"
ADD CONSTRAINT "PublicSurveyLink_speakerAssignmentId_fkey"
FOREIGN KEY ("speakerAssignmentId") REFERENCES "EventSessionSpeakerAssignment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Response"
ADD COLUMN "speakerAssignmentId" TEXT;

CREATE INDEX "Response_speakerAssignmentId_idx"
ON "Response"("speakerAssignmentId");

ALTER TABLE "Response"
ADD CONSTRAINT "Response_speakerAssignmentId_fkey"
FOREIGN KEY ("speakerAssignmentId") REFERENCES "EventSessionSpeakerAssignment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
