-- Preserve Survey.surveyTargetId as the required legacy primary target while
-- allowing one Survey to be deployed to additional explicit listening points.
ALTER TABLE "PublicSurveyLink" ADD COLUMN "surveyTargetId" TEXT;

UPDATE "PublicSurveyLink" AS link
SET "surveyTargetId" = survey."surveyTargetId"
FROM "Survey" AS survey
WHERE link."surveyId" = survey."id"
  AND link."surveyTargetId" IS NULL;

CREATE INDEX "PublicSurveyLink_surveyTargetId_idx" ON "PublicSurveyLink"("surveyTargetId");
CREATE INDEX "PublicSurveyLink_surveyId_surveyTargetId_isActive_idx" ON "PublicSurveyLink"("surveyId", "surveyTargetId", "isActive");

ALTER TABLE "PublicSurveyLink"
ADD CONSTRAINT "PublicSurveyLink_surveyTargetId_fkey"
FOREIGN KEY ("surveyTargetId") REFERENCES "SurveyTarget"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
