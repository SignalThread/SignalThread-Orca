import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { EventFnbSourceMenuStatus } from "@prisma/client";
import {
  FnbCatalogError,
  getFnbSourceMenuForEvent,
  replaceFnbCatalogItemsForSourceMenu,
  updateFnbSourceMenuStatus,
} from "@/lib/fnb-catalog";
import { parseFnbMenuVisually } from "@/lib/fnb-visual-menu-parser";
import { getPrisma } from "@/lib/prisma";
import { getR2Bucket, getR2Client } from "@/lib/r2";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { createDocumentVersionFromEventObject } from "@/src/server/services/documents";
import { requireEventRouteAccess } from "../../_lib/event-route-auth";

export const runtime = "nodejs";

type ParseMenuRequest = {
  fileName?: unknown;
  objectKey?: unknown;
  sourceMenuId?: unknown;
};

type ParsedMenuInput = {
  sourceMenuId: string | null;
  fileName: string;
  objectKey: string | null;
  pdfBytes: Uint8Array;
  source: "multipart-pdf" | "r2-pdf";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to parse menu";
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isValidFnbMenuObjectKey(eventId: string, objectKey: string): boolean {
  if (objectKey.includes("..")) return false;
  return new RegExp(`^events/${eventId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/fnb-menus/[^/]+/[^/]+$`).test(objectKey);
}

async function bodyToUint8Array(body: unknown): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (isRecord(body) && typeof body.transformToByteArray === "function") {
    return body.transformToByteArray() as Promise<Uint8Array>;
  }
  if (body && typeof body === "object" && Symbol.asyncIterator in body) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
      chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
    }
    const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const output = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }
  throw new Error("Uploaded menu PDF was not found. Please upload the file again.");
}

async function readPdfBytesFromObjectKey(objectKey: string): Promise<Uint8Array> {
  const response = await getR2Client().send(new GetObjectCommand({
    Bucket: getR2Bucket(),
    Key: objectKey,
  }));
  if (!response.Body) {
    throw new Error("Uploaded menu PDF was not found. Please upload the file again.");
  }
  return bodyToUint8Array(response.Body);
}

