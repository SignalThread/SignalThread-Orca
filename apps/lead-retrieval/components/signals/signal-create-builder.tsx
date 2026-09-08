"use client";

import { useCallback } from "react";
import { SignalCategoryCards } from "@/components/signals/signal-category-cards";
import { SignalCreateDraftPipeline } from "@/components/signals/signal-create-preview";
import { STARTER_TEMPLATES_BY_CATEGORY, type StarterTemplate } from "@/components/signals/signal-starter-templates";
import { categorySwitchPatch, SCRATCH_TEMPLATE_ID } from "@/components/signals/signal-create-payload";
import type { SignalFormState } from "@/components/signals/signal-form-state";
import {
  SIGNAL_TONES,
  type SignalCategory,
  type SignalTone
} from "@/components/signals/signal-types";
import { type SignalScope } from "@/lib/signals/signal-scope";

type RoleScopeOption = { value: string; label: string };

export type SignalCreateFormState = SignalFormState;

export type SignalCreateUiState = {
  selectedTemplateId: string | null;
  advancedOpen: boolean;
};

/** `drawer` / `page`: header/footer live outside the builder; scrollable body only. */
type Props = {
  formState: SignalFormState;
  createUi: SignalCreateUiState;
  setFormState: React.Dispatch<React.SetStateAction<SignalFormState>>;
  setCreateUi: React.Dispatch<React.SetStateAction<SignalCreateUiState>>;
  eventId?: string | null;
  roleScopeOptions: RoleScopeOption[];
  canManageSignals: boolean;
  permissionsLoading: boolean;
  canEditGlobal: boolean;
  error: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  variant?: "default" | "drawer" | "page";
};

