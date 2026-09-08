import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { fetchGoogleSheetCsvForImport } from "@/lib/import-wizard/google-sheets";
import { buildPreviewColumnsFromParse } from "@/lib/import-wizard/parse-csv-sample";

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

    const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url) {
      return NextResponse.json({ error: "Paste a Google Sheets link." }, { status: 400 });
    }

    const result = await fetchGoogleSheetCsvForImport(url);
    if (!result.ok) {
      const status = result.code === "invalid_url" ? 400 : result.code === "fetch_failed" ? 502 : 422;
      return NextResponse.json({ error: result.error, code: result.code }, { status });
    }

    const previewSample = {
      headers: result.parsed.headers,
      dataRows: result.parsed.dataRows.slice(0, 3),
    };

    return NextResponse.json({
      source: {
        kind: "google_sheets",
        sourceName: result.sourceName,
        sourceUrl: url,
        exportUrl: result.exportUrl,
        headers: result.parsed.headers,
        dataRows: result.parsed.dataRows,
        previewColumns: buildPreviewColumnsFromParse(previewSample),
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
