import { NextResponse } from "next/server";
import { parseExportFilters } from "@/lib/server/leads/leadsExportFiltersPure";
import type { ExportFilters, ExportScope, ExportSession } from "@/lib/server/leads/leadsExportTypes";

export type LeadsExportGetDeps = {
  resolveApiSession: (request: Request) => Promise<{
    userId: string;
    companyId: string;
    role: string;
  }>;
  resolveLeadsExportScope: (params: {
    session: ExportSession;
    searchParams: URLSearchParams;
  }) => Promise<ExportScope | Response>;
  runLeadsExportCsv: (
    scope: ExportScope,
    filters: ExportFilters
  ) => Promise<{ csv: string; filename: string; error: string | null }>;
};

/**
 * Core GET handler for /api/admin/leads/export — injectable deps for route-level tests.
 */
export async function handleLeadsExportGet(
  request: Request,
  deps: LeadsExportGetDeps
): Promise<Response> {
  try {
    const sessionUser = await deps.resolveApiSession(request);
    const role = String(sessionUser.role ?? "").trim().toLowerCase();

    const url = new URL(request.url);
    const session: ExportSession = {
      userId: sessionUser.userId,
      companyId: String(sessionUser.companyId ?? ""),
      role
    };

    const scope = await deps.resolveLeadsExportScope({
      session,
      searchParams: url.searchParams
    });

    if (scope instanceof Response) {
      return scope;
    }

    const filters = parseExportFilters(url.searchParams);
    const result = await deps.runLeadsExportCsv(scope, filters);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    const disposition = `attachment; filename="${result.filename.replace(/"/g, "")}"`;

    return new NextResponse(result.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": disposition,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
