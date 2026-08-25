import { NextRequest, NextResponse } from "next/server";
import { createDocumentDraft, DocumentServiceError, listDocumentsForEvent } from "@/src/server/services/documents";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { resolveRequestUser } from "@/lib/request-user";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { shouldQuietE2ERoutineLogs } from "@/lib/logging/log-policy";

export const runtime = "nodejs";

function toAuthErrorResponse(status: number, reason: string, hint: string): NextResponse {
  return NextResponse.json(
    { error: status === 403 ? "Forbidden" : "Unauthorized", reason, hint },
    { status },
  );
}

function toErrorResponse(error: unknown, context: string) {
  observeHandledRouteError(error);

  if (error instanceof EventAccessError) {
    return NextResponse.json({ error: error.message, reason: error.reason }, { status: error.status });
  }

  if (error instanceof DocumentServiceError) {
    console.warn(`${context} rejected`, {
      type: "DocumentServiceError",
      status: error.status,
      message: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed`, {
    type: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    code:
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : undefined,
  });
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

function parseTagIds(tagIdsParam: string | null): string[] {
  if (!tagIdsParam) return [];
  return tagIdsParam
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

// Default Docs Hub page size for bounded list loading (D2).
const DOCUMENTS_PAGE_SIZE = 50;

function parsePositiveInt(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const filters = {
    search: request.nextUrl.searchParams.get("search"),
    status: request.nextUrl.searchParams.get("status"),
    categoryId: request.nextUrl.searchParams.get("categoryId"),
    tagIds: parseTagIds(request.nextUrl.searchParams.get("tagIds")),
    budgetItemId: request.nextUrl.searchParams.get("budgetItemId"),
  };
  // D2: bounded Docs Hub list. Default a safe page size so first load never
  // streams every document; the client loads more via offset. Total/hasMore in
  // the response keep counts honest.
  const limit = parsePositiveInt(request.nextUrl.searchParams.get("limit")) ?? DOCUMENTS_PAGE_SIZE;
  const offset = parsePositiveInt(request.nextUrl.searchParams.get("offset")) ?? 0;
  if (!shouldQuietE2ERoutineLogs()) {
    console.info("GET /api/events/:eventId/documents", {
      eventId,
      filters,
    });
  }

  const currentUserResult = await resolveRequestUser(request);
  if ("error" in currentUserResult) {
    return toAuthErrorResponse(
      currentUserResult.error.status,
      currentUserResult.error.reason,
      currentUserResult.error.hint,
    );
  }

  try {
    await assertEventAccessForUser(eventId, currentUserResult.user, "read");
    const payload = await listDocumentsForEvent(eventId, filters, { limit, offset });
    if (!shouldQuietE2ERoutineLogs()) {
      console.info("GET /api/events/:eventId/documents -> 200", {
        eventId,
        count: payload.documents.length,
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/documents");
  }
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  const currentUserResult = await resolveRequestUser(request);
  if ("error" in currentUserResult) {
    return toAuthErrorResponse(
      currentUserResult.error.status,
      currentUserResult.error.reason,
      currentUserResult.error.hint,
    );
  }

  try {
    await assertEventAccessForUser(eventId, currentUserResult.user, "write");
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/documents");
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const document = await createDocumentDraft(eventId, body, { id: currentUserResult.user.id });
    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/documents");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/documents", getHandler);
export const POST = withApiRequestLogging("POST /api/events/:eventId/documents", postHandler);
