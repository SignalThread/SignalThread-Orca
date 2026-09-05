-- Repair only contradictory legacy Advanced Event questions. A question is
-- never classified from its label: it must carry explicit NUMERIC scale metadata.
UPDATE "Question" AS question
SET "type" = CASE
  WHEN question."configurationJson"->>'questionType' = 'RATING_1_TO_5' THEN 'RATING_1_TO_5'::"QuestionType"
  WHEN question."configurationJson"->>'questionType' = 'RECOMMENDATION_0_TO_10' THEN 'RECOMMENDATION_0_TO_10'::"QuestionType"
  WHEN question."configurationJson"->>'answerFormat' = 'NUMERIC'
    AND question."configurationJson"->'scale'->>'min' = '1'
    AND question."configurationJson"->'scale'->>'max' = '5' THEN 'RATING_1_TO_5'::"QuestionType"
  WHEN question."configurationJson"->>'answerFormat' = 'NUMERIC'
    AND question."configurationJson"->'scale'->>'min' = '0'
    AND question."configurationJson"->'scale'->>'max' = '10' THEN 'RECOMMENDATION_0_TO_10'::"QuestionType"
  ELSE question."type"
END
FROM "Survey" AS survey
JOIN "Event" AS event ON event.id = survey."eventId"
WHERE question."surveyId" = survey.id
  AND question."type" = 'OPEN_RESPONSE'::"QuestionType"
  AND event."eventType" = 'ADVANCED'
  AND (
    question."configurationJson"->>'questionType' IN ('RATING_1_TO_5', 'RECOMMENDATION_0_TO_10')
    OR (
      question."configurationJson"->>'answerFormat' = 'NUMERIC'
      AND (
        (question."configurationJson"->'scale'->>'min' = '1' AND question."configurationJson"->'scale'->>'max' = '5')
        OR (question."configurationJson"->'scale'->>'min' = '0' AND question."configurationJson"->'scale'->>'max' = '10')
      )
    )
  );
