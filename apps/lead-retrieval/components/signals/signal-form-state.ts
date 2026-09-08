import { SIGNAL_TONES, type SignalCategory, type SignalRecord, type SignalTone, type SignalVisibility } from "@/components/signals/signal-types";
import { normalizeSignalScope, type SignalScope } from "@/lib/signals/signal-scope";

/** Shared shape for create builder and edit form (aligned with SignalMutationPayload fields). */
export type SignalFormState = {
  name: string;
  category: SignalCategory;
  default_prompt: string;
  admin_override_prompt: string;
  visibility: SignalVisibility;
  signal_scope: SignalScope;
  role_scope: string;
  template_scope: string;
  is_active: boolean;
  available_in_pattern_mode: boolean;
  tones: SignalTone[];
};

export const INITIAL_SIGNAL_FORM_STATE: SignalFormState = {
  name: "",
  category: "AI-Powered",
  default_prompt: "",
  admin_override_prompt: "",
  visibility: "role",
  signal_scope: "event",
  role_scope: "",
  template_scope: "",
  is_active: true,
  available_in_pattern_mode: true,
  tones: ["Professional"]
};

function tonesFromRecord(signal: SignalRecord): SignalTone[] {
  const raw = (signal as SignalRecord & { tones?: string[] }).tones;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.filter((t): t is SignalTone => (SIGNAL_TONES as readonly string[]).includes(t));
  }
  return [];
}

export function signalRecordToFormState(signal: SignalRecord): SignalFormState {
  let visibility: SignalVisibility = signal.visibility ?? "global";
  if (visibility === "template") {
    visibility = "global";
  }
  const tones = tonesFromRecord(signal);
  return {
    name: signal.name,
    category: signal.category,
    default_prompt: signal.default_prompt,
    admin_override_prompt: signal.admin_override_prompt ?? "",
    visibility,
    signal_scope: normalizeSignalScope(signal.signal_scope, signal.event_id ? "event" : "company"),
    role_scope: visibility === "role" ? signal.role_scope ?? "" : "",
    template_scope: "",
    is_active: signal.is_active,
    available_in_pattern_mode: signal.available_in_pattern_mode,
    tones: tones.length > 0 ? tones : []
  };
}

export function validateSignalFormInput(formState: SignalFormState): string | null {
  const name = formState.name.trim();
  const defaultPrompt = formState.default_prompt.trim();

  if (!name) return "Agent name is required";
  if (!defaultPrompt) return "Default prompt text is required";
  return null;
}
