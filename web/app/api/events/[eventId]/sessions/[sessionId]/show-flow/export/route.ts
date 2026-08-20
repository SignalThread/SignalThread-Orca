import { NextRequest, NextResponse } from "next/server";
import { requireEventRouteAccess } from "../../../../_lib/event-route-auth";
import { getPrisma } from "@/lib/prisma";
import { getSessionShowFlowWorkspace, SessionShowFlowError } from "@/lib/session-show-flow";
import {
  buildShowFlowExportDocument,
  serializeShowFlowCsv,
  serializeShowFlowDocx,
  serializeShowFlowPdf,
  serializeShowFlowXlsx,
  type ShowFlowExportFormat,
  type ShowFlowExportRole,
  type ShowFlowExportVariant,
} from "@/lib/session-show-flow-export";
import { recordEventActivity } from "@/src/server/services/event-activity";

export const runtime = "nodejs";
const FORMATS = new Set<ShowFlowExportFormat>(["pdf", "xlsx", "csv", "docx"]);
const VARIANTS = new Set<ShowFlowExportVariant>(["internal", "client", "role"]);
const ROLES = new Set<ShowFlowExportRole>(["av", "venue", "registration", "speaker"]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string; sessionId: string }> }) {
  const { eventId, sessionId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "read");
  if ("response" in auth) return auth.response;
  try {
    const format = (request.nextUrl.searchParams.get("format") ?? "pdf") as ShowFlowExportFormat;
    const variant = (request.nextUrl.searchParams.get("variant") ?? "internal") as ShowFlowExportVariant;
    const role = (request.nextUrl.searchParams.get("role") ?? "av") as ShowFlowExportRole;
    if (!FORMATS.has(format)) throw new SessionShowFlowError("Unsupported export format");
    if (!VARIANTS.has(variant)) throw new SessionShowFlowError("Unsupported export variant");
    if (variant === "role" && !ROLES.has(role)) throw new SessionShowFlowError("Unsupported role sheet");
    const selectedCueIds = request.nextUrl.searchParams.get("cueIds")?.split(",").filter(Boolean) ?? [];
    const [event, workspace] = await Promise.all([
      getPrisma().event.findUnique({ where: { id: eventId }, select: { name: true, timezone: true } }),
      getSessionShowFlowWorkspace(eventId, sessionId),
    ]);
    if (!event) throw new SessionShowFlowError("Event not found", 404);
    const document = buildShowFlowExportDocument({
      eventName: event.name,
      sessionTitle: workspace.session.title,
      sessionDate: workspace.session.date,
      roomName: workspace.session.roomName,
      timezone: event.timezone,
      generatedAt: new Date().toISOString(),
      version: workspace.revision,
      status: workspace.status,
      variant,
      role,
      selectedCueIds,
      cues: workspace.items,
    });
    const serializers = { pdf: serializeShowFlowPdf, xlsx: serializeShowFlowXlsx, csv: serializeShowFlowCsv, docx: serializeShowFlowDocx } as const;
    const mime = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv; charset=utf-8", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } as const;
    const bytes = serializers[format](document);
    await recordEventActivity(getPrisma(), {
      eventId,
      actor: { kind: "USER", userId: auth.user.id },
      module: "RUN_OF_SHOW",
      action: "GENERATED",
      entityType: "SessionShowFlow",
      entityId: sessionId,
      entityLabel: workspace.session.title,
      message: `Exported ${format.toUpperCase()} ${variant} Show Flow`,
      changes: [{ field: "export", label: "Export", from: null, to: `${format}:${variant}:${workspace.revision}` }],
      source: { type: "SessionShowFlowRevision", id: `${sessionId}:${workspace.revision}` },
    });
    const exactBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new NextResponse(exactBytes, {
      headers: {
        "Content-Type": mime[format],
        "Content-Disposition": `attachment; filename="${document.filenameStem}.${format}"`,
        "X-Orca-Show-Flow-Version": String(workspace.revision),
        "X-Orca-Show-Flow-Status": workspace.status,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to export Show Flow" }, { status: error instanceof SessionShowFlowError ? error.status : 500 });
  }
}
