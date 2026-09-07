-- Stage 1 mixed-question foundation. Existing questions are deterministically
-- voice questions; existing answer audio metadata remains unchanged.
CREATE TYPE "QuestionType" AS ENUM ('VOICE', 'RATING_1_TO_5', 'RECOMMENDATION_0_TO_10');

ALTER TABLE "Question"
ADD COLUMN "type" "QuestionType" NOT NULL DEFAULT 'VOICE';

ALTER TABLE "Answer"
ADD COLUMN "numericValue" INTEGER,
ALTER COLUMN "objectKey" DROP NOT NULL,
ALTER COLUMN "mimeType" DROP NOT NULL,
ALTER COLUMN "fileSizeBytes" DROP NOT NULL;

-- Survey questions use survey-local ordering. The existing event-global unique
-- index proves there can be no conflicts while this constraint is replaced.
DROP INDEX "Question_eventId_order_key";
CREATE UNIQUE INDEX "Question_surveyId_order_key" ON "Question"("surveyId", "order");

-- Legacy event-level questions have no surveyId and retain event-local order.
CREATE UNIQUE INDEX "Question_eventId_order_legacy_key"
ON "Question"("eventId", "order")
WHERE "surveyId" IS NULL;

CREATE INDEX "Question_type_idx" ON "Question"("type");
CREATE INDEX "Answer_questionId_numericValue_idx" ON "Answer"("questionId", "numericValue");
