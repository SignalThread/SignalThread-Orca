import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { runImportWizardBatchEnrichment } from "@/lib/enrichment/import-wizard-batch";
import { wizardProviderIdToAdapterKey } from "@/lib/import-wizard/wizard-enrichment-bridge";

export async function POST(request: Request) {
  try {
    const session = await resolveApiSession(request);
    if (String(session.role ?? "").toLowerCase() !== "exhibitor_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const companyId = String(session.companyId ?? "").trim();
    if (!companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const providerId = typeof body?.providerId === "string" ? body.providerId.trim() : "";
    const adapterKey = wizardProviderIdToAdapterKey(providerId);
    if (!adapterKey) {
      return NextResponse.json({ error: "Invalid providerId." }, { status: 400 });
    }

    const batchId = typeof body?.batchId === "string" ? body.batchId.trim() : "";
    if (!batchId) {
      return NextResponse.json({ error: "Missing batchId." }, { status: 400 });
    }

    const result = await runImportWizardBatchEnrichment({
      companyId,
      userId: session.userId,
      adapterKey,
      batchId,
    });

    if (!result.ok) {
      const status =
        result.code === "missing_credentials"
          ? 400
          : result.code === "no_leads"
            ? 400
            : result.code === "batch_not_found"
              ? 404
              : 500;
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status }
      );
    }

    return NextResponse.json(result.data);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
