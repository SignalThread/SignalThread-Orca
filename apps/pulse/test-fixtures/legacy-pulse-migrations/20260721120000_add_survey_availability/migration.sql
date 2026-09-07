-- Stage 4: canonical Events Survey availability. Existing Surveys retain the
-- current lifecycle behavior through the OPEN_IMMEDIATELY default.
CREATE TYPE "SurveyAvailabilityMode" AS ENUM (
  'OPEN_IMMEDIATELY',
  'CUSTOM_WINDOW',
  'RELATIVE_TO_EVENT_AREA'
);

CREATE TYPE "SurveyAvailabilityAnchor" AS ENUM ('START', 'END');
CREATE TYPE "SurveyAvailabilityOverride" AS ENUM ('FORCE_OPEN', 'FORCE_CLOSED');

ALTER TABLE "Survey"
  ADD COLUMN "availabilityMode" "SurveyAvailabilityMode" NOT NULL DEFAULT 'OPEN_IMMEDIATELY',
  ADD COLUMN "availabilityTimezone" TEXT,
  ADD COLUMN "availabilityOpensAt" TIMESTAMP(3),
  ADD COLUMN "availabilityClosesAt" TIMESTAMP(3),
  ADD COLUMN "availabilityOpenAnchor" "SurveyAvailabilityAnchor",
  ADD COLUMN "availabilityCloseAnchor" "SurveyAvailabilityAnchor",
  ADD COLUMN "availabilityOpenOffsetMinutes" INTEGER,
  ADD COLUMN "availabilityCloseOffsetMinutes" INTEGER,
  ADD COLUMN "availabilityOverride" "SurveyAvailabilityOverride";

CREATE INDEX "Survey_availabilityMode_idx" ON "Survey"("availabilityMode");
