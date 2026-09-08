/**
 * Pure rule: which workflow templates fire for this lead capture?
 *
 * No I/O. Caller loads candidate templates from the DB (filtered by `company_id`,
 * `is_enabled = true`, `trigger_event = 'lead_captured'`) and passes them in here.
 *
 * Eligibility (matches §6 of the audit / architecture doc):
 *   1. `template.scope = 'any'`                          → fires regardless of container
 *   2. `template.scope = lead.containerKind`             → fires when the kinds match
 *   3. `template.event_id` (when set) must equal `lead.eventId`
 *
 * `lead.containerKind = null` means the lead has `event_id IS NULL`. Such leads are
 * treated as company-only and only match `'any'` or unpinned `'continuous_capture'`
 * templates. They never match `'event'`-scoped templates.
 */

import type { EventContainerKind } from "@/lib/events/event-container-kind";
import type { WorkflowScope, WorkflowTemplateRow } from "../contracts/workflow-types";

export type TriggerResolverLead = {
  eventId: string | null;
  containerKind: EventContainerKind | null;
};

export type TemplateEligibilitySkipReason =
  | "template_scope_mismatch"
  | "template_event_mismatch";

export function isTemplateEligibleForLead(
  template: Pick<WorkflowTemplateRow, "scope" | "event_id">,
  lead: TriggerResolverLead
): boolean {
  return templateEligibilitySkipReason(template, lead) === null;
}

export function filterEligibleTemplatesForLead<T extends Pick<WorkflowTemplateRow, "scope" | "event_id">>(
  templates: readonly T[],
  lead: TriggerResolverLead
): T[] {
  return templates.filter((t) => isTemplateEligibleForLead(t, lead));
}

export function templateEligibilitySkipReason(
  template: Pick<WorkflowTemplateRow, "scope" | "event_id">,
  lead: TriggerResolverLead
): TemplateEligibilitySkipReason | null {
  if (!matchesPin(template.event_id, lead.eventId)) return "template_event_mismatch";
  if (!matchesScope(template.scope, lead.containerKind)) return "template_scope_mismatch";
  return null;
}

export function matchesScope(scope: WorkflowScope, leadContainerKind: EventContainerKind | null): boolean {
  if (scope === "any") return true;
  if (leadContainerKind === null) {
    // Null-container leads are company-only: eligible for `continuous_capture` (unpinned)
    // but never for `event` (which always implies a finite event row).
    return scope === "continuous_capture";
  }
  return scope === leadContainerKind;
}

export function matchesPin(templateEventId: string | null, leadEventId: string | null): boolean {
  if (!templateEventId) return true;
  return templateEventId === leadEventId;
}
