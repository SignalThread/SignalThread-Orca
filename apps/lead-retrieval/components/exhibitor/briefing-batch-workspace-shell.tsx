"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { batchBriefingsPath, batchBriefingsReviewPath } from "@/lib/import-wizard/paths";

function WorkspaceStatusBadge({ status, label }: { status: string; label: string }) {
  const base =
    "inline-flex h-8 shrink-0 items-center justify-center rounded-md px-3 text-[10px] font-semibold uppercase tracking-wide";
  if (status === "draft") {
    return (
      <span className={`${base} bg-amber-50 text-amber-900 ring-1 ring-amber-200/90`} data-testid="briefing-workspace-status-badge">
        {label}
      </span>
    );
  }
  if (status === "published") {
    return (
      <span className={`${base} bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/90`} data-testid="briefing-workspace-status-badge">
        {label}
      </span>
    );
  }
  return (
    <span className={`${base} bg-slate-50 text-slate-700 ring-1 ring-slate-200/90`} data-testid="briefing-workspace-status-badge">
      {label}
    </span>
  );
}

export function BriefingBatchWorkspaceShell({
  batchId,
  workspaceHeadline,
  workspaceSubline,
  batchStatus,
  statusBadgeLabel,
  headerActions,
  children,
}: {
  batchId: string;
  /** Primary title — usually import filename, else run line. */
  workspaceHeadline: string;
  /** Run reference when headline is the file name. */
  workspaceSubline: string | null;
  batchStatus: string;
  statusBadgeLabel: string;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const reviewPath = batchBriefingsReviewPath(batchId);
  const prepPath = batchBriefingsPath(batchId);
  const isReview = pathname === reviewPath || pathname.endsWith("/review");

  const stepTabClass = (active: boolean) =>
    `-mb-px inline-flex items-center border-b-2 px-2.5 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 sm:px-3 ${
      active
        ? "border-indigo-600 text-slate-900"
        : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
    }`;

  return (
    <div className="space-y-5" data-testid="briefing-batch-workspace">
      <header className="space-y-3 border-b border-slate-200/80 pb-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <h1
              className="text-lg font-semibold leading-snug tracking-tight text-slate-950 sm:text-xl"
              title={workspaceHeadline}
            >
              {workspaceHeadline}
            </h1>
            {workspaceSubline ? (
              <p className="text-xs font-medium tabular-nums text-slate-500">{workspaceSubline}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2" data-testid="briefing-workspace-header-actions">
            {headerActions}
            <WorkspaceStatusBadge status={batchStatus} label={statusBadgeLabel} />
          </div>
        </div>

        <nav
          className="flex gap-1 border-b border-slate-200/80"
          aria-label="Workspace steps"
          data-testid="briefing-batch-workspace-nav"
        >
          <Link
            href={prepPath}
            className={stepTabClass(!isReview)}
            data-testid="briefing-workspace-tab-prep"
            aria-current={!isReview ? "page" : undefined}
          >
            Prepare
          </Link>
          <Link
            href={reviewPath}
            className={stepTabClass(isReview)}
            data-testid="briefing-workspace-tab-review"
            aria-current={isReview ? "page" : undefined}
          >
            Review
          </Link>
        </nav>
      </header>

      <div className="space-y-5">{children}</div>
    </div>
  );
}
