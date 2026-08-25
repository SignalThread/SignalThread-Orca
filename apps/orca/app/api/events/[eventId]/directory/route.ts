import { NextRequest, NextResponse } from "next/server";
import type { EventDirectoryPerson, EventDirectoryRoleType, EventDirectorySourceType } from "@prisma/client";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  getEventDirectorySummary,
  listEventDirectoryPeople,
} from "@/src/server/services/event-directory";
import { aggregateEventDirectoryForEvent } from "@/src/server/services/event-directory-backfill";
import { resolveDirectoryUser, toDirectoryErrorResponse } from "./_lib/route-helpers";

export const runtime = "nodejs";

async function getHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const auth = await resolveDirectoryUser(request);
  if ("response" in auth) return auth.response;

  const sp = request.nextUrl.searchParams;
  const limitParam = Number(sp.get("limit"));
  try {
    const [list, summary] = await Promise.all([
      listEventDirectoryPeople({
        eventId,
        user: auth.user,
        filters: {
          search: sp.get("search"),
          role: (sp.get("role") as EventDirectoryRoleType | null) || null,
          sourceType: (sp.get("sourceType") as EventDirectorySourceType | null) || null,
          sourceId: sp.get("sourceId"),
          status: (sp.get("status") as EventDirectoryPerson["status"] | null) || null,
          limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
          cursor: sp.get("cursor"),
        },
      }),
      getEventDirectorySummary({ eventId, user: auth.user }),
    ]);
    return NextResponse.json({ people: list.people, nextCursor: list.nextCursor, summary });
  } catch (error) {
    return toDirectoryErrorResponse(error, "GET /api/events/:eventId/directory");
  }
}

export const GET = withApiRequestLogging("GET /api/events/:eventId/directory", getHandler);

type DirectoryPostDependencies = {
  resolveUser: typeof resolveDirectoryUser;
  aggregate: typeof aggregateEventDirectoryForEvent;
};

export function createDirectoryPostHandler(overrides: Partial<DirectoryPostDependencies> = {}) {
  const deps: DirectoryPostDependencies = {
    resolveUser: overrides.resolveUser ?? resolveDirectoryUser,
    aggregate: overrides.aggregate ?? aggregateEventDirectoryForEvent,
  };
  return async function postHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
    const { eventId } = await params;
    const auth = await deps.resolveUser(request);
    if ("response" in auth) return auth.response;

    try {
      const result = await deps.aggregate({ eventId, user: auth.user });
      return NextResponse.json(result);
    } catch (error) {
      return toDirectoryErrorResponse(error, "POST /api/events/:eventId/directory");
    }
  };
}

const postHandler = createDirectoryPostHandler();
export const POST = withApiRequestLogging("POST /api/events/:eventId/directory", postHandler);
