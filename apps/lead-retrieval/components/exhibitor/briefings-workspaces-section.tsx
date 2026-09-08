import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { BriefingsRunCard } from "@/components/exhibitor/briefings-run-card";
import { exhibitorBriefingsIntroProseClass } from "@/lib/exhibitor-briefings-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  briefingsReviewProgressLine,
  formatBriefingsBatchRunTitle,
  formatBriefingsWorkspaceSourceLine,
  importBatchStatusBadgeLabel
} from "@/lib/exhibitor/briefings-ui-copy";
import { IMPORT_WIZARD_BASE_PATH } from "@/lib/import-wizard/paths";
import { BriefingsLeadPickerLauncher } from "@/components/exhibitor/briefings-lead-picker-launcher";
import { resolveValidatedActiveEventIdForUser } from "@/lib/server/company-event-access";

type BatchRow = {
  id: string;
  status: string;
  source_last_filename: string | null;
  source_kind: string | null;
  source_selected_lead_ids: string[] | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

type BriefingCountRow = {
  batch_id: string;
  approval_status: string;
};

function formatUpdatedShort(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  if (Number.isNaN(ms) || ms < 0) {
    const d2 = new Date(iso);
    if (Number.isNaN(d2.getTime())) return iso;
    return d2.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function aggregateBriefingReview(rows: BriefingCountRow[] | null): Map<string, { approved: number; total: number }> {
  const map = new Map<string, { approved: number; total: number }>();
  for (const r of rows ?? []) {
    const cur = map.get(r.batch_id) ?? { approved: 0, total: 0 };
    cur.total += 1;
    if (r.approval_status === "approved") cur.approved += 1;
    map.set(r.batch_id, cur);
  }
  return map;
}

/** Operational workspace list — rendered below strategy on the unified Briefings hub. */
export async function BriefingsWorkspacesSection() {
  const sessionUser = await requireRole("exhibitor_admin");
  const supabase = await createSupabaseServerClient();

  const companyId = sessionUser.company_id;
  if (!companyId) {
    return (
      <section
        id="briefings-workspaces"
        data-testid="exhibitor-briefings-index"
        className="scroll-mt-24 border-t border-slate-200/80 pt-10"
      >
        <div className="rounded-xl border bg-card p-6 text-sm text-slate-600">
          Your account is not assigned to a company yet.
        </div>
      </section>
    );
  }

  const { data: rawBatches, error } = await supabase
    .from("import_batches")
    .select("id, status, source_last_filename, source_kind, source_selected_lead_ids, created_at, updated_at, published_at")
    .eq("company_id", companyId)
    .in("status", ["draft", "published"])
    .order("updated_at", { ascending: false })
    .limit(50);

  const batches = (rawBatches ?? []) as BatchRow[];
  const { eventId: activeEventId } = await resolveValidatedActiveEventIdForUser(sessionUser.id, null);
  const draftCount = batches.filter((b) => b.status === "draft").length;
  const publishedCount = batches.length - draftCount;

  const batchIds = batches.map((b) => b.id);
  let reviewByBatch = new Map<string, { approved: number; total: number }>();
  if (batchIds.length > 0) {
    const { data: briefingRows } = await supabase
      .from("import_batch_row_briefings")
      .select("batch_id, approval_status")
      .in("batch_id", batchIds);
    reviewByBatch = aggregateBriefingReview((briefingRows ?? []) as BriefingCountRow[]);
  }

  return (
    <section
      id="briefings-workspaces"
      data-testid="exhibitor-briefings-index"
      className="scroll-mt-24 border-t border-slate-200/85 pt-10"
      aria-labelledby="briefings-workspaces-heading"
    >
      <header className="space-y-1">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 id="briefings-workspaces-heading" className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
              Workspaces
            </h2>
            <p className={`${exhibitorBriefingsIntroProseClass} text-sm leading-snug text-slate-600`}>
              Each row is a briefing workspace for one import run or lead selection — open it to prepare leads, then move to
              Review to approve drafts. Event-wide AI context from the{" "}
              <span className="font-medium text-slate-800">AI Briefing Strategy</span> block above applies to every workspace
              here.
            </p>
          </div>
          <BriefingsLeadPickerLauncher eventId={activeEventId} />
        </div>
        {batches.length > 0 ? (
          <p className="text-[11px] text-slate-500">
            {batches.length} workspace{batches.length === 1 ? "" : "s"} · {draftCount} in progress · {publishedCount} live on
            leads
          </p>
        ) : null}
      </header>

      <div className="mt-6 space-y-4">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-sm text-red-900">
            Couldn&apos;t load workspaces. Refresh and try again.
          </div>
        ) : batches.length === 0 ? (
          <div
            className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-5 py-6 text-center"
            data-testid="briefings-empty-state"
          >
            <p className="text-sm font-medium text-slate-800">No workspaces yet</p>
            <p className="mt-1 text-sm text-slate-600">
              Import leads with the{" "}
              <Link href={IMPORT_WIZARD_BASE_PATH} className="font-medium text-indigo-600 hover:underline">
                Import Wizard
              </Link>
              , then continue here to review and publish briefs.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="briefings-batch-list">
            {batches.map((batch) => {
              const title = formatBriefingsBatchRunTitle(batch.created_at, batch.id);
              const sourceLine = formatBriefingsWorkspaceSourceLine({
                sourceKind: batch.source_kind ?? "import_file",
                sourceLastFilename: batch.source_last_filename,
                selectedLeadCount: batch.source_selected_lead_ids?.length ?? 0,
              });
              const lastUpdated = formatUpdatedShort(batch.updated_at);
              const rev = reviewByBatch.get(batch.id);
              const total = rev?.total ?? 0;
              const approved = rev?.approved ?? 0;
              const reviewLine = briefingsReviewProgressLine(approved, total);
              const leadLine = total > 0 ? `${total} lead${total === 1 ? "" : "s"} in this run` : null;

              return (
                <BriefingsRunCard
                  key={batch.id}
                  batchId={batch.id}
                  batchStatus={batch.status}
                  statusBadgeLabel={importBatchStatusBadgeLabel(batch.status)}
                  title={title}
                  sourceLine={sourceLine}
                  lastUpdated={lastUpdated}
                  reviewLine={reviewLine}
                  leadLine={leadLine}
                  showNoBriefsHint={total === 0}
                  briefingTotal={total}
                  briefingApproved={approved}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
