import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { discardImportBatchForCompany } from "@/lib/server/import-wizard/import-batch-service";

type RouteCtx = { params: Promise<{ batchId: string }> };

/**
 * POST — discard (soft-delete) an import batch from exhibitor surfaces.
 * Allowed when status is draft or published. Does not delete materialized leads.
 */
export async function POST(_request: Request, ctx: RouteCtx) {
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

    try {
      const result = await discardImportBatchForCompany(id, companyId);
      return NextResponse.json({ ok: true, previousStatus: result.previousStatus });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "batch_not_found") {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
      if (msg === "batch_already_discarded") {
        return NextResponse.json({ error: "This run was already removed." }, { status: 409 });
      }
      if (msg === "batch_cannot_discard") {
        return NextResponse.json({ error: "This run cannot be removed." }, { status: 409 });
      }
      throw e;
    }
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
