import { NextRequest, NextResponse } from "next/server";
import { requireEventRouteAccess } from "../_lib/event-route-auth";
import { getPrisma } from "@/lib/prisma";
import { serializeOperationalExportCsv, renderOperationalExportHtml, type OperationalExportFormat, type OperationalExportRecipient } from "@/lib/operational-export";
import { auditOperationalExport, previewOperationalExport, type OperationalExportFilters } from "@/lib/operational-export-service";
import { serializeOperationalExportWorkbook } from "@/lib/operational-export-xlsx";

const ROLES = new Set<OperationalExportRecipient>(["hotel", "venue", "caterer", "av", "internal", "public"]);
const FORMATS = new Set<OperationalExportFormat>(["csv", "xlsx", "print", "json"]);
const STATUSES = new Set(["ready", "attention", "blocked"]);
export const runtime = "nodejs";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "read");
  if ("response" in auth) return auth.response;
  const role = (request.nextUrl.searchParams.get("role") ?? "internal") as OperationalExportRecipient;
  const format = (request.nextUrl.searchParams.get("format") ?? "csv") as OperationalExportFormat;
  if (!ROLES.has(role)) return badRequest("Unknown export recipient");
  if (!FORMATS.has(format)) return badRequest("Unknown export format");
  const status = request.nextUrl.searchParams.get("status") ?? undefined;
  if (status && !STATUSES.has(status)) return badRequest("Status must be ready, attention, or blocked");
  const changedSince = request.nextUrl.searchParams.get("changedSince") ?? undefined;
  if (changedSince && Number.isNaN(new Date(changedSince).getTime())) return badRequest("Changed-since must be a valid date and time");
  const date = request.nextUrl.searchParams.get("date") ?? undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return badRequest("Date must use YYYY-MM-DD");
  const filters: OperationalExportFilters = {
    date,
    room: request.nextUrl.searchParams.get("room")?.trim() || undefined,
    session: request.nextUrl.searchParams.get("session")?.trim() || undefined,
    status: status as OperationalExportFilters["status"],
    changedSince,
  };
  const projection = await previewOperationalExport(eventId, role, filters);
  const isPreview = request.nextUrl.searchParams.get("preview") === "1" || format === "json";
  if (isPreview) {
    const history = await getPrisma().eventFnbExportRecord.findMany({
      where: { eventId, recipient: role === "venue" ? "HOTEL" : role.toUpperCase() as "HOTEL" | "CATERER" | "AV" | "INTERNAL" | "PUBLIC" },
      orderBy: { generatedAt: "desc" },
      take: 10,
      select: { id: true, format: true, projectionVersion: true, rowCount: true, checksum: true, generatedFilename: true, dataAsOf: true, generatedAt: true },
    });
    return NextResponse.json({ projection, history: history.map((record) => ({ ...record, dataAsOf: record.dataAsOf?.toISOString() ?? null, generatedAt: record.generatedAt.toISOString() })) });
  }
  await auditOperationalExport({ eventId, userId: auth.user.id, format, projection });
  const stem = projection.filename.replace(/\.csv$/, "");
  const commonHeaders = {
    "X-Orca-Export-Role": role,
    "X-Orca-Export-Version": String(projection.metadata.projectionVersion),
    "X-Orca-Source-Version": projection.metadata.sourceVersion,
    "X-Orca-Data-As-Of": projection.metadata.dataAsOf,
    "X-Orca-Export-Checksum": projection.checksum,
    "X-Orca-Sensitive-Fields-Excluded": projection.sensitiveFieldsExcluded.join(","),
  };
  if (format === "print") {
    return new NextResponse(renderOperationalExportHtml(projection), { headers: { ...commonHeaders, "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `inline; filename="${stem}.html"` } });
  }
  if (format === "xlsx") {
    const bytes = serializeOperationalExportWorkbook(projection);
    return new NextResponse(bytes.buffer as ArrayBuffer, { headers: { ...commonHeaders, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${stem}.xlsx"` } });
  }
  return new NextResponse(serializeOperationalExportCsv(projection.rows), { headers: { ...commonHeaders, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${stem}.csv"` } });
}
