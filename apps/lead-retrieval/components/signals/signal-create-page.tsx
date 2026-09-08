"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SignalCreateBuilder } from "@/components/signals/signal-create-builder";
import { SignalCreateExplainer } from "@/components/signals/signal-create-preview";
import { requestSaveSignal } from "@/components/signals/signal-client-api";
import {
  INITIAL_SIGNAL_FORM_STATE,
  validateSignalFormInput,
  type SignalFormState
} from "@/components/signals/signal-form-state";
import { scopesForMutationPayload, tonesForMutationPayload } from "@/components/signals/signal-create-payload";
import type { SignalMutationPayload } from "@/components/signals/signal-types";
import {
  SignalCreateWorkflowProgress,
  useCreateWorkflowActiveStep
} from "@/components/signals/signal-create-workflow-progress";
import { SignalWorkspaceShell } from "@/components/signals/signal-workspace-shell";
import { resolveCanManageSignals } from "@/components/signals/signal-permissions";

type Props = {
  role: string;
  userId: string;
  libraryBasePath: string;
  eventId?: string | null;
};

const ROLE_SCOPE_OPTIONS = [
  { value: "event_organizer", label: "Event Organizer" },
  { value: "exhibitor_admin", label: "Exhibitor Admin" }
];

function appendEventId(path: string, eventId?: string | null) {
  const id = eventId?.trim();
  if (!id) return path;
  return `${path}${path.includes("?") ? "&" : "?"}eventId=${encodeURIComponent(id)}`;
}

export function SignalCreatePage({ role, userId, libraryBasePath, eventId }: Props) {
  const router = useRouter();
  const [formState, setFormState] = useState<SignalFormState>(() => ({
    ...INITIAL_SIGNAL_FORM_STATE,
    signal_scope: eventId?.trim() ? "event" : "company"
  }));
  const [createUi, setCreateUi] = useState({ selectedTemplateId: null as string | null, advancedOpen: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionsLoading] = useState(false);

  const canManageSignals = useMemo(() => resolveCanManageSignals(role, userId), [role, userId]);
  const canEditGlobal = true;
  const workflowActiveStep = useCreateWorkflowActiveStep();

  async function handleSave() {
    setError(null);
    const validation = validateSignalFormInput(formState);
    if (validation) {
      setError(validation);
      return;
    }

    const name = formState.name.trim();
    const defaultPrompt = formState.default_prompt.trim();
    const overridePrompt = formState.admin_override_prompt.trim();
    const visibility = formState.visibility;
    const scopes = scopesForMutationPayload(visibility, formState.role_scope, formState.template_scope);
    const tonesPayload = tonesForMutationPayload("create", formState.tones);

    const payload: SignalMutationPayload = {
      name,
      category: formState.category,
      default_prompt: defaultPrompt,
      admin_override_prompt: overridePrompt.length > 0 ? overridePrompt : null,
      visibility,
      signal_scope: formState.signal_scope,
      role_scope: scopes.role_scope,
      template_scope: scopes.template_scope,
      is_active: formState.is_active,
      available_in_pattern_mode: formState.available_in_pattern_mode,
      tones: tonesPayload
    };

    setSaving(true);
    try {
      await requestSaveSignal(payload, undefined, { eventId });
      router.push(appendEventId(libraryBasePath, eventId));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save Campaign Agent");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SignalWorkspaceShell
      libraryBasePath={libraryBasePath}
      title="Create Campaign Agent"
      description="Define the agent type, optional starter, instructions, and scope. Save when you are ready."
      layout="wide"
    >
      <div className="space-y-8">
        <SignalCreateExplainer category={formState.category} />

        <SignalCreateWorkflowProgress activeStep={workflowActiveStep} />

        <SignalCreateBuilder
          variant="page"
          formState={formState}
          createUi={createUi}
          setFormState={setFormState}
          setCreateUi={setCreateUi}
          eventId={eventId}
          roleScopeOptions={ROLE_SCOPE_OPTIONS}
          canManageSignals={canManageSignals}
          permissionsLoading={permissionsLoading}
          canEditGlobal={eventId?.trim() ? false : canEditGlobal}
          error={error}
          saving={saving}
          onCancel={() => router.push(appendEventId(libraryBasePath, eventId))}
          onSave={() => void handleSave()}
        />

        <div className="sticky bottom-3 z-10 pt-2">
          <div className="rounded-2xl border border-slate-200/90 bg-white/96 px-4 py-3 shadow-[0_-6px_18px_-12px_rgba(15,23,42,0.24)] backdrop-blur sm:px-5">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-snug text-slate-500">Cancel returns to the library without saving.</p>
              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => router.push(libraryBasePath)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={permissionsLoading || !canManageSignals || saving}
                  onClick={() => void handleSave()}
                  className="min-w-[10.5rem] rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 ring-1 ring-white/15 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Create Campaign Agent"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SignalWorkspaceShell>
  );
}
