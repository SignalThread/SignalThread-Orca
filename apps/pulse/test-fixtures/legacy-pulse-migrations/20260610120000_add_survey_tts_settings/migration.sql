ALTER TABLE "Survey"
  ADD COLUMN IF NOT EXISTS "ttsProvider" TEXT,
  ADD COLUMN IF NOT EXISTS "ttsVoice" TEXT,
  ADD COLUMN IF NOT EXISTS "ttsLocale" TEXT;

UPDATE "Survey" AS s
SET
  "ttsProvider" = COALESCE(s."ttsProvider", e."ttsProvider"),
  "ttsVoice" = COALESCE(s."ttsVoice", e."ttsVoice"),
  "ttsLocale" = COALESCE(s."ttsLocale", e."ttsLocale")
FROM "Event" AS e
WHERE s."eventId" = e."id"
  AND (
    s."ttsProvider" IS NULL
    OR s."ttsVoice" IS NULL
    OR s."ttsLocale" IS NULL
  );
