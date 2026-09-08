import type { BriefingQueueItemView } from "@/lib/import-wizard/briefing-detail-model";

/**
 * Legacy helper for batch briefing queues (not used by the streamlined import wizard flow).
 * Empty batch (no staged rows) does not allow continue — nothing to publish / review.
 */
export function isImportBatchBriefingStepComplete(queue: BriefingQueueItemView[]): boolean {
  return queue.length > 0 && queue.every((q) => q.approvalStatus === "approved");
}
