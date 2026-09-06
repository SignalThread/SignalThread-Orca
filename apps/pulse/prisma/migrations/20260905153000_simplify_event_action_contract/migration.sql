ALTER TABLE "EventIssueCluster"
  ADD COLUMN "actionUrgent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "actionReminderEnabled" BOOLEAN NOT NULL DEFAULT true;