async function parseRequestInput(request: NextRequest, eventId: string): Promise<ParsedMenuInput | NextResponse> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const maybeFile = formData.get("file");
    if (!(maybeFile instanceof File)) {
      return NextResponse.json({ error: "PDF file is required" }, { status: 400 });
    }

    const fileName = normalizeText(formData.get("fileName")) || maybeFile.name;
    const isPdf = maybeFile.type === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json({ error: "Only PDF files can be uploaded to this parser route" }, { status: 400 });
    }

    return {
      sourceMenuId: null,
      fileName,
      objectKey: null,
      pdfBytes: new Uint8Array(await maybeFile.arrayBuffer()),
      source: "multipart-pdf",
    };
  }

  let body: ParseMenuRequest;
  try {
    body = (await request.json()) as ParseMenuRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sourceMenuId = normalizeText(body.sourceMenuId);
  const persistedSourceMenu = sourceMenuId ? await getFnbSourceMenuForEvent(eventId, sourceMenuId) : null;
  const fileName = normalizeText(body.fileName) || persistedSourceMenu?.fileName || "";
  if (!fileName) {
    return NextResponse.json({ error: "fileName is required" }, { status: 400 });
  }
  const objectKey = normalizeText(body.objectKey) || persistedSourceMenu?.objectKey || "";
  if (persistedSourceMenu && objectKey !== persistedSourceMenu.objectKey) {
    await updateFnbSourceMenuStatus(eventId, sourceMenuId, EventFnbSourceMenuStatus.FAILED, {
      progressSummary: "Parse failed",
      lastError: "objectKey does not match persisted source menu",
    });
    return NextResponse.json({ error: "objectKey does not match persisted source menu" }, { status: 400 });
  }

  if (objectKey) {
    if (!isValidFnbMenuObjectKey(eventId, objectKey)) {
      if (sourceMenuId) {
        await updateFnbSourceMenuStatus(eventId, sourceMenuId, EventFnbSourceMenuStatus.FAILED, {
          progressSummary: "Parse failed",
          lastError: "objectKey is not valid for this event",
        });
      }
      return NextResponse.json({ error: "objectKey is not valid for this event" }, { status: 400 });
    }
    try {
      if (sourceMenuId) {
        await updateFnbSourceMenuStatus(eventId, sourceMenuId, EventFnbSourceMenuStatus.READING_PDF, {
          progressSummary: "Reading PDF",
          lastError: null,
        });
      }
      const pdfBytes = await readPdfBytesFromObjectKey(objectKey);
      return {
        sourceMenuId: sourceMenuId || null,
        fileName,
        objectKey,
        pdfBytes,
        source: "r2-pdf",
      };
    } catch (error) {
      if (sourceMenuId) {
        await updateFnbSourceMenuStatus(eventId, sourceMenuId, EventFnbSourceMenuStatus.FAILED, {
          progressSummary: "Failed while reading PDF",
          lastError: "The uploaded menu could not be read. Please verify the file and try again.",
        });
      }
      if (error instanceof Error && error.message === "Uploaded menu PDF was not found. Please upload the file again.") {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      throw error;
    }
  }

  return NextResponse.json({ error: "Uploaded menu PDF objectKey is required for visual parsing" }, { status: 400 });
}

async function ensureEventExists(eventId: string) {
  const event = await getPrisma().event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return null;
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;

  const eventError = await ensureEventExists(eventId);
  if (eventError) return eventError;

  let input: ParsedMenuInput | NextResponse;
  try {
    input = await parseRequestInput(request, eventId);
  } catch (error) {
    if (error instanceof FnbCatalogError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  if (input instanceof NextResponse) return input;

  const fileName = input.fileName;
  const sourceMenuId = input.sourceMenuId;
  if (sourceMenuId) {
    console.info("[fnb-source-menu] parse start", { eventId, sourceMenuId, fileName, parser: "visual" });
  }

  if (sourceMenuId && input.objectKey) {
    await createDocumentVersionFromEventObject(eventId, {
      title: fileName.replace(/\.[^.]+$/, "") || fileName,
      categoryName: "Catering",
      categorySlug: "catering",
      categoryColor: "#ca8a04",
      objectKey: input.objectKey,
      mimeType: "application/pdf",
      fileSizeBytes: input.pdfBytes.byteLength,
      originalFilename: fileName,
      links: [{ linkType: "EVENT", linkedId: eventId }],
    }, auth.user.id);
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    if (sourceMenuId) {
      await updateFnbSourceMenuStatus(eventId, sourceMenuId, EventFnbSourceMenuStatus.FAILED, {
        progressSummary: "Parse failed",
        lastError: "OPENAI_API_KEY is not configured",
      });
    }
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
  }

  const model = process.env.FNB_VISUAL_MENU_PARSER_MODEL?.trim() || process.env.FNB_MENU_PARSER_MODEL?.trim();
  if (!model) {
    if (sourceMenuId) {
      await updateFnbSourceMenuStatus(eventId, sourceMenuId, EventFnbSourceMenuStatus.FAILED, {
        progressSummary: "Parse failed",
        lastError: "FNB_VISUAL_MENU_PARSER_MODEL or FNB_MENU_PARSER_MODEL is not configured",
      });
    }
    return NextResponse.json({ error: "FNB_VISUAL_MENU_PARSER_MODEL or FNB_MENU_PARSER_MODEL is not configured" }, { status: 503 });
  }

  try {
    if (sourceMenuId) {
      await updateFnbSourceMenuStatus(eventId, sourceMenuId, EventFnbSourceMenuStatus.EXTRACTING_ITEMS, {
        progressSummary: "Extracting visually priced items",
        lastError: null,
      });
    }
    const parsed = await parseFnbMenuVisually({
      eventId,
      sourceMenuId: sourceMenuId || "unpersisted-source-menu",
      fileName,
      pdfBytes: input.pdfBytes,
      objectKey: input.objectKey ?? undefined,
      model,
      openAiApiKey: apiKey,
    });
    const items = parsed.items;
    const rejectedCount = parsed.ledger.filter((entry) => entry.decision === "rejected").length;
    const needsReviewCount = parsed.ledger.filter((entry) => entry.decision === "needs_review").length;
    if (items.length === 0) {
      if (sourceMenuId) {
        await updateFnbSourceMenuStatus(eventId, sourceMenuId, EventFnbSourceMenuStatus.FAILED, {
          itemsFound: 0,
          progressSummary: "Parse failed",
          lastError: "Visual parser could not identify visually priced menu items.",
        });
      }
      console.info("[fnb-source-menu] visual parse completed with no saved items", {
        eventId,
        sourceMenuId,
        fileName,
        pagesParsed: parsed.usageSummary.pagesParsed,
        openAiCallCount: parsed.usageSummary.openAiCallCount,
        model: parsed.usageSummary.model,
        rejectedCount,
        needsReviewCount,
      });
      return NextResponse.json(
        { error: "Visual parser could not identify visually priced menu items.", ledger: parsed.ledger },
        { status: 422 },
      );
    }
    const savedItems = sourceMenuId
      ? await replaceFnbCatalogItemsForSourceMenu(eventId, {
        sourceMenuId,
        sourceMenuFileName: fileName,
        items,
      })
      : [];
    const savedItemCount = sourceMenuId ? savedItems.length : items.length;
    if (sourceMenuId) {
      await updateFnbSourceMenuStatus(eventId, sourceMenuId, EventFnbSourceMenuStatus.COMPLETE, {
        itemsFound: savedItemCount,
        progressSummary: `${savedItemCount} visually parsed item${savedItemCount === 1 ? "" : "s"} saved`,
        lastError: null,
      });
    }
    console.info("[fnb-source-menu] parse success", {
      eventId,
      sourceMenuId,
      fileName,
      itemCount: items.length,
      savedItemCount,
      pagesParsed: parsed.usageSummary.pagesParsed,
      openAiCallCount: parsed.usageSummary.openAiCallCount,
      model: parsed.usageSummary.model,
      rejectedCount,
      needsReviewCount,
    });
    return NextResponse.json({
      items,
      savedItemCount,
      ledger: parsed.ledger,
      usageSummary: parsed.usageSummary,
    });
  } catch (error) {
    const isProviderFailure = error instanceof Error && (
      error.message.startsWith("Visual menu OpenAI call failed")
      || error.message === "Visual menu OpenAI call returned no JSON content"
    );
    const safeError = isProviderFailure
      ? "Menu parsing service is temporarily unavailable. Please try again."
      : "Menu parsing failed. Please try again.";
    if (sourceMenuId) {
      await updateFnbSourceMenuStatus(eventId, sourceMenuId, EventFnbSourceMenuStatus.FAILED, {
        progressSummary: "Parse failed",
        lastError: safeError,
      });
      console.info("[fnb-source-menu] parse failure", {
        eventId,
        sourceMenuId,
        fileName,
        error: toErrorMessage(error),
      });
    }
    if (isProviderFailure) {
      return NextResponse.json({ error: safeError }, { status: 502 });
    }
    observeHandledRouteError(error);
    console.error("POST /api/events/:eventId/fnb-catalog/parse-menu failed", error);
    return NextResponse.json({ error: safeError }, { status: 500 });
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/fnb-catalog/parse-menu", postHandler);
