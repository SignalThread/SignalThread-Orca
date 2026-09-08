import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateExhibitorCompanyEventCreationEligibility } from "@/lib/server/exhibitor-company-event-creation-entitlement";
import { ensureEventScopedStarterSignals } from "@/lib/server/signals/event-scoped-signal-copies";
import {
  executeCreateEventMutation,
  type CreateEventMutationActor,
  type CreateEventMutationDeps,
  type CreateEventMutationPayload,
  type CreateEventMutationResult,
  createEventEntitlementReasonToError
} from "@/lib/events/create-event-mutation-core";
export type {
  CreateEventMutationActor,
  CreateEventMutationPayload,
  CreateEventMutationResult,
  CreateEventMutationError
} from "@/lib/events/create-event-mutation-core";

export { createEventEntitlementReasonToError };

export type RunCreateEventMutationOptions = {
  nowMs?: number;
  evaluateExhibitorEntitlement?: CreateEventMutationDeps["evaluateExhibitorEntitlement"];
  insertEvent?: CreateEventMutationDeps["insertEvent"];
  reconcileEventSignals?: CreateEventMutationDeps["reconcileEventSignals"];
};

async function defaultInsertEvent(payload: CreateEventMutationPayload): Promise<{
  eventId: string | null;
  errorMessage: string | null;
}> {
  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("events")
    .insert({
      company_id: payload.companyId,
      name: payload.name,
      timezone: payload.timezone,
      location: payload.location ?? null,
      city: payload.city,
      state: payload.state,
      start_date: payload.startDate ?? null,
      end_date: payload.endDate ?? null,
      status: payload.status,
      container_kind: payload.containerKind ?? "event"
    })
    .select("id")
    .maybeSingle();

  if (error) {
    return { eventId: null, errorMessage: error.message ?? "Failed to create event." };
  }
  const id = data?.id ? String(data.id) : null;
  return { eventId: id, errorMessage: id ? null : "Event insert returned no id." };
}

/**
 * Canonical server-side event create: entitlement (exhibitor_admin only) + single admin insert.
 * platform_admin and organizer_admin skip exhibitor license entitlement.
 */
export async function runCreateEventMutation(
  actor: CreateEventMutationActor,
  payload: CreateEventMutationPayload,
  options?: RunCreateEventMutationOptions
): Promise<CreateEventMutationResult> {
  const evaluateExhibitorEntitlement =
    options?.evaluateExhibitorEntitlement ?? evaluateExhibitorCompanyEventCreationEligibility;
  const insertEvent = options?.insertEvent ?? defaultInsertEvent;
  const reconcileEventSignals =
    options?.reconcileEventSignals ??
    (async (eventId, actor) => {
      try {
        await ensureEventScopedStarterSignals({
          eventId,
          createdBy: actor.userId
        });
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          errorMessage: error instanceof Error ? error.message : "Failed to create event signal copies."
        };
      }
    });

  return executeCreateEventMutation(actor, payload, {
    evaluateExhibitorEntitlement,
    insertEvent,
    reconcileEventSignals,
    nowMs: options?.nowMs
  });
}
