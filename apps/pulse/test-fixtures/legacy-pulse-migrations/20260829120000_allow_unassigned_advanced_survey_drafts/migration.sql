-- Advanced Event surveys may be authored and autosaved before an organizer
-- chooses an assignment. Existing assigned surveys keep their target IDs.
ALTER TABLE "Survey"
  DROP CONSTRAINT "Survey_surveyTargetId_fkey";

ALTER TABLE "Survey"
  ALTER COLUMN "surveyTargetId" DROP NOT NULL;

ALTER TABLE "Survey"
  ADD CONSTRAINT "Survey_surveyTargetId_fkey"
  FOREIGN KEY ("surveyTargetId") REFERENCES "SurveyTarget"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