export function SignalCreateBuilder({
  formState,
  createUi,
  setFormState,
  setCreateUi,
  eventId,
  roleScopeOptions,
  canManageSignals,
  permissionsLoading,
  canEditGlobal,
  error,
  saving,
  onCancel,
  onSave,
  variant = "default"
}: Props) {
  const isPage = variant === "page";
  const isDrawer = variant === "drawer" || variant === "page";
  const templates = STARTER_TEMPLATES_BY_CATEGORY[formState.category];
  const hasEventContext = Boolean(eventId?.trim());
  const scopeDisabled = permissionsLoading || !canManageSignals;

  const applyTemplate = useCallback(
    (template: StarterTemplate) => {
      setFormState((current) => ({
        ...current,
        name: template.prefills.name,
        default_prompt: template.prefills.default_prompt
      }));
      setCreateUi((u) => ({ ...u, selectedTemplateId: template.id }));
    },
    [setCreateUi, setFormState]
  );

  const applyScratch = useCallback(() => {
    setFormState((current) => ({
      ...current,
      name: "",
      default_prompt: ""
    }));
    setCreateUi((u) => ({ ...u, selectedTemplateId: SCRATCH_TEMPLATE_ID }));
  }, [setCreateUi, setFormState]);

  const onCategorySelect = useCallback(
    (category: SignalCategory) => {
      const patch = categorySwitchPatch(createUi.selectedTemplateId);
      setFormState((current) => ({
        ...current,
        category,
        ...(patch.clearStarterPrefill ? { name: "", default_prompt: "" } : {})
      }));
      setCreateUi((u) => ({ ...u, selectedTemplateId: patch.nextSelectedTemplateId }));
    },
    [createUi.selectedTemplateId, setCreateUi, setFormState]
  );

  const updateField = useCallback(
    <K extends keyof SignalFormState>(key: K, value: SignalFormState[K]) => {
      setFormState((current) => ({ ...current, [key]: value }));
    },
    [setFormState]
  );

  const updateSignalScope = useCallback(
    (signalScope: SignalScope) => {
      setFormState((current) => ({
        ...current,
        signal_scope: signalScope,
        visibility: signalScope === "default" ? "global" : "role",
        role_scope: signalScope === "default" ? "" : current.role_scope || "exhibitor_admin",
        template_scope: ""
      }));
    },
    [setFormState]
  );

  const setPrimaryTone = useCallback(
    (tone: SignalTone) => {
      setFormState((current) => ({ ...current, tones: [tone] }));
    },
    [setFormState]
  );

  const primaryTone: SignalTone = formState.tones[0] ?? "Professional";

  const pageScroll = isPage ? "scroll-mt-28 md:scroll-mt-32" : "";
  const scopeCards: Array<{
    scope: Exclude<SignalScope, "default">;
    label: string;
    description: string;
    requiresEvent?: boolean;
  }> = [
    {
      scope: "company",
      label: "Company-wide",
      description: "Available across all events for this company."
    },
    {
      scope: "event",
      label: "Event only",
      description: "Available only in the selected event.",
      requiresEvent: true
    },
    {
      scope: "private",
      label: "Private",
      description: "Only visible to me in this event.",
      requiresEvent: true
    }
  ];

  void roleScopeOptions;

  return (
    <div className={`${isDrawer ? "space-y-7 pb-4" : "space-y-9 pb-2"}`}>
      {variant === "drawer" ? (
        <div className="border-b border-slate-200/70 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Category · Preview · Starter · Definition · Advanced
          </p>
          <p className="mt-1.5 max-w-lg text-sm leading-snug text-slate-600">Work through each section below.</p>
        </div>
      ) : !isPage ? (
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Create Campaign Agent</h2>
          <p className="max-w-lg text-sm leading-relaxed text-slate-600">
            Choose how this Campaign Agent guides email drafts: agent type first, then optional starter, then your wording.
            Everything is editable.
          </p>
        </div>
      ) : null}

      {permissionsLoading ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Loading permissions...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      <section
        data-workflow-step={isPage ? 0 : undefined}
        className={`space-y-3 rounded-2xl border p-5 shadow-sm ${pageScroll} ${
          isDrawer
            ? "border-slate-200/80 bg-white ring-1 ring-slate-900/[0.04]"
            : "border-slate-200/90 bg-white shadow-sm"
        }`}
      >
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Agent type</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            Changing agent type clears prefilled fields only if you chose a starter below—not for scratch or your own text.
          </p>
        </div>
        <SignalCategoryCards
          selected={formState.category}
          onSelect={onCategorySelect}
          disabled={permissionsLoading || !canManageSignals}
        />
      </section>

      <section data-workflow-step={isPage ? 1 : undefined} className={`space-y-3 ${pageScroll}`}>
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Preview</h3>
        <SignalCreateDraftPipeline
          category={formState.category}
          templateId={createUi.selectedTemplateId}
          name={formState.name}
          defaultPrompt={formState.default_prompt}
          tones={formState.tones}
          visibility={formState.visibility}
          roleScope={formState.role_scope}
          templateScope={formState.template_scope}
        />
      </section>

      <section
        data-workflow-step={isPage ? 2 : undefined}
        className={`space-y-4 rounded-2xl border p-5 shadow-sm ${pageScroll} ${
          isDrawer
            ? "border-slate-200/80 bg-white ring-1 ring-slate-900/[0.04]"
            : "border-slate-200/90 bg-white shadow-sm"
        }`}
      >
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Starter (optional)</h3>
          <p className="mt-1.5 text-sm leading-snug text-slate-600">Prefills name and prompt; edit freely after.</p>
        </div>
        <div className="space-y-2.5">
          {templates.map((template) => {
            const active = createUi.selectedTemplateId === template.id;
            return (
              <button
                key={template.id}
                type="button"
                disabled={permissionsLoading || !canManageSignals}
                onClick={() => applyTemplate(template)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition-all ${
                  active
                    ? "border-indigo-500 bg-indigo-50/90 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.15)]"
                    : "border-slate-200 bg-slate-50/30 hover:border-slate-300 hover:bg-white"
                } disabled:opacity-60`}
              >
                <p className="font-semibold text-slate-900">{template.title}</p>
                <p className="mt-0.5 text-sm leading-snug text-slate-600">{template.description}</p>
                <p className="mt-2 text-xs leading-snug text-slate-500">
                  <span className="font-medium text-slate-600">Example · </span>
                  {template.example}
                </p>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={permissionsLoading || !canManageSignals}
          onClick={applyScratch}
          className={`w-full rounded-xl border px-4 py-3 text-left transition-all ${
            createUi.selectedTemplateId === SCRATCH_TEMPLATE_ID
              ? "border-indigo-500 bg-indigo-50/90 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.15)]"
              : "border-dashed border-slate-300 bg-slate-50 hover:border-slate-400"
          } disabled:opacity-60`}
        >
          <span className="block text-sm font-semibold text-slate-900">From scratch</span>
          <span className="mt-0.5 block text-xs font-normal text-slate-500">
            Empty fields to start; your text is preserved if you change category
          </span>
        </button>
      </section>

      <section
        data-workflow-step={isPage ? 3 : undefined}
        className={`space-y-4 rounded-2xl border p-5 shadow-sm ${pageScroll} ${
          isDrawer
            ? "border-slate-200/80 bg-white ring-1 ring-slate-900/[0.04]"
            : "border-slate-200/90 bg-white shadow-sm"
        }`}
      >
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Agent name & instructions</h3>
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-800">Agent Name</span>
          <input
            value={formState.name}
            onChange={(e) => updateField("name", e.target.value)}
            disabled={permissionsLoading || !canManageSignals}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-[15px] shadow-sm"
            placeholder="e.g., Positioning Agent"
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-800">Default prompt</span>
          <textarea
            value={formState.default_prompt}
            onChange={(e) => updateField("default_prompt", e.target.value)}
            rows={5}
            disabled={permissionsLoading || !canManageSignals}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-[15px] leading-relaxed shadow-sm"
            placeholder="What should this Campaign Agent prioritize when a draft is generated?"
          />
        </label>
      </section>

      <section
        data-workflow-step={isPage ? 4 : undefined}
        className={`space-y-4 rounded-2xl border p-5 shadow-sm ${pageScroll} ${
          isDrawer
            ? "border-slate-200/80 bg-white ring-1 ring-slate-900/[0.04]"
            : "border-slate-200/90 bg-white shadow-sm"
        }`}
      >
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Scope</h3>
          <p className="mt-1.5 text-sm leading-snug text-slate-600">
            Choose where this Campaign Agent should be available after you save it.
          </p>
        </div>

        <div className="grid gap-2.5 md:grid-cols-3" role="radiogroup" aria-label="Scope">
          {scopeCards.map((option) => {
            const active = formState.signal_scope === option.scope;
            const unavailable = Boolean(option.requiresEvent && !hasEventContext);
            const disabled = scopeDisabled || unavailable;

            return (
              <label
                key={option.scope}
                className={`relative flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-all ${
                  active
                    ? "border-indigo-500 bg-indigo-50/80 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.14)]"
                    : "border-slate-200 bg-slate-50/40 hover:border-slate-300 hover:bg-white"
                } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <input
                  type="radio"
                  name="signal-scope-create"
                  checked={active}
                  disabled={disabled}
                  onChange={() => updateSignalScope(option.scope)}
                  className="sr-only"
                />

                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                    active
                      ? "border-indigo-500 bg-indigo-500 text-white"
                      : "border-slate-300 bg-white text-transparent"
                  }`}
                  aria-hidden
                >
                  •
                </span>

                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-slate-600">
                    {unavailable ? `${option.description} Requires a selected event.` : option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {!hasEventContext ? (
          <p className="text-xs leading-snug text-slate-500">
            Event-only and Private scopes unlock when you create a Campaign Agent from an event context.
          </p>
        ) : null}
      </section>

      <section data-workflow-step={isPage ? 5 : undefined} className={`space-y-3 ${pageScroll}`}>
        <button
          type="button"
          onClick={() => setCreateUi((u) => ({ ...u, advancedOpen: !u.advancedOpen }))}
          className="group flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 text-left transition hover:border-slate-300 hover:bg-slate-50"
        >
          <div>
            <span className="font-semibold text-slate-900">Advanced</span>
            <span className="mt-0.5 block text-xs font-normal text-slate-500">Tone, who can use it, admin notes, on/off</span>
          </div>
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm font-bold text-slate-600 transition group-hover:bg-slate-100 ${
              createUi.advancedOpen ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white"
            }`}
            aria-hidden
          >
            {createUi.advancedOpen ? "−" : "+"}
          </span>
        </button>

        {createUi.advancedOpen ? (
          <div className="space-y-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800">Tone</p>
              <p className="text-xs text-slate-500">Defaults to Professional if you skip this.</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SIGNAL_TONES.map((tone) => {
                  const active = primaryTone === tone;
                  return (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => setPrimaryTone(tone)}
                      disabled={permissionsLoading || !canManageSignals}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                        active ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      {tone}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-800">Admin override (optional)</span>
              <textarea
                value={formState.admin_override_prompt}
                onChange={(e) => updateField("admin_override_prompt", e.target.value)}
                rows={3}
                disabled={permissionsLoading || !canEditGlobal}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 disabled:bg-slate-100"
                placeholder="Extra rules for admins—most teams leave this empty"
              />
              <span className="text-xs text-slate-500">When set, replaces the default prompt for eligible users.</span>
            </label>

            <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-sm font-semibold text-slate-800">Active</span>
              <input
                type="checkbox"
                checked={formState.is_active}
                disabled={permissionsLoading || !canManageSignals}
                onChange={(e) => updateField("is_active", e.target.checked)}
              />
            </label>

            <label className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 pr-2">
                <span className="text-sm font-semibold text-slate-800">Available for multi-recipient drafts</span>
                <p className="mt-1 text-xs leading-snug text-slate-500">
                  Show this Campaign Agent when generating one draft across multiple selected leads.
                </p>
              </div>
              <input
                type="checkbox"
                className="shrink-0"
                checked={formState.available_in_pattern_mode}
                disabled={permissionsLoading || !canManageSignals}
                onChange={(e) => updateField("available_in_pattern_mode", e.target.checked)}
              />
            </label>
          </div>
        ) : null}
      </section>

      {variant === "default" ? (
        <div className="mt-10 flex flex-col gap-4 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Cancel closes the dialog without saving.</p>
          <div className="flex flex-wrap items-center justify-end gap-3 sm:shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={permissionsLoading || !canManageSignals || saving}
              onClick={onSave}
              className="min-w-[11rem] rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-7 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Create Campaign Agent"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
