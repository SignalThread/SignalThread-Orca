import { NextRequest, NextResponse } from "next/server";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { createImportSummary, exceedsImportRowLimit, importRowLimitError } from "@/lib/import";
import { importMatrixRows, MatrixError } from "@/lib/matrix";
import {
  validateMatrixImportRows,
  MATRIX_IMPORT_FIELDS,
  type MatrixImportDraftRow,
} from "@/lib/matrix-import";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";

export const runtime = "nodejs";

function toAuthErrorResponse(status: number, reason: string, hint: string): NextResponse {
  return NextResponse.json(
    { error: status === 403 ? "Forbidden" : "Unauthorized", message: status === 403 ? "Forbidden" : "Unauthorized", reason, hint },
    { status },
  );
}

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof EventAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof MatrixError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

function coerceDraftRows(rows: unknown): MatrixImportDraftRow[] {
  if (!Array.isArray(rows)) {
    throw new MatrixError("rows must be an array", 400);
  }

  return rows.map((row, index) => {
    if (typeof row !== "object" || row === null) {
      throw new MatrixError(`Row ${index + 1} is invalid`, 400);
    }
    const item = row as Record<string, unknown>;
    const draft = {} as MatrixImportDraftRow;
    for (const field of MATRIX_IMPORT_FIELDS) {
      const value = item[field];
      draft[field] = typeof value === "string" ? value : value == null ? "" : String(value);
    }
    return draft;
  });
}

function coerceRowNumbers(value: unknown, expectedLength: number): number[] | undefined {
  if (typeof value === "undefined" || value === null) return undefined;
  if (!Array.isArray(value) || value.length !== expectedLength) {
    throw new MatrixError("rowNumbers must be an array aligned to rows", 400);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw new MatrixError(`rowNumbers[${index}] is invalid`, 400);
    }
    return entry;
  });
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return toAuthErrorResponse(authResult.error.status, authResult.error.reason, authResult.error.hint);
  }

  // Fail fast on read so an unauthorized caller never sees row-level detail;
  // the bulk service re-asserts write access before any insert.
  try {
    await assertEventAccessForUser(eventId, authResult.user, "write");
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/matrix-rows/import");
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const draftRows = coerceDraftRows(body.rows);
    if (exceedsImportRowLimit(draftRows.length)) {
      return NextResponse.json(importRowLimitError(draftRows.length), { status: 413 });
    }
    const rowNumbers = coerceRowNumbers(body.rowNumbers, draftRows.length);
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";

    // Re-validate every row server-side. The client mapping is advisory only:
    // dates/times are re-parsed and notes are re-composed so a tampered payload
    // cannot bypass the rules.
    const validation = validateMatrixImportRows(draftRows, { rowNumbers });

    if (validation.validCount === 0) {
      return NextResponse.json(
        {
          error: "No valid rows to import",
          details: {
            validCount: validation.validCount,
            invalidCount: validation.invalidCount,
            blankCount: validation.blankCount,
          },
          notices: validation.notices,
        },
        { status: 400 },
      );
    }

    // Partial success: import the valid rows and skip invalid/blank ones. The
    // service re-asserts write access (EVENT_VIEWER -> 403) before any insert.
    const result = await importMatrixRows(
      eventId,
      authResult.user,
      validation.validRows.map((row) => ({
        sessionName: row.sessionName,
        dayDateIso: row.dayDateIso,
        startTime: row.startTime,
        endTime: row.endTime,
        roomName: row.roomName,
        setupType: row.setupType,
        avNeeds: row.avNeeds,
        attendance: row.attendance,
        supplies: row.supplies,
        signage: row.signage,
        notes: row.notes,
      })),
      idempotencyKey,
    );

    const summary = createImportSummary();
    summary.imported = result.importedCount;
    summary.skipped = validation.invalidCount + validation.blankCount + result.duplicateCount;
    summary.errors = validation.rows
      .filter((row) => !row.isBlank && !row.isValid)
      .map((row) => ({ row: row.rowNumber, message: row.errors.join(" ") }));

    return NextResponse.json(
      {
        importedCount: result.importedCount,
        validCount: validation.validCount,
        invalidCount: validation.invalidCount,
        blankCount: validation.blankCount,
        duplicateCount: result.duplicateCount,
        replayed: result.replayed,
        notices: validation.notices,
        summary,
      },
      { status: 201 },
    );
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/matrix-rows/import");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/matrix-rows/import", postHandler);
