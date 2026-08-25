import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { getMatrix2Snapshot, Matrix2Error, type Matrix2Snapshot, type Matrix2SnapshotDiagnostics } from "@/lib/matrix2";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { getRequestContext, setRequestUserId } from "@/lib/observability/request-context";
import { resolveRequestUser } from "@/lib/request-user";
import { SessionRequirementError } from "@/lib/session-requirements";
import { shouldQuietE2ERoutineLogs } from "@/lib/logging/log-policy";

export const runtime = "nodejs";

type SnapshotLoadResult = {
  snapshot: Matrix2Snapshot;
  diagnostics: Matrix2SnapshotDiagnostics | null;
};

const SNAPSHOT_LOAD_TIMEOUT_MS = 15_000;
const inflightSnapshotRequests = new Map<string, Promise<SnapshotLoadResult>>();

function boundSnapshotLoad(work: Promise<SnapshotLoadResult>): Promise<SnapshotLoadResult> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new Matrix2Error("Run of Show is taking too long to load. Please retry.", 504)),
      SNAPSHOT_LOAD_TIMEOUT_MS,
    );

    void work.then(resolve, reject).finally(() => clearTimeout(timeoutId));
  });
}

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof Matrix2Error) {
    return NextResponse.json({
      error: error.message,
      code: "MATRIX2_SNAPSHOT_ERROR",
      context,
    }, { status: error.status });
  }

  if (error instanceof SessionRequirementError) {
    return NextResponse.json({
      error: error.message,
      code: "MATRIX2_SNAPSHOT_ERROR",
      context,
    }, { status: error.status });
  }

  if (error instanceof EventAccessError) {
    return NextResponse.json({
      error: error.message,
      reason: error.reason,
      code: "EVENT_ACCESS_DENIED",
      context,
    }, { status: error.status });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(`${context} prisma failure`, {
      code: error.code,
      message: error.message,
      meta: error.meta,
    });

    return NextResponse.json({
      error: "Failed to load Matrix 2 snapshot",
      message: error.message,
      code: error.code,
      context,
    }, { status: 500 });
  }

  if (error instanceof Error) {
    console.error(`${context} failed`, {
      message: error.message,
      stack: error.stack,
    });

    return NextResponse.json({
      error: "Failed to load Matrix 2 snapshot",
      message: error.message,
      code: "MATRIX2_SNAPSHOT_ERROR",
      context,
    }, { status: 500 });
  }

  console.error(`${context} failed`, error);
  return NextResponse.json({
    error: "Failed to load Matrix 2 snapshot",
    message: "Internal server error",
    code: "MATRIX2_SNAPSHOT_ERROR",
    context,
  }, { status: 500 });
}

async function getMatrix2SnapshotRoute(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const requestId = getRequestContext()?.requestId ?? null;
  const startedAt = Date.now();
  const requestUrl = new URL(request.url);
  const querySource = requestUrl.searchParams.get("source")?.trim() ?? "";
  const headerSource = request.headers.get("x-matrix-source")?.trim() ?? "";
  const source = querySource || headerSource || "unknown";
  const referer = request.headers.get("referer") ?? "";
  const fromEventMatrixRoute = /\/events\/[^/]+\/matrix(?:\/|$|\?)/.test(referer);

  const inflightKey = `event:${eventId}`;
  const existingLoad = inflightSnapshotRequests.get(inflightKey);
  const coalesced = Boolean(existingLoad);
  let createdSnapshotPromise: Promise<SnapshotLoadResult> | null = null;

  if (!shouldQuietE2ERoutineLogs()) {
    console.info("matrix2.snapshot.request.started", {
      requestId,
      eventId,
      source,
      referer,
      fromEventMatrixRoute,
      pageRenderAlsoFetchedSnapshot: false,
      coalescedWithInflightRequest: coalesced,
    });
  }

  try {
    const currentUserResult = await resolveRequestUser(request as NextRequest);
    if ("error" in currentUserResult) {
      return NextResponse.json({
        error: currentUserResult.error.status === 403 ? "Forbidden" : "Unauthorized",
        reason: currentUserResult.error.reason,
        hint: currentUserResult.error.hint,
      }, { status: currentUserResult.error.status });
    }
    setRequestUserId(currentUserResult.user.id);
    await assertEventAccessForUser(eventId, currentUserResult.user, "read");

    const snapshotPromise = existingLoad ?? boundSnapshotLoad((async () => {
      let diagnostics: Matrix2SnapshotDiagnostics | null = null;
      const snapshot = await getMatrix2Snapshot(eventId, {
        onDiagnostics(nextDiagnostics) {
          diagnostics = nextDiagnostics;
        },
      });
      return { snapshot, diagnostics };
    })());

    if (!existingLoad) {
      createdSnapshotPromise = snapshotPromise;
      inflightSnapshotRequests.set(inflightKey, snapshotPromise);
    }

    const { snapshot, diagnostics } = await snapshotPromise;

    if (!shouldQuietE2ERoutineLogs()) {
      console.info("matrix2.snapshot.request.completed", {
        requestId,
        eventId,
        source,
        durationMs: Date.now() - startedAt,
        queryGroups: diagnostics?.queryGroups ?? null,
        trackedPrismaCalls: diagnostics?.trackedPrismaCalls ?? null,
        sectionDurationsMs: diagnostics?.sectionDurationsMs ?? null,
        rowCount: diagnostics?.rowCount ?? snapshot.sessions.length,
        roomCount: diagnostics?.roomCount ?? snapshot.rooms.length,
        peopleCount: diagnostics?.peopleCount ?? snapshot.people.length,
        usedTransaction: diagnostics?.usedTransaction ?? null,
        fromEventMatrixRoute,
        pageRenderAlsoFetchedSnapshot: false,
        coalescedWithInflightRequest: coalesced,
      });
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("matrix2.snapshot.request.failed", {
      requestId,
      eventId,
      source,
      durationMs: Date.now() - startedAt,
      fromEventMatrixRoute,
      pageRenderAlsoFetchedSnapshot: false,
      coalescedWithInflightRequest: coalesced,
      error: error instanceof Error ? error.message : error,
    });
    return toErrorResponse(error, "GET /api/events/:eventId/matrix-2");
  } finally {
    if (createdSnapshotPromise && inflightSnapshotRequests.get(inflightKey) === createdSnapshotPromise) {
      inflightSnapshotRequests.delete(inflightKey);
    }
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/matrix-2", getMatrix2SnapshotRoute);
