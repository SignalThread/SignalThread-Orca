import type { SignalScope } from "@/lib/signals/signal-scope";

export const SIGNAL_CATEGORIES = [
  "AI-Powered",
  "Contextual",
  "Custom",
  "Call-to-Action"
] as const;

export const SIGNAL_VISIBILITY_OPTIONS = ["global", "role", "template"] as const;

/** Shown in signal forms only; `template` exists in DB/API but is not selectable in the UI. */
export const SIGNAL_FORM_VISIBILITY_OPTIONS = ["global", "role"] as const;

export const SIGNAL_TONES = ["Professional", "Friendly", "Persuasive", "Consultative"] as const;

export type SignalCategory = (typeof SIGNAL_CATEGORIES)[number];
export type SignalVisibility = (typeof SIGNAL_VISIBILITY_OPTIONS)[number];
export type SignalTone = (typeof SIGNAL_TONES)[number];

export type SignalRecord = {
  id: string;
  name: string;
  category: SignalCategory;
  default_prompt: string;
  admin_override_prompt: string | null;
  effective_prompt: string;
  visibility: SignalVisibility;
  signal_scope: SignalScope;
  company_id: string | null;
  owner_user_id: string | null;
  role_scope: string | null;
  template_scope: string | null;
  is_active: boolean;
  available_in_pattern_mode: boolean;
  event_id: string | null;
  source_signal_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  ai_generated: boolean;
  override_active: boolean;
  is_readonly: boolean;
};

export type SignalMutationPayload = {
  name: string;
  category: SignalCategory;
  default_prompt: string;
  admin_override_prompt?: string | null;
  visibility: SignalVisibility;
  signal_scope?: SignalScope;
  role_scope?: string | null;
  template_scope?: string | null;
  is_active: boolean;
  available_in_pattern_mode: boolean;
  tones?: SignalTone[];
};
