"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SignalCreateBuilder, type SignalCreateUiState } from "@/components/signals/signal-create-builder";
import { SignalCreateExplainer } from "@/components/signals/signal-create-preview";
import { SCRATCH_TEMPLATE_ID } from "@/components/signals/signal-create-payload";
import { requestSaveSignal, requestSignal } from "@/components/signals/signal-client-api";
import {
  INITIAL_SIGNAL_FORM_STATE,
  signalRecordToFormState,
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
  signalId: string;
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

/**
 * Edit uses the same builder surface as create (`SignalCreateBuilder` + workflow shell).
 * Route stays `/…/signals/[id]/edit`; only the legacy `SignalEditForm` was removed.
 */
export function SignalEditPage({ signalId, role, userId, libraryBasePath, eventId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formState, setFormState] = useState<SignalFormState>(INITIAL_SIGNAL_FORM_STATE);
  const [createUi, setCreateUi] = useState<SignalCreateUiState>({ selectedTemplateId: null, advancedOpen: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionsLoading] = useState(false);

  const canManageSignals = useMemo(() => resolveCanManageSignals(role, userId), [role, userId]);
  const canEditGlobal = true;
  const workflowActiveStep = useCreateWorkflowActiveStep();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const signal = await requestSignal(signalId, { eventId });
        if (cancelled) return;
        setFormState(signalRecordToFormState(signal));
        setCreateUi({ selectedTemplateId: SCRATCH_TEMPLATE_ID, advancedOpen: false });
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load Campaign Agent");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, signalId]);

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
    const tonesPayload = tonesForMutationPayload("edit", formState.tones);

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
      await requestSaveSignal(payload, signalId, { eventId });
      router.push(appendEventId(libraryBasePath, eventId));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save Campaign Agent");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SignalWorkspaceShell libraryBasePath={libraryBasePath} title="Edit Campaign Agent" description="Loading…" layout="wide">
        <p className="text-slate-600">Loading Campaign Agent…</p>
      </SignalWorkspaceShell>
    );
  }

  if (loadError) {
    return (
      <SignalWorkspaceShell libraryBasePath={libraryBasePath} title="Edit Campaign Agent" description="Could not open this Campaign Agent.">
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{loadError}</div>
        <button
          type="button"
          onClick={() => router.push(appendEventId(libraryBasePath, eventId))}
          className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold"
        >
          Back to library
        </button>
      </SignalWorkspaceShell>
    );
  }

  return (
    <SignalWorkspaceShell
      libraryBasePath={libraryBasePath}
      title="Edit Campaign Agent"
      description="Update agent type, prompts, scope, and tone. Same builder as create."
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
              <p className="text-xs leading-snug text-slate-500">Cancel returns to the library without saving changes.</p>
              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => router.push(appendEventId(libraryBasePath, eventId))}
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
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SignalWorkspaceShell>
  );
}
