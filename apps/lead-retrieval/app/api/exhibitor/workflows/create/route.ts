import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserHasExhibitorWebAdminAccess } from "@/lib/server/exhibitor-permission-aggregates";
import {
  EventAccessDeniedError,
  assertEventIdAccessibleForUser
} from "@/lib/server/company-event-access";
import { getCachedExhibitorAccessibleEventResolution } from "@/lib/server/exhibitor-app-access";
import { resolveWorkflowAuthoringEventContext } from "@/lib/exhibitor/workflows/workflow-authoring-event-context";
import { normalizeEventContainerKind } from "@/lib/events/event-container-kind";
import {
  buildComposeParams,
  buildEnrichParams,
  buildWorkflowStepInsertRows,
  normalizeCreateWorkflowBody,
  parseCreateWorkflowInput,
  resolveWorkflowPinFromActiveEvent,
  validateCreateWorkflowInput,
  type WorkflowTemplateInsertRow
} from "@/lib/exhibitor/workflows/create-workflow-core";
import { persistWorkflowTemplateAndSteps } from "@/lib/exhibitor/workflows/create-workflow-persistence";
import { loadWorkflowBuilderEnrichmentBundle } from "@/lib/exhibitor/workflows/load-workflow-builder-enrichment";
import { providerFocusAreaIdsByAdapter } from "@/lib/exhibitor/workflows/enrichment-provider-capabilities";
import { validateWorkflowSignalIdsForEvent } from "@/lib/data/signals";
import { normalizeSessionRole, type SessionUser } from "@/lib/auth/session";

/**
 * Create workflow_templates + workflow_steps for the authenticated exhibitor company.
 *
 * Writes use the admin client because migration 0071 only grants authenticated SELECT
 * on workflow tables — inserts are server-enforced here (same pattern as other exhibitor
 * routes that delegate to admin after authorization).
 *
 * Does not execute workflows.
 */
export async function POST(request: Request) {
  try {
    const sessionUser = await resolveApiSession(request);
    const normalizedSessionUser: SessionUser = {
      id: sessionUser.userId,
      role: normalizeSessionRole(sessionUser.role),
      company_id: sessionUser.companyId || null,
      full_name: null,
      fullName: null,
      authenticated_company_id: sessionUser.authenticatedCompanyId || null,
      active_company_id: sessionUser.activeCompanyId,
      active_company_name: null
    };
    const role = String(sessionUser.role ?? "").trim().toLowerCase();
    const userId = String(sessionUser.userId ?? "").trim();
    const companyId = String(sessionUser.companyId ?? "").trim();

    if (!userId || !companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const platformAdminAccountContextActive =
      role === "platform_admin" && sessionUser.activeCompanyId === companyId;
    if (role !== "exhibitor_admin" && !platformAdminAccountContextActive) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const webOk =
      platformAdminAccountContextActive ||
      (await getUserHasExhibitorWebAdminAccess(userId, companyId));
    if (!webOk) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    const urlEventRaw = rawBody.event_id;
    const urlEventStr =
      typeof urlEventRaw === "string" ? urlEventRaw.trim() : urlEventRaw === null ? "" : "";
    const requestedWorkflowScope = rawBody.workflow_scope;

    const access = await getCachedExhibitorAccessibleEventResolution(userId);
    const eventContext =
      access.eventIds.length > 0
        ? await resolveWorkflowAuthoringEventContext({
            userId,
            urlEventId: urlEventStr.length > 0 ? urlEventStr : null,
            scope: requestedWorkflowScope
          })
        : { eventId: null, scopeMode: "event" as const };
    const activeEventId = eventContext.eventId;

    let containerKind: "event" | "continuous_capture" | null = null;
    const supabase = createAdminClient();

    if (activeEventId) {
      try {
        await assertEventIdAccessibleForUser(userId, activeEventId);
      } catch (err) {
        if (err instanceof EventAccessDeniedError) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        throw err;
      }

      const { data: evRow, error: evErr } = await (supabase as any)
        .from("events")
        .select("container_kind")
        .eq("id", activeEventId)
        .maybeSingle();

      if (evErr || !evRow) {
        return NextResponse.json({ error: "Could not resolve event." }, { status: 400 });
      }
      containerKind = normalizeEventContainerKind(evRow.container_kind);
    }

    const pin = resolveWorkflowPinFromActiveEvent({
      activeEventId,
      containerKind
    });

    if (input.composeCampaignDraft && input.orderedSignalIds.length > 0) {
      if (!pin.event_id) {
        return NextResponse.json(
          { error: "Campaign Agents can only be selected for an event-scoped workflow.", field: "selected_signal_ids" },
          { status: 400 }
        );
      }
      const signalValidation = await validateWorkflowSignalIdsForEvent(normalizedSessionUser, {
        eventId: pin.event_id,
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

    const templateRow: WorkflowTemplateInsertRow = {
      company_id: companyId,
      name: input.name,
      description: null,
      trigger_event: "lead_captured",
      scope: pin.scope,
      event_id: pin.event_id,
      is_enabled: input.isEnabled,
      version: 1,
      created_by: userId,
      trigger_conditions_jsonb: input.triggerConditionsJsonb ?? null
    };

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
    const persisted = await persistWorkflowTemplateAndSteps(supabase as any, {
      templateRow,
      stepBodies
    });

    if (!persisted.ok) {
      console.warn(`[exhibitor/workflows/create] ${persisted.stage} insert failed`, persisted.error);
      return NextResponse.json({ error: persisted.error }, { status: 500 });
    }

    return NextResponse.json({ template: { id: persisted.templateId } }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
