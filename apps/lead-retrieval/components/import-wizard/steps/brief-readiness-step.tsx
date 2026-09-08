"use client";

import { useCallback } from "react";
import { BriefingReviewContainer } from "@/components/import-wizard/briefing-review-container";

export type BriefReadinessStepProps = {
  batchId: string | null;
  batchDataRevision: number;
};

/**
 * Pre-import brief review for the active draft batch (`import_batch_row_briefings`).
 */
export function BriefReadinessStep({ batchId, batchDataRevision }: BriefReadinessStepProps) {
  const onAllApprovedChange = useCallback(() => {
    // Reserved for footer gating; v1 does not block import on approval completeness.
  }, []);

  return (
    <div className="import-wizard-brief-readiness space-y-4" data-testid="import-wizard-brief-readiness">
      <BriefingReviewContainer
        batchId={batchId}
        batchDataRevision={batchDataRevision}
        onAllApprovedChange={onAllApprovedChange}
      />
    </div>
  );
}
