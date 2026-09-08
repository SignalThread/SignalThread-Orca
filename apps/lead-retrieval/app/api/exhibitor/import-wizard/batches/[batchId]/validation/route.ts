import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { getBatchByIdForCompany } from "@/lib/server/import-wizard/import-batch-service";
import { getCellsMatrixForBatch } from "@/lib/server/import-wizard/import-batch-rows-service";
import { getFieldMappingStateForBatch } from "@/lib/server/import-wizard/field-mapping-state";
import { deriveImportBatchValidation } from "@/lib/import-wizard/import-batch-validation-derive";

type RouteCtx = { params: Promise<{ batchId: string }> };

/**
 * GET: derive validation from import_batch_field_mapping_state + import_batch_rows.
 * Always recomputes from current DB state (no stale cached summary).
 */
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

    const fm = await getFieldMappingStateForBatch(id);
    const matrix = await getCellsMatrixForBatch(id);
    if (!fm) {
      return NextResponse.json({
        dataRevision: batch.dataRevision,
        validation: deriveImportBatchValidation({
          csv_headers: [],
          selections: {},
          staged_rows: [],
        }),
      });
    }

    const validation = deriveImportBatchValidation({
      csv_headers: fm.csv_headers,
      selections: fm.selections,
      staged_rows: matrix,
    });

    return NextResponse.json({
      dataRevision: batch.dataRevision,
      validation,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
