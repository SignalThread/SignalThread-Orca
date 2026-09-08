import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import {
  loadBatchBriefingContext,
  saveBatchBriefingBatchNotes,
} from "@/lib/server/import-wizard/batch-briefing-context-service";

type RouteCtx = { params: Promise<{ batchId: string }> };

function mapError(e: unknown): NextResponse {
  const msg = e instanceof Error ? e.message : "";
  if (msg === "batch_not_found") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ error: msg || "Internal error" }, { status: 500 });
}

/** Merged context for the batch (event strategy + batch notes). GET. */
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

    const { batchId } = await ctx.params;
    const id = String(batchId ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing batch id." }, { status: 400 });

    const context = await loadBatchBriefingContext(id, companyId);
    return NextResponse.json({ context });
  } catch (e) {
    return mapError(e);
  }
}

/** Persists only `batchNotes` on this import batch. Strategy lives under Setup. */
export async function PUT(request: Request, ctx: RouteCtx) {
  try {
    const session = await resolveApiSession(request);
    if (String(session.role ?? "").toLowerCase() !== "exhibitor_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const companyId = String(session.companyId ?? "").trim();
    if (!companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as { context?: { batchNotes?: unknown } } | null;
    if (!body?.context || typeof body.context !== "object") {
      return NextResponse.json({ error: "context object required." }, { status: 400 });
    }

    const notes = body.context.batchNotes;
    if (typeof notes !== "string") {
      return NextResponse.json({ error: "context.batchNotes must be a string." }, { status: 400 });
    }

    const { batchId } = await ctx.params;
    const id = String(batchId ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing batch id." }, { status: 400 });

    await saveBatchBriefingBatchNotes(id, companyId, notes);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e);
  }
}
