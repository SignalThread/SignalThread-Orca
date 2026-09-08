import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import {
  approveAllBatchBriefingRows,
  getBatchBriefingReviewProgress,
  loadBatchBriefingQueue,
} from "@/lib/server/import-wizard/import-batch-briefing-service";

type RouteCtx = { params: Promise<{ batchId: string }> };

export async function POST(request: Request, ctx: RouteCtx) {
  try {
    const session = await resolveApiSession(request);
    if (String(session.role ?? "").toLowerCase() !== "exhibitor_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const companyId = String(session.companyId ?? "").trim();
    if (!companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const { batchId } = await ctx.params;
    const id = String(batchId ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing batch id." }, { status: 400 });
    }

    const bulk = await approveAllBatchBriefingRows(id, companyId, session.userId);
    const queuePayload = await loadBatchBriefingQueue(id, companyId);
    const progress = await getBatchBriefingReviewProgress(id, companyId);
    const syncFailures = bulk.syncResults
      .filter((s) => !s.syncSucceeded)
      .map((s) => ({ batchRowId: s.batchRowId, failureReason: s.failureReason }));
    return NextResponse.json({
      ok: bulk.ok,
      approvalRowsUpdated: bulk.approvalRowsUpdated,
      syncSucceededCount: bulk.syncSucceededCount,
      syncFailedCount: bulk.syncFailedCount,
      syncFailures,
      progress,
      ...queuePayload,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "batch_not_found" || msg === "batch_not_draft") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (msg === "batch_not_reviewable") {
      return NextResponse.json({ error: "Batch is not reviewable." }, { status: 409 });
    }
    if (/row-level security|permission denied|violates row-level security/i.test(msg)) {
      return NextResponse.json(
        { error: "Not allowed to approve briefings for this batch.", code: "permission_denied" },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: msg || "Internal error" }, { status: 500 });
  }
}
