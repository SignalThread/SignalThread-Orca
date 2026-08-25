import { NextRequest, NextResponse } from "next/server";
import type { EventDirectorySourceType } from "@prisma/client";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import { createEventDirectoryPerson } from "@/src/server/services/event-directory";
import { readJsonBody, resolveDirectoryUser, toDirectoryErrorResponse } from "../_lib/route-helpers";

export const runtime = "nodejs";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

async function postHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const auth = await resolveDirectoryUser(request);
  if ("response" in auth) return auth.response;
  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const body = parsed.body;

  const sourceRaw = (body.source ?? null) as { type?: string; label?: string; provider?: string | null } | null;
  try {
    const result = await createEventDirectoryPerson({
      eventId,
      user: auth.user,
      input: {
        firstName: (body.firstName as string | null) ?? null,
        lastName: (body.lastName as string | null) ?? null,
        displayName: (body.displayName as string | null) ?? null,
        email: (body.email as string | null) ?? null,
        phone: (body.phone as string | null) ?? null,
        company: (body.company as string | null) ?? null,
        title: (body.title as string | null) ?? null,
      },
      roles: asStringArray(body.roles),
      source: sourceRaw?.label
        ? {
            type: (sourceRaw.type as EventDirectorySourceType) ?? "MANUAL",
            label: sourceRaw.label,
            provider: sourceRaw.provider ?? null,
          }
        : { type: "MANUAL", label: "Manually added" },
      allowDuplicate: body.allowDuplicate === true,
    });
    if (result.status === "possible_duplicate") {
      return NextResponse.json(result, { status: 409 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toDirectoryErrorResponse(error, "POST /api/events/:eventId/directory/people");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/directory/people", postHandler);
