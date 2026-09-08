import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserHasExhibitorWebAdminAccess } from "@/lib/server/exhibitor-permission-aggregates";
import {
  EventAccessDeniedError,
  assertEventIdAccessibleForUser
} from "@/lib/server/company-event-access";
import { isLikelyWorkflowId } from "@/lib/exhibitor/workflows/load-workflow-detail";
import { updateWorkflowTemplateStatusForScope } from "@/lib/exhibitor/workflows/update-workflow-template-status";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  try {
    const sessionUser = await resolveApiSession(request);
    const role = String(sessionUser.role ?? "").trim().toLowerCase();
    const userId = String(sessionUser.userId ?? "").trim();
    const companyId = String(sessionUser.companyId ?? "").trim();
    const isPlatformAdmin = role === "platform_admin";
    const { workflowId: rawWorkflowId } = await params;
    const workflowId = String(rawWorkflowId ?? "").trim();

    if (!userId || (!companyId && !isPlatformAdmin)) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    if (role !== "exhibitor_admin" && !isPlatformAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const webOk =
      isPlatformAdmin ? true : await getUserHasExhibitorWebAdminAccess(userId, companyId);
    if (!webOk) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!isLikelyWorkflowId(workflowId)) {
      return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as { is_enabled?: unknown } | null;
    if (!body || typeof body.is_enabled !== "boolean") {
      return NextResponse.json({ error: "is_enabled boolean is required." }, { status: 400 });
    }

    const eventIdForScope = String(new URL(request.url).searchParams.get("eventId") ?? "").trim();
    if (eventIdForScope && !isPlatformAdmin) {
      try {
        await assertEventIdAccessibleForUser(userId, eventIdForScope);
      } catch (err) {
        if (err instanceof EventAccessDeniedError) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        throw err;
      }
    }

    const result = await updateWorkflowTemplateStatusForScope(createAdminClient() as any, {
      workflowId,
      companyId: companyId || null,
      eventIdForScope: eventIdForScope || null,
      isEnabled: body.is_enabled,
      isPlatformAdmin
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      workflow: {
        id: result.workflowId,
        is_enabled: result.isEnabled
      }
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
