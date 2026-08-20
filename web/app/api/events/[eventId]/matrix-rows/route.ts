import { NextRequest, NextResponse } from "next/server";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { createMatrixRow, listMatrixRows, MatrixError } from "@/lib/matrix";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";

export const runtime = "nodejs";

function toAuthErrorResponse(status: number, reason: string, hint: string): NextResponse {
  return NextResponse.json(
    { error: status === 403 ? "Forbidden" : "Unauthorized", reason, hint },
    { status },
  );
}

type ErrorLike = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
  meta?: unknown;
};

function errorPayload(message: string, details?: string | null, hint?: string | null, code?: string | null) {
  return {
    message,
    error: message,
    details: details ?? null,
    hint: hint ?? null,
    code: code ?? null,
  };
}

function normalizeError(error: unknown): {
  message: string;
  details: string | null;
  hint: string | null;
  code: string | null;
} {
  const fallback = "Internal server error";
  const candidate = (error ?? {}) as ErrorLike;

  const message =
    typeof candidate.message === "string" && candidate.message.trim()
      ? candidate.message
      : fallback;
  const details =
    typeof candidate.details === "string"
      ? candidate.details
      : typeof candidate.meta === "string"
        ? candidate.meta
        : candidate.meta
          ? JSON.stringify(candidate.meta)
          : null;
  const hint = typeof candidate.hint === "string" ? candidate.hint : null;
  const code = typeof candidate.code === "string" ? candidate.code : null;

  return { message, details, hint, code };
}

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof EventAccessError) {
    return NextResponse.json(errorPayload(error.message, null, null, error.reason), { status: error.status });
  }

  if (error instanceof MatrixError) {
    return NextResponse.json(errorPayload(error.message), { status: error.status });
  }

  const normalized = normalizeError(error);
  console.error(`${context} failed:`, normalized);
  return NextResponse.json(
    errorPayload(normalized.message, normalized.details, normalized.hint, normalized.code),
    { status: 500 },
  );
}

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const date = request.nextUrl.searchParams.get("date");

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
    const payload = await listMatrixRows(eventId, { date });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "GET /api/events/:eventId/matrix-rows");
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
    return toErrorResponse(error, "POST /api/events/:eventId/matrix-rows");
  }

  let body: Record<string, unknown> = {};
  try {
    const rawBody = await request.text();
    if (rawBody.trim()) {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    }
  } catch {
    return NextResponse.json(errorPayload("Invalid JSON body", null, null, "BAD_REQUEST"), { status: 400 });
  }

  console.info("POST /api/events/:eventId/matrix-rows payload", { eventId, body });

  const missingFields = ["date", "startTime", "endTime"].filter((field) => {
    const value = body[field];
    return typeof value !== "string" || value.trim().length === 0;
  });
  if (missingFields.length > 0) {
    return NextResponse.json(
      errorPayload(`Missing required fields: ${missingFields.join(", ")}`, null, null, "BAD_REQUEST"),
      { status: 400 },
    );
  }

  try {
    const row = await createMatrixRow(eventId, body, { id: currentUserResult.user.id });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/matrix-rows");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/matrix-rows", getHandler);
export const POST = withApiRequestLogging("POST /api/events/:eventId/matrix-rows", postHandler);
