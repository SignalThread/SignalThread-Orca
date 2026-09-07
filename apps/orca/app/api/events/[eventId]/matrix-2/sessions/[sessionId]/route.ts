import { NextRequest, NextResponse } from "next/server";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { Matrix2Error } from "@/lib/matrix2";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { Matrix2SessionUpdateInput, updateMatrix2Session } from "@/lib/matrix2-session";
import { resolveRequestUser } from "@/lib/request-user";

export const runtime = "nodejs";

const ALLOWED_UPDATE_FIELDS = new Set<keyof Matrix2SessionUpdateInput>([
  "title",
  "includeInOfficialAgenda",
  "sessionType",
  "status",
  "roomId",
  "startTime",
  "endTime",
  "expectedAttendance",
  "expectedAttendanceSource",
  "roomSetupType",
  "speakers",
  "avRequirements",
  "foodService",
  "foodAndBeverage",
  "staffAssignments",
  "requirementSelections",
  "notes",
]);

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof Matrix2Error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof EventAccessError) {
    return NextResponse.json({ error: error.message, reason: error.reason }, { status: error.status });
  }

  console.error(`${context} failed`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function updateMatrix2SessionRoute(
  request: Request,
  { params }: { params: Promise<{ eventId: string; sessionId: string }> },
) {
  const nextRequest = request as NextRequest;
  const { eventId, sessionId } = await params;

  const currentUserResult = await resolveRequestUser(nextRequest);
  if ("error" in currentUserResult) {
    return NextResponse.json(
      {
        error: currentUserResult.error.status === 403 ? "Forbidden" : "Unauthorized",
        reason: currentUserResult.error.reason,
        hint: currentUserResult.error.hint,
      },
      { status: currentUserResult.error.status },
    );
  }

  try {
    await assertEventAccessForUser(eventId, currentUserResult.user, "write");
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/events/:eventId/matrix-2/sessions/:sessionId");
  }

  let body: Matrix2SessionUpdateInput;
  try {
    body = (await nextRequest.json()) as Matrix2SessionUpdateInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "JSON body must be an object" }, { status: 400 });
  }

  const suppliedFields = Object.keys(body);
  if (suppliedFields.length === 0) {
    return NextResponse.json({ error: "At least one session field is required" }, { status: 400 });
  }

  const unknownFields = suppliedFields.filter(
    (field): field is keyof Matrix2SessionUpdateInput => !ALLOWED_UPDATE_FIELDS.has(field as keyof Matrix2SessionUpdateInput),
  );
  if (unknownFields.length > 0) {
    return NextResponse.json({ error: `Unknown fields: ${unknownFields.join(", ")}` }, { status: 400 });
  }

  try {
    const updated = await updateMatrix2Session(eventId, sessionId, body);
    return NextResponse.json(updated);
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/events/:eventId/matrix-2/sessions/:sessionId");
  }
}

export const PATCH = withApiRequestLogging(
  "PATCH /api/events/:eventId/matrix-2/sessions/:sessionId",
  updateMatrix2SessionRoute,
);
