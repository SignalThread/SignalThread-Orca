import type { SignalMutationPayload } from "@/components/signals/signal-types";
import type { Database } from "@/types/database";
import { normalizeSignalScope, signalScopeRequiresEvent } from "@/lib/signals/signal-scope";

type DbSignalVisibility = Database["public"]["Tables"]["signals"]["Row"]["visibility"];

export function buildSignalInsertPatch(
  payload: SignalMutationPayload,
  createdBy: string,
  options?: { eventId?: string | null; companyId?: string | null; ownerUserId?: string | null }
): Database["public"]["Tables"]["signals"]["Insert"] {
  const tonesResolved =
    payload.tones && payload.tones.length > 0 ? payload.tones : (["Professional"] as const);
  const eventId = options?.eventId?.trim() || null;
  const companyId = options?.companyId?.trim() || null;
  const requestedScope = normalizeSignalScope(payload.signal_scope, eventId ? "event" : "company");
  const signalScope = requestedScope === "default" ? "company" : requestedScope;
  const scopedEventId = signalScopeRequiresEvent(signalScope) ? eventId : null;
  const ownerUserId = options?.ownerUserId?.trim() || createdBy;
  const visibility: DbSignalVisibility = "role";
  const roleScope = payload.role_scope?.trim() || "exhibitor_admin";

  return {
    name: payload.name.trim(),
    category: payload.category,
    default_prompt: payload.default_prompt.trim(),
    admin_override_prompt: payload.admin_override_prompt?.trim() || null,
    visibility,
    role_scope: roleScope,
    template_scope: null,
    is_active: payload.is_active,
    available_in_pattern_mode: payload.available_in_pattern_mode,
    tones: [...tonesResolved],
    created_by: createdBy,
    signal_scope: signalScope,
    company_id: companyId,
    owner_user_id: ownerUserId,
    event_id: scopedEventId,
    source_signal_id: null
  };
}
