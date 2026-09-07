CREATE TYPE "SurveyPresentationMode" AS ENUM ('SCREEN', 'READ_ALOUD', 'ATTENDEE_CHOOSES');

ALTER TABLE "Survey"
  ADD COLUMN "presentationMode" "SurveyPresentationMode" NOT NULL DEFAULT 'ATTENDEE_CHOOSES';
