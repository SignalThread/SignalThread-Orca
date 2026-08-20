ALTER TABLE "SessionRequirementItem"
ADD COLUMN IF NOT EXISTS "active" BOOLEAN;

UPDATE "SessionRequirementItem"
SET "active" = TRUE
WHERE "active" IS NULL;

ALTER TABLE "SessionRequirementItem"
ALTER COLUMN "active" SET DEFAULT TRUE;

ALTER TABLE "SessionRequirementItem"
ALTER COLUMN "active" SET NOT NULL;
