import { NextRequest, NextResponse } from "next/server";
import type { EventActivityAction, EventActivityModule } from "@prisma/client";
import { EventActivityAction as ActionEnum, EventActivityModule as ModuleEnum } from "@prisma/client";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { EventAccessError } from "@/lib/event-access";
import { resolveRequestUser } from "@/lib/request-user";
import {
  listEventActivity,
  listEventActivityActors,
  EventActivityError,
} from "@/src/server/services/event-activity";

export const runtime = "nodejs";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a date/datetime query param into a UTC boundary. */
function parseDateBoundary(value: string | null, edge: "start" | "end"): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (DATE_ONLY.test(trimmed)) {
    const iso = edge === "start" ? `${trimmed}T00:00:00.000Z` : `${trimmed}T23:59:59.999Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseModule(value: string | null): EventActivityModule | null {
  if (!value) return null;
  return value in ModuleEnum ? (value as EventActivityModule) : null;
}

function parseAction(value: string | null): EventActivityAction | null {
  if (!value) return null;
  return value in ActionEnum ? (value as EventActivityAction) : null;
}

async function getHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const auth = await resolveRequestUser(request);
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error.status === 403 ? "Forbidden" : "Unauthorized", reason: auth.error.reason, hint: auth.error.hint },
      { status: auth.error.status },
    );
  }
  const user = { id: auth.user.id, orgId: auth.user.orgId, role: auth.user.role };

  const sp = request.nextUrl.searchParams;
  const limitParam = Number(sp.get("limit"));

  try {
    const [list, actorList] = await Promise.all([
      listEventActivity({
        eventId,
        user,
        filters: {
          from: parseDateBoundary(sp.get("from"), "start"),
          to: parseDateBoundary(sp.get("to"), "end"),
          // `user` remains accepted for old links, while the UI sends opaque
          // actor keys capable of representing people and non-user actors.
          actor: sp.get("actor"),
          actorUserId: sp.get("actor") ? null : sp.get("user"),
          module: parseModule(sp.get("module")),
          action: parseAction(sp.get("action")),
          search: sp.get("search"),
          limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
          cursor: sp.get("cursor"),
        },
      }),
      listEventActivityActors({ eventId, user }),
    ]);

    return NextResponse.json({
      entries: list.entries,
      nextCursor: list.nextCursor,
      actors: actorList.actors,
    });
  } catch (error) {
    observeHandledRouteError(error);
    if (error instanceof EventAccessError) {
      return NextResponse.json({ error: error.message, code: error.reason }, { status: error.status });
    }
    if (error instanceof EventActivityError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("GET /api/events/:eventId/activity failed:", error);
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL" }, { status: 500 });
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/activity", getHandler);

// No POST / PATCH / PUT / DELETE: the Activity feed is read-only by design.
