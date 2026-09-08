import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { ensureActiveDraftBatch, formatActiveDraftResponse } from "@/lib/server/import-wizard/import-batch-service";

/**
 * GET: ensure the exhibitor has exactly one active draft batch (create if missing) and return its summary.
 * This is the canonical entry point when opening the import wizard.
 */
export async function GET(_request: Request) {
  let sessionUserIdForLog: string | undefined;
  let companyIdForLog: string | undefined;
  try {
    const session = await resolveApiSession(_request);
    sessionUserIdForLog = session.userId;
    if (String(session.role ?? "").toLowerCase() !== "exhibitor_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const companyId = String(session.companyId ?? "").trim();
    companyIdForLog = companyId;
    if (!companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const batch = await ensureActiveDraftBatch(companyId);
    return NextResponse.json(formatActiveDraftResponse(batch));
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error(
      JSON.stringify({
        event: "import_wizard_active_draft_failed",
        userId: sessionUserIdForLog ?? null,
        companyId: companyIdForLog ?? null,
        message,
        table: "import_batches",
      })
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
