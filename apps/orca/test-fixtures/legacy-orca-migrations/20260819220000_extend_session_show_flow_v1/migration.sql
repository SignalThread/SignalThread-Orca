-- Additive PF-020 Show Flow v1 extension. Existing cues remain Custom, role-owned, and Draft.
CREATE TYPE "SessionShowFlowStatus" AS ENUM ('DRAFT', 'APPROVED');
CREATE TYPE "SessionShowFlowCueType" AS ENUM (
  'PRE_FUNCTION', 'DOORS_OPEN', 'GUEST_ARRIVAL', 'CONTENT_PRESENTATION',
  'SPEAKER_HANDOFF', 'AV_TECHNICAL', 'FNB_SERVICE', 'BREAK',
  'AUDIENCE_INTERACTION', 'SAFETY_ANNOUNCEMENT', 'TRANSITION_TURNOVER',
  'CLOSE_STRIKE', 'CUSTOM'
);

ALTER TABLE "SessionShowFlowItem"
  ADD COLUMN "cueType" "SessionShowFlowCueType" NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN "ownerPersonId" UUID;

ALTER TABLE "SessionShowFlowState"
  ADD COLUMN "status" "SessionShowFlowStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "templateSourceSessionId" UUID,
  ADD COLUMN "createdByUserId" UUID,
  ADD COLUMN "updatedByUserId" UUID,
  ADD COLUMN "approvedByUserId" UUID,
  ADD COLUMN "approvedAt" TIMESTAMP(3);

CREATE INDEX "SessionShowFlowItem_ownerPersonId_idx"
  ON "SessionShowFlowItem"("ownerPersonId");

ALTER TABLE "SessionShowFlowItem"
  ADD CONSTRAINT "SessionShowFlowItem_ownerPersonId_fkey"
  FOREIGN KEY ("ownerPersonId") REFERENCES "EventPerson"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SessionShowFlowState"
  ADD CONSTRAINT "SessionShowFlowState_status_approval_check"
  CHECK (
    ("status" = 'DRAFT' AND "approvedAt" IS NULL AND "approvedByUserId" IS NULL)
    OR ("status" = 'APPROVED' AND "approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL)
  );
