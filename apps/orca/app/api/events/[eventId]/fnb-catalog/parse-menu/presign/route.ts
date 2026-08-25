import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { attachFnbSourceMenuUpload, createFnbSourceMenu, FnbCatalogError } from "@/lib/fnb-catalog";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { createPresignedUpload, maxUploadBytes } from "@/src/server/storage/documents";
import { requireEventRouteAccess } from "../../../_lib/event-route-auth";

export const runtime = "nodejs";

function normalizeFilename(filename: string): string {
  return filename
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/^-+/, "")
    .slice(0, 120) || "menu.pdf";
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);
  console.error(`${context} failed`, error);
  const message = error instanceof Error ? error.message : "Failed to prepare menu upload";
  if (/^File size must be/i.test(message)) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (/Missing required env var/i.test(message)) {
    return NextResponse.json({ error: "Menu upload storage is not configured" }, { status: 503 });
  }
  return NextResponse.json({ error: "Failed to prepare menu upload" }, { status: 500 });
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const event = await getPrisma().event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const filename = toText(body.filename);
  const contentType = toText(body.contentType).toLowerCase() || "application/pdf";
  const fileSizeBytes = Number(body.fileSizeBytes);
  if (!filename) {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }
  if (contentType !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files can be uploaded to this parser route" }, { status: 400 });
  }
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    return NextResponse.json({ error: "fileSizeBytes must be a positive number" }, { status: 400 });
  }

  const uploadId = randomUUID();
  const objectKey = `events/${eventId}/fnb-menus/${uploadId}/${normalizeFilename(filename)}`;
  const sourceType = toText(body.sourceType).toUpperCase();
  const baseSourceMenuId = toText(body.baseSourceMenuId);
  const sourceMenuId = toText(body.sourceMenuId);

  try {
    console.info("[fnb-source-menu] upload start", {
      eventId,
      filename,
      contentType,
      fileSizeBytes,
      sourceType: sourceType || "ORIGINAL",
      baseSourceMenuId: baseSourceMenuId || null,
      sourceMenuId: sourceMenuId || null,
    });
    const presign = await createPresignedUpload({
      objectKey,
      contentType,
      fileSizeBytes,
    });
    const sourceMenu = sourceMenuId
      ? await attachFnbSourceMenuUpload(eventId, sourceMenuId, {
          fileName: filename,
          objectKey,
          sourceType,
          expectedVersion: body.expectedVersion,
        })
      : await createFnbSourceMenu(eventId, {
          fileName: filename,
          menuName: filename.replace(/\.[^.]+$/, ""),
          objectKey,
          sourceType,
          baseSourceMenuId,
        });
    return NextResponse.json({
      ...presign,
      uploadId,
      maxFileSizeBytes: maxUploadBytes(),
      sourceMenu,
    });
  } catch (error) {
    if (error instanceof FnbCatalogError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return toErrorResponse(error, "POST /api/events/:eventId/fnb-catalog/parse-menu/presign");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/fnb-catalog/parse-menu/presign", postHandler);
