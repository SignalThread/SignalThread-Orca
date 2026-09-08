import { SIGNAL_TONES, type SignalTone, type SignalVisibility } from "@/components/signals/signal-types";
import type { SignalScope } from "@/lib/signals/signal-scope";

/** Starter "from scratch" sentinel — not a real template id in STARTER_TEMPLATES_BY_CATEGORY */
export const SCRATCH_TEMPLATE_ID = "__scratch__";

/** True when the user picked a category starter card (not scratch, not undecided). */
export function isStarterTemplateSelection(selectedTemplateId: string | null): boolean {
  return selectedTemplateId != null && selectedTemplateId !== SCRATCH_TEMPLATE_ID;
}

/**
 * When the user changes category in the create builder:
 * - If a starter was selected, clear prefilled name/prompt and template selection (starter is category-bound).
 * - If scratch or undecided (null), keep name and prompt so manual work is not wiped.
 */
export function categorySwitchPatch(selectedTemplateId: string | null): {
  clearStarterPrefill: boolean;
  nextSelectedTemplateId: string | null;
} {
  const hadStarter = isStarterTemplateSelection(selectedTemplateId);
  return {
    clearStarterPrefill: hadStarter,
    nextSelectedTemplateId: hadStarter ? null : selectedTemplateId
  };
}

function filterValidTones(tones: SignalTone[]): SignalTone[] {
  return tones.filter((t): t is SignalTone => (SIGNAL_TONES as readonly string[]).includes(t));
}

/**
 * Canonical tones for API save: valid enum values only, never empty.
 * Create: single primary tone (builder uses one selection). Edit: keeps multiple valid selections.
 */
export function tonesForMutationPayload(mode: "create" | "edit", tones: SignalTone[]): SignalTone[] {
  const valid = filterValidTones(tones);
  if (mode === "create") {
    return [valid[0] ?? "Professional"];
  }
  return valid.length > 0 ? valid : ["Professional"];
}

/**
 * Maps visibility + raw form strings to API payload fields. Clears stale scope when not applicable.
 */
export function scopesForMutationPayload(
  visibility: SignalVisibility,
  roleScope: string,
  templateScope: string
): { role_scope: string | null; template_scope: string | null } {
  if (visibility === "global") {
    return { role_scope: null, template_scope: null };
  }
  if (visibility === "role") {
    return { role_scope: roleScope.trim() || null, template_scope: null };
  }
  return { role_scope: null, template_scope: templateScope.trim() || null };
}

export function legacyVisibilityForSignalScope(scope: SignalScope): SignalVisibility {
  return scope === "default" ? "global" : "role";
}
