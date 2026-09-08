import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { getBatchByIdForCompany } from "@/lib/server/import-wizard/import-batch-service";
import { getFieldMappingStateForBatch } from "@/lib/server/import-wizard/field-mapping-state";
import { getCellsMatrixForBatch } from "@/lib/server/import-wizard/import-batch-rows-service";
import { deriveImportBatchValidation } from "@/lib/import-wizard/import-batch-validation-derive";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ batchId: string }> };

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
    if (!id) {
      return NextResponse.json({ error: "Missing batch id." }, { status: 400 });
    }

    const batch = await getBatchByIdForCompany(id, companyId);
    if (!batch) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const supabase = await createSupabaseServerClient();

    const { count: totalRows } = await supabase
      .from("import_batch_rows")
      .select("*", { count: "exact", head: true })
      .eq("batch_id", id);

    const fm = await getFieldMappingStateForBatch(id);
    const matrix = await getCellsMatrixForBatch(id);

    let rowsWithIdentity = totalRows ?? 0;
    let rowsWithMustFix = 0;
    if (fm) {
      const v = deriveImportBatchValidation({
        csv_headers: fm.csv_headers,
        selections: fm.selections,
        staged_rows: matrix,
      });
      rowsWithIdentity = v.totalRows - v.rowsWithMustFix;
      rowsWithMustFix = v.rowsWithMustFix;
    }

    /** Read-only draft briefing approval counts — does not affect import eligibility. */
    const { count: briefingRowsApproved } = await supabase
      .from("import_batch_row_briefings")
      .select("*", { count: "exact", head: true })
      .eq("batch_id", id)
      .eq("approval_status", "approved");

    const { count: briefingRowsNotApproved } = await supabase
      .from("import_batch_row_briefings")
      .select("*", { count: "exact", head: true })
      .eq("batch_id", id)
      .neq("approval_status", "approved");

    return NextResponse.json({
      batchStatus: batch.status,
      dataRevision: batch.dataRevision,
      totalRows: totalRows ?? 0,
      rowsWithIdentity,
      rowsWithMustFix,
      briefingRowsApproved: briefingRowsApproved ?? 0,
      briefingRowsNotApproved: briefingRowsNotApproved ?? 0,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
