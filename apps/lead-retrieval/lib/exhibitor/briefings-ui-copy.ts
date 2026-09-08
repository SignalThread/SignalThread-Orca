/**
 * User-facing copy and CTA routing for AI Briefings (import batch brief flows).
 * Keeps labels decoupled from DB status strings where helpful.
 */
import type { ImportBatchSourceKind, ImportBatchSummary } from "@/lib/import-wizard/import-batch-contract";
import { importBatchDisplayLabel } from "@/lib/import-wizard/import-batch-contract";
import { batchBriefingsPath, batchBriefingsReviewPath } from "@/lib/import-wizard/paths";

export function importBatchStatusBadgeLabel(status: string): string {
  if (status === "published") return "Live on leads";
  if (status === "draft") return "In progress";
  return status;
}

function formatRunDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Primary title for a batch/run in list and batch chrome — not the raw import filename. */
export function formatBriefingsBatchRunTitle(createdAtIso: string | null | undefined, batchId: string): string {
  const date = formatRunDate(createdAtIso);
  const idTag = importBatchDisplayLabel(batchId);
  if (date) return `Lead brief run · ${date} · ${idTag}`;
  return `Lead brief run ${idTag}`;
}

/**
 * Workspace detail chrome: import filename as headline when available, with run id line as subline.
 */
export function briefingsWorkspaceChromeFromBatch(batch: Pick<ImportBatchSummary, "id" | "createdAt" | "sourceLastFilename" | "sourceKind" | "sourceSelectedLeadIds" | "status">): {
  headline: string;
  subline: string | null;
  statusBadgeLabel: string;
} {
  const runLine = formatBriefingsBatchRunTitle(batch.createdAt, batch.id);
  if (batch.sourceKind === "selected_leads") {
    const count = batch.sourceSelectedLeadIds.length;
    return {
      headline: count === 1 ? "1 selected lead" : `${count} selected leads`,
      subline: runLine,
      statusBadgeLabel: importBatchStatusBadgeLabel(batch.status),
    };
  }
  const raw = batch.sourceLastFilename?.trim();
  if (raw) {
    const base = raw.split(/[/\\]/).pop() ?? raw;
    return {
      headline: base,
      subline: runLine,
      statusBadgeLabel: importBatchStatusBadgeLabel(batch.status),
    };
  }
  return {
    headline: runLine,
    subline: null,
    statusBadgeLabel: importBatchStatusBadgeLabel(batch.status),
  };
}

/** Secondary line for import source (file name), when present. */
export function formatBriefingsImportSourceLine(sourceLastFilename: string | null | undefined): string | null {
  const raw = sourceLastFilename?.trim();
  if (!raw) return null;
  const base = raw.split(/[/\\]/).pop() ?? raw;
  const shown = base.length > 48 ? `${base.slice(0, 45)}…` : base;
  return `Import file: ${shown}`;
}

export function formatBriefingsWorkspaceSourceLine(input: {
  sourceKind?: ImportBatchSourceKind | string | null;
  sourceLastFilename?: string | null;
  selectedLeadCount?: number;
}): string | null {
  if (input.sourceKind === "selected_leads") {
    const count = Math.max(0, Math.floor(Number(input.selectedLeadCount ?? 0)));
    const leadLabel = count === 1 ? "1 selected lead" : `${count} selected leads`;
    return `Created from selected leads · ${leadLabel}`;
  }
  return formatBriefingsImportSourceLine(input.sourceLastFilename);
}

export type BriefingsBatchListCta = { href: string; label: string };

/**
 * Primary action for a workspace card on the Workspaces list.
 */
export function briefingsBatchListPrimaryCta(input: {
  batchId: string;
  batchStatus: string;
  briefingTotal: number;
  briefingApproved: number;
}): BriefingsBatchListCta {
  const { batchId, batchStatus, briefingTotal } = input;
  if (batchStatus === "published") {
    return { href: batchBriefingsReviewPath(batchId), label: "Open Review" };
  }
  if (briefingTotal > 0) {
    return { href: batchBriefingsReviewPath(batchId), label: "Continue to Review" };
  }
  return { href: batchBriefingsPath(batchId), label: "Prepare" };
}

export function briefingsReviewProgressLine(approved: number, total: number): string | null {
  if (total <= 0) return null;
  if (approved >= total) return `All ${total} briefs reviewed`;
  return `${approved} of ${total} briefs reviewed`;
}
