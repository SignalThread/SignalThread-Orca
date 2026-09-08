import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import type { ImportBriefingManualContextV1 } from "@/lib/import-wizard/briefing-content-json";
import type { BriefingPolishedBundle } from "@/lib/import-wizard/briefing-polished-types";
import {
  approveBatchBriefingRow,
  getBatchBriefingReviewProgress,
  loadBatchBriefingDetail,
  saveEditedBriefingForBatchRow,
  saveManualContextForBatchRow,
} from "@/lib/server/import-wizard/import-batch-briefing-service";

type RouteCtx = { params: Promise<{ batchId: string; rowId: string }> };

function isRlsError(msg: string): boolean {
  return /row-level security|permission denied|violates row-level security/i.test(msg);
}

function mapError(e: unknown): NextResponse {
  const msg = e instanceof Error ? e.message : "";
  if (msg === "batch_not_found" || msg === "batch_not_draft" || msg === "briefing_row_not_found") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (msg === "batch_not_reviewable") {
    return NextResponse.json({ error: "Batch is not reviewable." }, { status: 409 });
  }
  if (isRlsError(msg)) {
    return NextResponse.json(
      { error: "Not allowed to access briefings for this batch.", code: "permission_denied" },
      { status: 403 }
    );
  }
  return NextResponse.json({ error: msg || "Internal error" }, { status: 500 });
}

export async function GET(request: Request, ctx: RouteCtx) {
  try {
    const session = await resolveApiSession(request);
    if (String(session.role ?? "").toLowerCase() !== "exhibitor_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const companyId = String(session.companyId ?? "").trim();
    if (!companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const { batchId, rowId } = await ctx.params;
    const b = String(batchId ?? "").trim();
    const r = String(rowId ?? "").trim();
    if (!b || !r) {
      return NextResponse.json({ error: "Missing batch or row id." }, { status: 400 });
    }

    const detail = await loadBatchBriefingDetail(b, companyId, r);
    if (!detail) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ detail });
  } catch (e) {
    return mapError(e);
  }
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  try {
    const session = await resolveApiSession(request);
    if (String(session.role ?? "").toLowerCase() !== "exhibitor_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const companyId = String(session.companyId ?? "").trim();
    if (!companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as {
      action?: string;
      manualContext?: ImportBriefingManualContextV1;
      polished?: BriefingPolishedBundle;
    } | null;

    const { batchId, rowId } = await ctx.params;
    const b = String(batchId ?? "").trim();
    const r = String(rowId ?? "").trim();
    if (!b || !r) {
      return NextResponse.json({ error: "Missing batch or row id." }, { status: 400 });
    }

    if (body?.action === "approve") {
      const approveResult = await approveBatchBriefingRow(b, companyId, r, session.userId);
      const progress = await getBatchBriefingReviewProgress(b, companyId);
      return NextResponse.json({
        ok: approveResult.ok,
        approvalUpdated: approveResult.approvalUpdated,
        syncAttempted: approveResult.syncAttempted,
        syncSucceeded: approveResult.syncSucceeded,
        resolvedLeadId: approveResult.resolvedLeadId,
        leadBriefingWritten: approveResult.leadBriefingWritten,
        failureReason: approveResult.failureReason,
        progress,
      });
    }

    if (body?.action === "save_manual_context") {
      if (!body.manualContext || typeof body.manualContext !== "object" || Array.isArray(body.manualContext)) {
        return NextResponse.json({ error: "manualContext object required." }, { status: 400 });
      }
      await saveManualContextForBatchRow(b, companyId, r, body.manualContext);
      return NextResponse.json({ ok: true });
    }

    if (body?.action === "save_brief_edits") {
      if (!body.polished || typeof body.polished !== "object" || Array.isArray(body.polished)) {
        return NextResponse.json({ error: "polished brief object required." }, { status: 400 });
      }
      const polished = await saveEditedBriefingForBatchRow(b, companyId, r, body.polished);
      return NextResponse.json({ ok: true, polished });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (e) {
    return mapError(e);
  }
}
