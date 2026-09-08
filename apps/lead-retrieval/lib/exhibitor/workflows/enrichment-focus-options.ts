/**
 * Authoring-only enrichment categories for the workflow builder.
 * Persisted on `workflow_steps.params_jsonb` for the enrich step under `focusAreas`.
 * Runtime enrichment resolution is unchanged — this documents operator intent for UI / audits.
 *
 * Category ids mirror the ZoomInfo integration settings model so workflow authoring can
 * reuse the same coarse capability buckets across providers.
 */

import { ZOOMINFO_ENRICHMENT_DOMAIN_OPTIONS } from "@/lib/integrations/zoominfo/enrichment-domain-settings";
import type { WorkflowBuilderEnrichmentCategoryId } from "./workflow-builder-enrichment-types";

export type WorkflowEnrichmentFocusArea = {
  id: WorkflowBuilderEnrichmentCategoryId;
  label: string;
  hint: string;
};

export const WORKFLOW_ENRICHMENT_FOCUS_AREAS: readonly WorkflowEnrichmentFocusArea[] = [
  ...ZOOMINFO_ENRICHMENT_DOMAIN_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
    hint: option.description
  }))
];

export const WORKFLOW_ENRICHMENT_FOCUS_AREA_IDS: readonly string[] = WORKFLOW_ENRICHMENT_FOCUS_AREAS.map((a) => a.id);

const ALLOWED = new Set(WORKFLOW_ENRICHMENT_FOCUS_AREA_IDS);

export function parseEnrichmentFocusAreaIdsFromBody(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const t = typeof entry === "string" ? entry.trim() : "";
    if (!t || !ALLOWED.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
