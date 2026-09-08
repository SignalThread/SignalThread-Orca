import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { canMutateExhibitorLeadsInContext } from "@/lib/server/exhibitor-permission-aggregates";
import { deleteExhibitorLeadsBulkForCompany } from "@/lib/server/exhibitorLeadDelete";
import { assertEventIdAccessibleForUser } from "@/lib/server/company-event-access";

export async function POST(request: Request) {
  try {
    const sessionUser = await resolveApiSession(request);
    const role = String(sessionUser.role ?? "").trim().toLowerCase();
    const userId = String(sessionUser.userId ?? "").trim();
    const accountId = String(sessionUser.companyId ?? "").trim();
    if (!userId || !accountId) {
      return NextResponse.json(
        { outcome: "error" as const, message: "Missing exhibitor scope.", error: "Missing exhibitor scope." },
        { status: 400 }
      );
    }
    const isBearer = /^Bearer\s/i.test(request.headers.get("authorization") ?? "");
    const body = (await request.json().catch(() => null)) as { leadIds?: string[]; eventId?: string } | null;
    const leadIds = body?.leadIds;
    const eventId = String(body?.eventId ?? "").trim();

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json(
        { outcome: "error" as const, message: "leadIds must be a non-empty array.", error: "leadIds must be a non-empty array." },
        { status: 400 }
      );
    }

    if (!eventId) return NextResponse.json({ outcome: "error" as const, error: "Missing event scope." }, { status: 400 });

    if (role === "exhibitor_viewer" || role === "viewer") {
      return NextResponse.json({ outcome: "forbidden" as const, error: "Forbidden" }, { status: 403 });
    }

    if (
      !(await canMutateExhibitorLeadsInContext({
        userId,
        companyId: accountId,
        role,
        isBearer,
        denyExhibitorViewer: true,
        activePlatformAdminCompanyId: sessionUser.activeCompanyId
      }))
    ) {
      return NextResponse.json({ outcome: "forbidden" as const, error: "Forbidden" }, { status: 403 });
    }

    await assertEventIdAccessibleForUser(userId, eventId);

    const result = await deleteExhibitorLeadsBulkForCompany({ leadIds, companyId: accountId, eventId });

    if (result.outcome === "error") {
      const isClient = /no valid lead ids/i.test(result.message);
      return NextResponse.json(
        {
          outcome: "error" as const,
          message: result.message,
          error: result.message,
          requested: result.requested ?? leadIds.length,
          deleted: result.deleted ?? [],
          deletedCount: result.deleted?.length ?? 0,
          failed: result.failed ?? [],
          failedCount: result.failed?.length ?? 0
        },
        { status: isClient ? 400 : 500 }
      );
    }

    return NextResponse.json({
      outcome: "completed" as const,
      deleted: result.deleted,
      missing: result.missing,
      forbidden: result.forbidden,
      requested: [...new Set(leadIds.map((id) => String(id).trim()).filter(Boolean))].length,
      deletedCount: result.deleted.length,
      failedCount: result.missing.length + result.forbidden.length,
      /** @deprecated use `deleted.length` */
      count: result.deleted.length
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ outcome: "error" as const, message, error: message }, { status: 500 });
  }
}
