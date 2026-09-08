import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { loadBatchBriefingQueue } from "@/lib/server/import-wizard/import-batch-briefing-service";

type RouteCtx = { params: Promise<{ batchId: string }> };

function isRlsError(msg: string): boolean {
  return /row-level security|permission denied|violates row-level security/i.test(msg);
}

function mapError(e: unknown): NextResponse {
  const msg = e instanceof Error ? e.message : "";
  if (msg === "batch_not_found") {
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

export async function GET(_request: Request, ctx: RouteCtx) {
  try {
    const session = await resolveApiSession(_request);
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

    const data = await loadBatchBriefingQueue(id, companyId);
    return NextResponse.json(data);
  } catch (e) {
    return mapError(e);
  }
}
