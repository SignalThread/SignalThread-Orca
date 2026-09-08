/**
 * Publish mock — derives from `batch-contract.ts`.
 */
import { WIZARD_BATCH } from "@/lib/import-wizard/batch-contract";

export type PublishReadiness = "fully_ready" | "ready_with_exceptions" | "blocked";

export const MOCK_PUBLISH_READINESS: PublishReadiness = "ready_with_exceptions";

export const MOCK_PUBLISH_PRE = {
  leadsReady: WIZARD_BATCH.publish.leadsReadyForEvent,
  briefingsReady: WIZARD_BATCH.publish.briefingsReadyForMobile,
  assignedToReps: WIZARD_BATCH.publish.assignedToReps,
  needingReview: WIZARD_BATCH.publish.stillNeedingReview,
  blockedReason: null as string | null,
} as const;

export const MOCK_PUBLISH_POST = {
  leadsLive: WIZARD_BATCH.postPublish.leadsLive,
  briefingsSynced: WIZARD_BATCH.postPublish.briefingsSynced,
  assignedToReps: WIZARD_BATCH.postPublish.assignedToReps,
} as const;
