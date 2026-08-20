import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/request-user";
import { assertEventAccessForUser } from "@/lib/event-access";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { createImportSummary, exceedsImportRowLimit, importRowLimitError } from "@/lib/import";
import {
  validateTimelineImportRows,
  type TimelineImportDraftRow,
} from "@/lib/timeline-import";
import { importTimelineItems, TimelineServiceError } from "@/src/server/services/timeline";
import { listEventAssignableUsers } from "@/src/server/services/event-assignable-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toAuthErrorResponse(status: number, reason: string, hint: string): NextResponse {
  return NextResponse.json(
    { message: status === 403 ? "Forbidden" : "Unauthorized", reason, hint },
    { status },
  );
}

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof TimelineServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

function coerceDraftRows(rows: unknown): TimelineImportDraftRow[] {
  if (!Array.isArray(rows)) {
    throw new TimelineServiceError("rows must be an array", 400);
  }

  return rows.map((row, index) => {
    if (typeof row !== "object" || row === null) {
      throw new TimelineServiceError(`Row ${index + 1} is invalid`, 400);
    }
    const item = row as Record<string, unknown>;
    return {
      Item: String(item.Item ?? item.Task ?? ""),
      Workstream: String(item.Workstream ?? ""),
      "Planning Stage": String(item["Planning Stage"] ?? item.Stage ?? ""),
      Status: String(item.Status ?? ""),
      Priority: String(item.Priority ?? ""),
      "Start Date": String(item["Start Date"] ?? ""),
      "End Date": String(item["End Date"] ?? item["Due Date"] ?? ""),
      "Critical Path": String(item["Critical Path"] ?? item.CP ?? ""),
      Owner: String(item.Owner ?? item["Responsible Party"] ?? item.Assignee ?? ""),
      Notes: String(item.Notes ?? item.Note ?? item.Remarks ?? item.Comments ?? ""),
    };
  });
}

function coerceRowNumbers(value: unknown, expectedLength: number): number[] | undefined {
  if (typeof value === "undefined" || value === null) return undefined;
  if (!Array.isArray(value) || value.length !== expectedLength) {
    throw new TimelineServiceError("rowNumbers must be an array aligned to rows", 400);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw new TimelineServiceError(`rowNumbers[${index}] is invalid`, 400);
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    // Owner matching reads event-scoped people before the import service writes.
    await assertEventAccessForUser(eventId, authResult.user, "write");
    const draftRows = coerceDraftRows(body.rows);
    if (exceedsImportRowLimit(draftRows.length)) {
      return NextResponse.json(importRowLimitError(draftRows.length), { status: 413 });
    }
    const rowNumbers = coerceRowNumbers(body.rowNumbers, draftRows.length);
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";

    // Re-validate every row server-side. The client mapping is advisory only:
    // dates are re-parsed and statuses re-checked so a tampered payload cannot
    // bypass the rules.
    const ownerOptions = await listEventAssignableUsers(eventId);
    const validation = validateTimelineImportRows(draftRows, { rowNumbers, ownerOptions });

    if (validation.validCount === 0) {
      return NextResponse.json(
        {
          error: "No valid rows to import",
          details: {
            validCount: validation.validCount,
            invalidCount: validation.invalidCount,
            blankCount: validation.blankCount,
          },
        },
        { status: 400 },
      );
    }

    // Partial success: import the valid rows and skip invalid/blank ones. The
    // service asserts write access (EVENT_VIEWER -> 403) before any insert.
    const result = await importTimelineItems(
      eventId,
      authResult.user,
      validation.validRows.map((row) => ({
        title: row.title,
        startDateIso: row.startDateIso,
        endDateIso: row.endDateIso,
        status: row.status,
        priority: row.priority,
        workstream: row.workstream,
        planningStage: row.planningStage,
        ownerUserId: row.ownerUserId,
        isCriticalPath: row.isCriticalPath,
        notes: row.notes,
      })),
      idempotencyKey,
    );

    const summary = createImportSummary();
    summary.imported = result.importedCount;
    const missingAssignmentsCount = validation.rows.filter(
      (row) => row.isValid && row.warnings.length > 0,
    ).length;
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
        missingAssignmentsCount,
        duplicateCount: result.duplicateCount,
        replayed: result.replayed,
        summary,
      },
      { status: 201 },
    );
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/timeline-items/import");
  }
}

export const POST = withApiRequestLogging(
  "POST /api/events/:eventId/timeline-items/import",
  postHandler,
);
