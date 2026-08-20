import { NextRequest, NextResponse } from "next/server";
import { type BudgetLineItemStatus } from "@prisma/client";
import { type BudgetImportDraftRow, validateBudgetImportRows } from "@/lib/budget-import";
import { createImportSummary, exceedsImportRowLimit, importRowLimitError } from "@/lib/import";
import { BudgetServiceError, importLineItems } from "@/src/server/services/budget";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { requireBudgetRouteAccess } from "../_lib/route-auth";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof BudgetServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

function coerceDraftRows(rows: unknown): BudgetImportDraftRow[] {
  if (!Array.isArray(rows)) {
    throw new BudgetServiceError("rows must be an array", 400);
  }

  return rows.map((row, index) => {
    if (typeof row !== "object" || row === null) {
      throw new BudgetServiceError(`Row ${index + 1} is invalid`, 400);
    }

    const item = row as Record<string, unknown>;
    return {
      Category: String(item.Category ?? ""),
      Session: String(item.Session ?? ""),
      Group: String(item.Group ?? ""),
      Subcategory: String(item.Subcategory ?? ""),
      "Line Item": String(item["Line Item"] ?? ""),
      Vendor: String(item.Vendor ?? ""),
      Forecast: String(item.Forecast ?? ""),
      Actual: String(item.Actual ?? ""),
      Status: String(item.Status ?? ""),
      Notes: String(item.Notes ?? ""),
    };
  });
}

function coerceRowNumbers(value: unknown, expectedLength: number): number[] | undefined {
  if (typeof value === "undefined" || value === null) return undefined;
  if (!Array.isArray(value) || value.length !== expectedLength) {
    throw new BudgetServiceError("rowNumbers must be an array aligned to rows", 400);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw new BudgetServiceError(`rowNumbers[${index}] is invalid`, 400);
    }
    return entry;
  });
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  const auth = await requireBudgetRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;

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

    // Re-validate every row server-side. The client mapping is advisory only:
    // forecast/actual are re-parsed to cents and Line Item remains required, so
    // a tampered client payload cannot bypass the canonical identity rule.
    const validation = validateBudgetImportRows(draftRows, { rowNumbers });

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

    // Partial success: import the valid rows and skip invalid/blank ones rather
    // than rejecting the whole batch. This is safe because importLineItems only
    // ever receives already-validated rows, so its create transaction cannot
    // throw mid-flight on a bad row.
    const imported = await importLineItems(
      eventId,
      validation.validRows.map((row) => ({
        category: row.category,
        subcategory: row.subcategory,
        session: row.session,
        group: row.group,
        lineItem: row.lineItem,
        vendor: row.vendor,
        forecastCents: row.forecastCents,
        actualCents: row.actualCents,
        status: row.status as BudgetLineItemStatus | undefined,
      })),
      { actorUserId: auth.user.id, user: auth.user },
    );

    const summary = createImportSummary();
    summary.imported = imported.length;
    summary.skipped = validation.invalidCount + validation.blankCount;
    summary.errors = validation.rows
      .filter((row) => !row.isBlank && !row.isValid)
      .map((row) => ({ row: row.rowNumber, message: row.errors.join(" ") }));

    return NextResponse.json(
      {
        importedCount: imported.length,
        validCount: validation.validCount,
        invalidCount: validation.invalidCount,
        blankCount: validation.blankCount,
        summary,
      },
      { status: 201 },
    );
  } catch (error) {
    return toErrorResponse(error, "POST /api/events/:eventId/budget/import");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/budget/import", postHandler);
