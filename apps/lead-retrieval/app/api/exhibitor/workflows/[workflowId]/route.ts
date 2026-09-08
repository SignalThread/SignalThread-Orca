import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserHasExhibitorWebAdminAccess } from "@/lib/server/exhibitor-permission-aggregates";
import {
  EventAccessDeniedError,
  assertEventIdAccessibleForUser
} from "@/lib/server/company-event-access";
import { deleteWorkflowTemplateForScope } from "@/lib/exhibitor/workflows/delete-workflow-template";
import { isLikelyWorkflowId } from "@/lib/exhibitor/workflows/load-workflow-detail";
import {
  buildComposeParams,
  buildEnrichParams,
  buildWorkflowStepInsertRows,
  normalizeCreateWorkflowBody,
  parseCreateWorkflowInput,
  validateCreateWorkflowInput
} from "@/lib/exhibitor/workflows/create-workflow-core";
import { replaceWorkflowTemplateConfigAndSteps } from "@/lib/exhibitor/workflows/create-workflow-persistence";
import { loadWorkflowBuilderEnrichmentBundle } from "@/lib/exhibitor/workflows/load-workflow-builder-enrichment";
import { providerFocusAreaIdsByAdapter } from "@/lib/exhibitor/workflows/enrichment-provider-capabilities";
import { validateWorkflowSignalIdsForEvent } from "@/lib/data/signals";
import { normalizeSessionRole, type SessionUser } from "@/lib/auth/session";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  try {
    const sessionUser = await resolveApiSession(request);
    const normalizedSessionUser: SessionUser = {
      id: sessionUser.userId,
      role: normalizeSessionRole(sessionUser.role),
      company_id: sessionUser.companyId || null,
      full_name: null,
      fullName: null
    };
    const role = String(sessionUser.role ?? "").trim().toLowerCase();
    const userId = String(sessionUser.userId ?? "").trim();
    const companyId = String(sessionUser.companyId ?? "").trim();
    const { workflowId: rawWorkflowId } = await params;
    const workflowId = String(rawWorkflowId ?? "").trim();

    const isPlatformAdmin = role === "platform_admin";

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

    const rawBody = normalizeCreateWorkflowBody(await request.json().catch(() => null));
    if (!rawBody) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const input = parseCreateWorkflowInput(rawBody);
    const enrichmentBundle = await loadWorkflowBuilderEnrichmentBundle(companyId);
    const focusAreaIdsByProvider = providerFocusAreaIdsByAdapter(enrichmentBundle.providers);
    const validationError = validateCreateWorkflowInput(input, focusAreaIdsByProvider);
    if (validationError) {
      return NextResponse.json(
        { error: validationError.message, field: validationError.field ?? null },
        { status: 400 }
      );
    }

    const supabase = createAdminClient() as any;
    const { data: existingTemplate, error: existingTemplateError } = (await supabase
      .from("workflow_templates")
      .select("id, event_id")
      .eq("id", workflowId)
      .eq("company_id", companyId)
      .maybeSingle()) as {
      data: { id: string; event_id: string | null } | null;
      error: { message: string; code?: string } | null;
    };

    if (existingTemplateError || !existingTemplate) {
      return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
    }

    if (input.composeCampaignDraft && input.orderedSignalIds.length > 0) {
      if (!existingTemplate.event_id) {
        return NextResponse.json(
          { error: "Campaign Agents can only be selected for an event-scoped workflow.", field: "selected_signal_ids" },
          { status: 400 }
        );
      }
      const signalValidation = await validateWorkflowSignalIdsForEvent(normalizedSessionUser, {
        eventId: existingTemplate.event_id,
        signalIds: input.orderedSignalIds
      });
      if (!signalValidation.ok) {
        return NextResponse.json(
          {
            error: "One or more selected Campaign Agents are not available for this workflow event.",
            field: "selected_signal_ids",
            missingSignalIds: signalValidation.missingSignalIds
          },
          { status: 400 }
        );
      }
    }

    const composeParams = buildComposeParams(input);
    const enrichParams = buildEnrichParams(input, focusAreaIdsByProvider);
    const stepBodies = buildWorkflowStepInsertRows({
      enrichLead: input.enrichLead,
      enrichParams,
      composeCampaignDraft: input.composeCampaignDraft,
      composeParams,
      crmPushEnabled: input.crmPushEnabled,
      crmProvider: input.crmProvider,
      crmOperation: input.crmOperation,
      crmContentOptions: input.crmContentOptions,
      crmSyncConfigMode: input.crmSyncConfigMode,
      crmSyncConfigOverride: input.crmSyncConfigOverride,
      signalsStageEnabled: input.signalsStageEnabled,
      terminalRequiresApproval: input.terminalRequiresApproval
    });

    const persisted = await replaceWorkflowTemplateConfigAndSteps(supabase as any, {
      workflowId,
      companyId,
      templatePatch: {
        name: input.name,
        is_enabled: input.isEnabled,
        trigger_conditions_jsonb: input.triggerConditionsJsonb ?? null
      },
      stepBodies
    });

    if (!persisted.ok) {
      const status = persisted.stage === "template_lookup" ? 404 : 500;
      console.warn(`[exhibitor/workflows/${workflowId}] ${persisted.stage} update failed`, persisted.error);
      return NextResponse.json({ error: persisted.error }, { status });
    }

    return NextResponse.json({ template: { id: persisted.templateId } }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
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

    const result = await deleteWorkflowTemplateForScope(createAdminClient() as any, {
      workflowId,
      companyId: companyId || null,
      eventIdForScope: eventIdForScope || null,
      isPlatformAdmin
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
