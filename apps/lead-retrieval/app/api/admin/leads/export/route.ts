import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { handleLeadsExportGet } from "@/lib/server/leads/leadsExportGetHandler";
import {
  resolveLeadsExportScope,
  runLeadsExportCsv,
  type ExportSession
} from "@/lib/server/leads/leadsExportQuery";
import type { ExportFilters } from "@/lib/server/leads/leadsExportTypes";

export const dynamic = "force-dynamic";

const MAX_EXPORT_SELECTION = 5000;

/**
 * Server-authoritative CSV export for leads. Scope is enforced per role:
 * - exhibitor_admin: session company only; optional eventId / q / status.
 * - organizer: eventId must be in getOrganizerScope; optional q / status.
 * - platform_admin: companyId (exhibitor company) required; optional eventId / q / status.
 */
export async function GET(request: Request) {
  return handleLeadsExportGet(request, {
    resolveApiSession,
    resolveLeadsExportScope,
    runLeadsExportCsv
  });
}

/**
 * Export a specific set of lead ids (scoped intersection). Used for bulk export from the leads table.
 */
export async function POST(request: Request) {
  try {
    const sessionUser = await resolveApiSession(request);
    const body = (await request.json().catch(() => null)) as {
      leadIds?: unknown;
      eventId?: string | null;
      q?: string | null;
    } | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const leadIdsRaw = Array.isArray(body.leadIds) ? body.leadIds : [];
    const leadIds = leadIdsRaw
      .map((id) => String(id ?? "").trim())
      .filter(Boolean)
      .slice(0, MAX_EXPORT_SELECTION);

    if (leadIds.length === 0) {
      return NextResponse.json({ error: "leadIds must be a non-empty array." }, { status: 400 });
    }

    const session: ExportSession = {
      userId: sessionUser.userId,
      companyId: String(sessionUser.companyId ?? ""),
      role: String(sessionUser.role ?? "").trim().toLowerCase()
    };

    const searchParams = new URLSearchParams();
    const eventId = body.eventId != null ? String(body.eventId).trim() : "";
    if (eventId) searchParams.set("eventId", eventId);
    const q = body.q != null ? String(body.q).trim() : "";
    if (q) searchParams.set("q", q);

    const scope = await resolveLeadsExportScope({ session, searchParams });
    if (scope instanceof Response) {
      return scope;
    }

    const filters: ExportFilters = {
      q: q || null,
      status: null,
      leadIds
    };

    const result = await runLeadsExportCsv(scope, filters);

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
