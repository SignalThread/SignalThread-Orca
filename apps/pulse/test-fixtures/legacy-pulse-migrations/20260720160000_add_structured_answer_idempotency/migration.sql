-- Structured kiosk retries must resolve to one canonical Answer per
-- Response/Question. Voice answers remain untouched because historical voice
-- collection did not enforce this uniqueness rule.
CREATE UNIQUE INDEX "Answer_responseId_questionId_structured_key"
ON "Answer"("responseId", "questionId")
WHERE "numericValue" IS NOT NULL;
