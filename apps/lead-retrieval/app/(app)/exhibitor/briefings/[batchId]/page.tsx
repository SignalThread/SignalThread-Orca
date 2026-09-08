import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getBatchByIdForCompany } from "@/lib/server/import-wizard/import-batch-service";
import { briefingsWorkspaceChromeFromBatch } from "@/lib/exhibitor/briefings-ui-copy";
import { BatchBriefReadinessClient } from "@/components/exhibitor/brief-readiness-client";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ batchId: string }> };

export default async function BriefingBatchReadinessPage({ params }: Props) {
  const sessionUser = await requireRole("exhibitor_admin");
  const companyId = sessionUser.company_id;
  if (!companyId) notFound();

  const { batchId } = await params;
  const batch = await getBatchByIdForCompany(batchId, companyId);
  if (!batch) notFound();

  const chrome = briefingsWorkspaceChromeFromBatch(batch);

  return (
    <BatchBriefReadinessClient
      batchId={batch.id}
      batchDataRevision={batch.dataRevision}
      workspaceHeadline={chrome.headline}
      workspaceSubline={chrome.subline}
      batchStatus={batch.status}
      statusBadgeLabel={chrome.statusBadgeLabel}
      canCancelSelectedLeadDraft={batch.status === "draft" && batch.sourceKind === "selected_leads"}
    />
  );
}
