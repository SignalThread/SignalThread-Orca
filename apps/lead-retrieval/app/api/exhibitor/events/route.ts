import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { normalizeSessionRole } from "@/lib/auth/session";
import { exhibitorAdminMayUseAppEventManagementRoutes } from "@/lib/exhibitor/exhibitor-event-management-access";
import { getCachedExhibitorAccessibleEventResolution } from "@/lib/server/exhibitor-app-access";
import { runCreateEventMutation } from "@/lib/server/events/create-event-mutation";

function splitLocation(location: string) {
  const value = location.trim();
  if (!value) {
    return { city: null as string | null, state: null as string | null };
  }
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return { city: null, state: null };
  }
  if (parts.length === 1) {
    return { city: parts[0], state: null };
  }
  const state = parts.pop() ?? null;
  const city = parts.join(", ");
  return { city: city || null, state: state || null };
}

/**
 * Exhibitor-admin: create an event owned by the authenticated exhibitor company.
 * Entitlement: company-scoped license via `runCreateEventMutation` (no UI).
 */
export async function POST(request: Request) {
  try {
    const apiSession = await resolveApiSession(request);
    const role = normalizeSessionRole(apiSession.role);
    const platformAdminAccountContextActive =
      role === "platform_admin" && apiSession.activeCompanyId === apiSession.companyId;
    if (role !== "exhibitor_admin" && !platformAdminAccountContextActive) {
      return NextResponse.json(
        { ok: false, code: "EVENT_CREATION_FORBIDDEN_ROLE", message: "Only exhibitor admins can use this endpoint." },
        { status: 403 }
      );
    }

    const companyId = String(apiSession.companyId ?? "").trim();
    if (!companyId) {
      return NextResponse.json(
        { ok: false, code: "EVENT_CREATION_MISSING_COMPANY", message: "Missing exhibitor company scope." },
        { status: 400 }
      );
    }

    const access = await getCachedExhibitorAccessibleEventResolution(apiSession.userId);
    if (
      !exhibitorAdminMayUseAppEventManagementRoutes({
        role: access.role,
        resolution: access.resolution
      })
    ) {
      return NextResponse.json(
        {
          ok: false,
          code: "EVENT_MANAGEMENT_FORBIDDEN_LICENSE",
          message: "Your license does not include company event management."
        },
        { status: 403 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { ok: false, code: "EVENT_CREATION_INVALID_PAYLOAD", message: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const name = String(body.name ?? "").trim();
    const startDate = String(body.startDate ?? body.start_date ?? "").trim();
    const endDate = String(body.endDate ?? body.end_date ?? "").trim();
    const location = String(body.location ?? "").trim();
    const timezone = String(body.timezone ?? "").trim();
    const statusRaw = String(body.status ?? "UPCOMING").trim().toUpperCase();

    if (!name || !startDate || !endDate || !timezone) {
      return NextResponse.json(
        { ok: false, code: "EVENT_CREATION_VALIDATION", message: "name, startDate, endDate, and timezone are required." },
        { status: 400 }
      );
    }

    if (!["ACTIVE", "UPCOMING", "COMPLETED"].includes(statusRaw)) {
      return NextResponse.json(
        { ok: false, code: "EVENT_CREATION_VALIDATION", message: "Invalid status." },
        { status: 400 }
      );
    }

    if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
      return NextResponse.json(
        { ok: false, code: "EVENT_CREATION_VALIDATION", message: "End date must be after start date." },
        { status: 400 }
      );
    }

    const { city, state } = splitLocation(location);

    const result = await runCreateEventMutation(
      {
        role,
        userId: apiSession.userId,
        companyId
      },
      {
        companyId,
        name,
        timezone,
        location: location || null,
        city,
        state,
        startDate,
        endDate,
        status: statusRaw as "ACTIVE" | "UPCOMING" | "COMPLETED"
      }
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: result.error.code,
          message: result.error.message,
          ...(result.error.reason != null ? { reason: result.error.reason } : {})
        },
        { status: result.status }
      );
    }

    return NextResponse.json(
      { ok: true, eventId: result.eventId },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ ok: false, code: "EVENT_CREATION_UNEXPECTED", message }, { status: 500 });
  }
}
