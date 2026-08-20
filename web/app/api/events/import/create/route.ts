import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/request-user";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import {
  createEventFromImportPlan,
  EventImportBuilderError,
} from "@/src/server/services/event-import-builder";
import type { EventImportCreateRequest } from "@/lib/event-import-types";
import { exceedsImportRowLimit, importRowLimitError } from "@/lib/import";

export const runtime = "nodejs";

function errorResponse(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, message, code }, { status });
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Coerce an untrusted body into a create plan shape. Field-level normalization
 * (dates, currency, status) already happened client-side via the canonical
 * validators; the service re-checks access, scope, and required fields. */
function coercePlan(body: Record<string, unknown>): EventImportCreateRequest {
  const eventBasics = (body.eventBasics ?? {}) as EventImportCreateRequest["eventBasics"];
  const sourceType = (body.sourceType as EventImportCreateRequest["sourceType"]) ?? "workbook";
  const approval = body.approval && typeof body.approval === "object" && !Array.isArray(body.approval)
    ? body.approval as EventImportCreateRequest["approval"]
    : { confirmed: false, reviewedAt: "", evidence: "FINAL_REVIEW" as const };
  return {
    eventBasics,
    sourceType,
    idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : "",
    approval,
    workbookMappings: asArray(body.workbookMappings),
    runOfShow: asArray(body.runOfShow),
    budget: asArray(body.budget),
    timeline: asArray(body.timeline),
    timelineDependencies: asArray(body.timelineDependencies),
  };
}

async function postHandler(request: NextRequest) {
  const currentUserResult = await resolveRequestUser(request);
  if ("error" in currentUserResult) {
    return errorResponse(
      `Unauthorized: ${currentUserResult.error.reason}`,
      currentUserResult.error.status,
      "UNAUTHORIZED",
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return errorResponse("Request body must be an object", 400, "INVALID_CREATE_PAYLOAD");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return errorResponse("Invalid JSON body", 400, "INVALID_JSON");
  }

  try {
    const plan = coercePlan(body);
    const importRowCount = plan.runOfShow.length
      + plan.budget.length
      + plan.timeline.length
      + plan.timelineDependencies.length;
    if (exceedsImportRowLimit(importRowCount)) {
      const payload = importRowLimitError(importRowCount);
      return errorResponse(payload.error, 413, payload.code);
    }

    const result = await createEventFromImportPlan(plan, {
      id: currentUserResult.user.id,
      orgId: currentUserResult.user.orgId,
      role: currentUserResult.user.role,
    }, { signal: request.signal });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    observeHandledRouteError(error);
    if (error instanceof EventImportBuilderError) {
      return errorResponse(error.message, error.status, error.code);
    }
    console.error("POST /api/events/import/create failed:", error);
    return errorResponse("Internal server error", 500, "INTERNAL_SERVER_ERROR");
  }
}

const postWithLogging = withApiRequestLogging("POST /api/events/import/create", postHandler);

export async function POST(request: NextRequest) {
  return postWithLogging(request, undefined);
}
