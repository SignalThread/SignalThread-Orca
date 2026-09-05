-- A structured question role lets a session survey request one rating for
-- every canonical speaker assignment without inferring intent from prompt
-- text. Answer.speakerId keeps the resulting ratings analytically distinct.
CREATE TYPE "QuestionResponseTarget" AS ENUM ('GENERAL', 'SESSION', 'SPEAKERS');

ALTER TABLE "Question"
ADD COLUMN "responseTarget" "QuestionResponseTarget" NOT NULL DEFAULT 'GENERAL';

ALTER TABLE "Answer"
ADD COLUMN "speakerId" TEXT;

CREATE INDEX "Answer_speakerId_idx" ON "Answer"("speakerId");
CREATE INDEX "Answer_questionId_speakerId_idx" ON "Answer"("questionId", "speakerId");

-- The preceding structured-answer index admitted only one numeric answer per
-- question, which would collapse a multi-presenter response. Replace it with
-- separate null/non-null scopes so general ratings retain their old contract.
DROP INDEX "Answer_responseId_questionId_structured_key";

CREATE UNIQUE INDEX "Answer_responseId_questionId_structured_general_key"
ON "Answer"("responseId", "questionId")
WHERE "numericValue" IS NOT NULL AND "speakerId" IS NULL;

-- A presenter rating has one answer per response/question/speaker.
CREATE UNIQUE INDEX "Answer_responseId_questionId_speakerId_presenter_key"
ON "Answer"("responseId", "questionId", "speakerId")
WHERE "numericValue" IS NOT NULL AND "speakerId" IS NOT NULL;
