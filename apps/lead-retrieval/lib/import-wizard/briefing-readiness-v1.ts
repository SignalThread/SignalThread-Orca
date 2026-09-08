import type { BriefingQueueItemView } from "@/lib/import-wizard/briefing-detail-model";

export type BriefingReadinessBadgeV1 = {
  label: string;
  tone: "emerald" | "rose" | "amber" | "slate" | "indigo";
};

/**
 * Honest v1 row label from real import identity + `import_batch_row_briefings.approval_status` only.
 */
export function briefingRowReadinessBadgeV1(item: BriefingQueueItemView): BriefingReadinessBadgeV1 {
  if (item.approvalStatus === "approved") {
    return { label: "Approved", tone: "emerald" };
  }
  if (!item.identityComplete) {
    return { label: "Missing required mapped data", tone: "rose" };
  }
  if (item.approvalStatus === "needs_review") {
    return { label: "Needs review", tone: "amber" };
  }
  if (item.approvalStatus === "failed") {
    return { label: "Failed", tone: "rose" };
  }
  return { label: "Ready for review", tone: "indigo" };
}
