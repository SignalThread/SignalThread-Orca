"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLeadProfileToolbarSetter } from "@/components/leads/lead-profile-toolbar-context";
import {
  parseIntentSignalsFromPatch,
  type LeadIntentSignal
} from "@/lib/leads/canonical-lead-fields";
import { isImportLinkedInUrlFormatValid } from "@/lib/import-wizard/linkedin-import-url";
import { seededAvatarSrc } from "@/lib/leads/leadCardAvatar";
import { toDateInputValue } from "@/lib/leads/leadDateInput";
import {
  LEAD_TEMPERATURE_LABEL,
  LEAD_TEMPERATURE_VALUES,
  parseLeadTemperature,
  type LeadTemperature
} from "@/lib/leads/temperature";
import { companyDomainToUrl, normalizeCompanyDomain, normalizeLinkedinUrl } from "@/lib/urls";

function initialsFromName(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "NA";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

type Draft = {
  full_name: string;
  job_title: string;
  email: string;
  company_text: string;
  linkedin_url: string;
  company_domain: string;
  industry: string;
  company_size: string;
  seniority: string;
  intent_signals: LeadIntentSignal[];
  temperature: LeadTemperature | null;
  rating: number;
  follow_up_date: string;
};

function intentSignalsFromUnknown(raw: unknown): LeadIntentSignal[] {
  const parsed = parseIntentSignalsFromPatch(raw);
  return parsed ?? [];
}

function serializeIntentSignals(signals: LeadIntentSignal[]): string {
  return JSON.stringify(signals);
}

function normalizeLinkedinForPatch(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const n = normalizeLinkedinUrl(t) ?? t;
  return isImportLinkedInUrlFormatValid(n) ? n : null;
}

function clampRating(n: number) {
  return Math.max(0, Math.min(5, Math.round(Number.isFinite(n) ? n : 0)));
}

function normalizeTemperature(value: string | null | undefined): LeadTemperature | null {
  return parseLeadTemperature(value);
}

function temperatureButtonClass(value: LeadTemperature | null, selected: boolean) {
  if (!selected) {
    return "border-slate-200 bg-white text-slate-600 hover:bg-slate-50";
  }
  switch (value) {
    case "hot":
      return "border-rose-300 bg-rose-50 text-rose-700";
    case "warm":
      return "border-amber-300 bg-amber-50 text-amber-700";
    case "cold":
      return "border-sky-300 bg-sky-50 text-sky-700";
    default:
      return "border-slate-300 bg-slate-50 text-slate-700";
  }
}

function ProfileAvatar({ leadId, name }: { leadId: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const src = useMemo(() => seededAvatarSrc(leadId, 128), [leadId]);

  if (failed) {
    return (
      <div
        className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xl font-bold text-white shadow-md ring-1 ring-slate-900/10 sm:h-[7.25rem] sm:w-[7.25rem] sm:text-2xl"
        aria-hidden
      >
        {initialsFromName(name)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={128}
      height={128}
      loading="lazy"
      decoding="async"
      className="h-24 w-24 shrink-0 rounded-2xl object-cover shadow-md ring-1 ring-slate-900/10 sm:h-[7.25rem] sm:w-[7.25rem]"
      onError={() => setFailed(true)}
    />
  );
}

function ProfileStatCard({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function IntentSignalsEditor({
  leadId,
  signals,
  onChange,
  disabled
}: {
  leadId: string;
  signals: LeadIntentSignal[];
  onChange: (next: LeadIntentSignal[]) => void;
  disabled?: boolean;
}) {
  const updateAt = (index: number, partial: Partial<LeadIntentSignal>) => {
    const next = signals.map((s, i) => (i === index ? { ...s, ...partial } : s));
    onChange(next);
  };

  const removeAt = (index: number) => {
    onChange(signals.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Intent cues</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...signals, { type: "topic", value: "" }])}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          Add cue
        </button>
      </div>
      {signals.length === 0 ? (
        <p className="text-sm text-slate-500">No intent cues yet.</p>
      ) : (
        <ul className="space-y-2">
          {signals.map((sig, index) => (
            <li
              key={`${leadId}-intent-${index}`}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm"
            >
              <input
                aria-label={`Intent type ${index + 1}`}
                value={sig.type}
                disabled={disabled}
                onChange={(e) => updateAt(index, { type: e.target.value })}
                placeholder="type"
                className="min-w-[5.5rem] flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 sm:max-w-[8rem]"
              />
              <input
                aria-label={`Intent value ${index + 1}`}
                value={sig.value}
                disabled={disabled}
                onChange={(e) => updateAt(index, { value: e.target.value })}
                placeholder="value"
                className="min-w-0 flex-[2] rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeAt(index)}
                className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-slate-500">Empty type/value rows are dropped when you save.</p>
    </div>
  );
}

export function ExhibitorLeadProfileCard({
  leadId,
  initialFullName,
  initialJobTitle,
  initialCompanyText,
  initialLinkedinUrl,
  initialCompanyDomain,
  initialIndustry,
  initialCompanySize,
  initialSeniority,
  initialIntentSignals,
  initialTemperature,
  initialRating,
  initialFollowUpDate,
  initialEmail,
  createdAtLabel,
  eventName,
  locationLabel,
  canEdit = true
}: {
  leadId: string;
  initialFullName: string;
  initialJobTitle: string | null;
  initialCompanyText: string | null;
  initialLinkedinUrl: string | null;
  initialCompanyDomain: string | null;
  initialIndustry: string | null;
  initialCompanySize: string | null;
  initialSeniority: string | null;
  initialIntentSignals: unknown;
  initialTemperature: string | null;
  initialRating: number;
  initialFollowUpDate: string | null;
  initialEmail: string | null;
  createdAtLabel: string;
  eventName: string;
  locationLabel: string;
  /**
   * When `false`, every input/button inside the card is disabled and the
   * card never registers write handlers with the detail-toolbar (so Save /
   * Reset / inline follow-up editor never appear). Used for the read-only
   * `exhibitor_viewer` role. Defaults to `true` so existing
   * `exhibitor_admin` callers are unchanged.
   */
  canEdit?: boolean;
}) {
  const router = useRouter();
  const setToolbarHandlers = useLeadProfileToolbarSetter();
  const handlersRef = useRef({
    save: async () => {},
    reset: () => {},
    commitFollowUpDate: async (_iso: string | null) => {}
  });

  const baseline = useMemo<Draft>(
    () => ({
      full_name: initialFullName,
      job_title: initialJobTitle ?? "",
      email: initialEmail?.trim() ?? "",
      company_text: initialCompanyText ?? "",
      linkedin_url: initialLinkedinUrl?.trim() ?? "",
      company_domain: initialCompanyDomain?.trim() ?? "",
      industry: initialIndustry?.trim() ?? "",
      company_size: initialCompanySize?.trim() ?? "",
      seniority: initialSeniority?.trim() ?? "",
      intent_signals: intentSignalsFromUnknown(initialIntentSignals),
      temperature: normalizeTemperature(initialTemperature),
      rating: clampRating(initialRating),
      follow_up_date: toDateInputValue(initialFollowUpDate)
    }),
    [
      initialFullName,
      initialJobTitle,
      initialEmail,
      initialCompanyText,
      initialLinkedinUrl,
      initialCompanyDomain,
      initialIndustry,
      initialCompanySize,
      initialSeniority,
      initialIntentSignals,
      initialTemperature,
      initialRating,
      initialFollowUpDate
    ]
  );

  const [draft, setDraft] = useState<Draft>(baseline);
  const [saved, setSaved] = useState<Draft>(baseline);
  const [saving, setSaving] = useState(false);
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(baseline);
    setSaved(baseline);
    setSavingFollowUp(false);
    setError(null);
  }, [baseline]);

  const dirty = useMemo(() => {
    return (
      draft.full_name !== saved.full_name ||
      draft.job_title !== saved.job_title ||
      draft.email !== saved.email ||
      draft.company_text !== saved.company_text ||
      draft.linkedin_url !== saved.linkedin_url ||
      draft.company_domain !== saved.company_domain ||
      draft.industry !== saved.industry ||
      draft.company_size !== saved.company_size ||
      draft.seniority !== saved.seniority ||
      serializeIntentSignals(draft.intent_signals) !== serializeIntentSignals(saved.intent_signals) ||
      draft.temperature !== saved.temperature ||
      draft.rating !== saved.rating ||
      draft.follow_up_date !== saved.follow_up_date
    );
  }, [draft, saved]);

  const sanitizedIntentForPatch = useCallback((signals: LeadIntentSignal[]) => {
    return signals
      .map((s) => ({
        type: String(s.type ?? "").trim().slice(0, 64),
        value: String(s.value ?? "").trim().slice(0, 512)
      }))
      .filter((s) => s.type.length > 0 && s.value.length > 0);
  }, []);

  const patchPayload = useCallback(() => {
    const patch: Record<string, unknown> = {};
    if (draft.full_name !== saved.full_name) {
      patch.full_name = draft.full_name.trim();
    }
    if (draft.job_title !== saved.job_title) {
      patch.job_title = draft.job_title.trim() || null;
    }
    if (draft.email !== saved.email) {
      patch.email = draft.email.trim() || null;
    }
    if (draft.company_text !== saved.company_text) {
      patch.company_text = draft.company_text.trim() || null;
    }
    if (draft.linkedin_url !== saved.linkedin_url) {
      patch.linkedin_url = normalizeLinkedinForPatch(draft.linkedin_url);
    }
    if (draft.company_domain !== saved.company_domain) {
      const d = draft.company_domain.trim();
      patch.company_domain = d ? normalizeCompanyDomain(d) : null;
    }
    if (draft.industry !== saved.industry) {
      patch.industry = draft.industry.trim() || null;
    }
    if (draft.company_size !== saved.company_size) {
      patch.company_size = draft.company_size.trim() || null;
    }
    if (draft.seniority !== saved.seniority) {
      patch.seniority = draft.seniority.trim() || null;
    }
    if (serializeIntentSignals(draft.intent_signals) !== serializeIntentSignals(saved.intent_signals)) {
      patch.intent_signals = sanitizedIntentForPatch(draft.intent_signals);
    }
    if (draft.temperature !== saved.temperature) {
      patch.temperature = draft.temperature;
    }
    if (draft.rating !== saved.rating) {
      patch.rating = draft.rating;
    }
    if (draft.follow_up_date !== saved.follow_up_date) {
      patch.follow_up_date = draft.follow_up_date.trim() || null;
    }
    return patch;
  }, [draft, saved, sanitizedIntentForPatch]);

  type LeadPatchResponse = {
    full_name: string;
    job_title: string | null;
    email: string | null;
    company_text: string | null;
    linkedin_url: string | null;
    company_domain: string | null;
    industry: string | null;
    company_size: string | null;
    seniority: string | null;
    intent_signals: unknown;
    temperature: string | null;
    rating: number | null;
    follow_up_date: string | null;
  };

  function leadToDraft(lead: LeadPatchResponse): Draft {
    return {
      full_name: lead.full_name,
      job_title: lead.job_title ?? "",
      email: lead.email?.trim() ?? "",
      company_text: lead.company_text ?? "",
      linkedin_url: lead.linkedin_url?.trim() ?? "",
      company_domain: lead.company_domain?.trim() ?? "",
      industry: lead.industry?.trim() ?? "",
      company_size: lead.company_size?.trim() ?? "",
      seniority: lead.seniority?.trim() ?? "",
      intent_signals: intentSignalsFromUnknown(lead.intent_signals),
      temperature: normalizeTemperature(lead.temperature),
      rating: clampRating(Number(lead.rating ?? 0)),
      follow_up_date: toDateInputValue(lead.follow_up_date)
    };
  }

  async function save() {
    setError(null);
    if (!draft.full_name.trim()) {
      setError("Full name is required.");
      return;
    }

    const payload = patchPayload();
    if (Object.keys(payload).length === 0) {
      return;
    }

    setSaving(true);
    const response = await fetch(`/api/exhibitor/leads/${encodeURIComponent(leadId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const body = (await response.json().catch(() => ({}))) as {
      lead?: LeadPatchResponse;
      error?: string;
    };

    setSaving(false);

    if (!response.ok || !body.lead) {
      setError(body.error ?? "Failed to save changes.");
      return;
    }

    const next = leadToDraft(body.lead);
    setSaved(next);
    setDraft(next);
    router.refresh();
  }

  async function commitFollowUpDate(isoYmd: string | null) {
    const next = isoYmd?.trim() || "";
    const prev = saved.follow_up_date;
    if (next === prev) return;

    setError(null);
    setSavingFollowUp(true);
    setDraft((current) => ({ ...current, follow_up_date: next }));
    setSaved((current) => ({ ...current, follow_up_date: next }));

    const response = await fetch(`/api/exhibitor/leads/${encodeURIComponent(leadId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ follow_up_date: next || null })
    });

    const body = (await response.json().catch(() => ({}))) as {
      lead?: {
        follow_up_date: string | null;
      };
      error?: string;
    };

    setSavingFollowUp(false);

    if (!response.ok || !body.lead) {
      setDraft((current) => ({ ...current, follow_up_date: prev }));
      setSaved((current) => ({ ...current, follow_up_date: prev }));
      setError(body.error ?? "Failed to save follow-up date.");
      return;
    }

    const persisted = toDateInputValue(body.lead.follow_up_date);
    setDraft((current) => ({ ...current, follow_up_date: persisted }));
    setSaved((current) => ({ ...current, follow_up_date: persisted }));
    router.refresh();
  }

  function reset() {
    setDraft(saved);
    setError(null);
  }

  handlersRef.current = { save, reset, commitFollowUpDate };

  useLayoutEffect(() => {
    if (!canEdit) {
      setToolbarHandlers(null);
      return;
    }
    setToolbarHandlers({
      emailTrimmed: draft.email.trim(),
      followUpDate: draft.follow_up_date.trim() || null,
      savingFollowUp,
      saving,
      dirty,
      save: () => void handlersRef.current.save(),
      reset: () => handlersRef.current.reset(),
      commitFollowUpDate: (iso) => void handlersRef.current.commitFollowUpDate(iso)
    });
  }, [canEdit, dirty, draft.email, draft.follow_up_date, saving, savingFollowUp, setToolbarHandlers]);

  useEffect(() => {
    return () => setToolbarHandlers(null);
  }, [setToolbarHandlers]);

  useEffect(() => {
    if (!actionsOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (actionsRef.current?.contains(event.target as Node)) return;
      setActionsOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActionsOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [actionsOpen]);

  const stars = Array.from({ length: 5 }, (_, i) => i < draft.rating);

  const domainHref = companyDomainToUrl(normalizeCompanyDomain(draft.company_domain) ?? draft.company_domain);
  const linkedinHref = normalizeLinkedinUrl(draft.linkedin_url.trim()) ?? undefined;
  const linkedinDisplayOk = draft.linkedin_url.trim() && linkedinHref && isImportLinkedInUrlFormatValid(linkedinHref);

  async function deleteLead() {
    setDeleting(true);
    setDeleteError(null);

    const response = await fetch(`/api/exhibitor/leads/${encodeURIComponent(leadId)}`, {
      method: "DELETE",
      credentials: "include",
    });
    const body = (await response.json().catch(() => ({}))) as {
      outcome?: string;
      error?: string;
      message?: string;
    };

    if (!response.ok || body.outcome !== "deleted") {
      setDeleting(false);
      setDeleteError(body.error ?? body.message ?? "Failed to delete lead.");
      return;
    }

    router.push("/exhibitor/leads");
    router.refresh();
  }

  return (
    <article className="relative w-full rounded-2xl border border-slate-200 bg-card p-6 shadow-sm ring-1 ring-slate-200/60">
      {canEdit ? (
        <div ref={actionsRef} className="absolute right-6 top-6 z-10" data-testid="lead-detail-actions-menu">
          <button
            type="button"
            aria-label="Lead actions"
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            onClick={() => {
              setDeleteError(null);
              setActionsOpen((open) => !open);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-600 text-white shadow-sm transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
            data-testid="lead-detail-actions-trigger"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
          {actionsOpen ? (
            <div
              role="menu"
              aria-label="Lead actions"
              className="absolute right-0 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl ring-1 ring-slate-900/5"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setActionsOpen(false);
                  setDeleteError(null);
                  setConfirmDeleteOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                data-testid="lead-detail-delete-action"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v5" />
                  <path d="M14 11v5" />
                </svg>
                Delete Lead
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {deleteError ? (
        <p
          className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 pr-12 text-sm text-rose-800"
          role="alert"
          data-testid="lead-detail-delete-error"
        >
          {deleteError}
        </p>
      ) : null}

      <fieldset
        disabled={!canEdit}
        data-readonly={!canEdit ? "true" : undefined}
        className="m-0 w-full border-0 p-0"
      >
        {error ? (
          <p
            className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="flex min-w-0 flex-row items-start gap-4 sm:gap-5">
            <ProfileAvatar leadId={leadId} name={draft.full_name} />
            <div className="min-w-0 flex-1 space-y-4">
              <div className="min-w-0">
                <label htmlFor={`lead-${leadId}-full_name`} className="sr-only">
                  Full name
                </label>
                <input
                  id={`lead-${leadId}-full_name`}
                  name={`lead-profile-name-${leadId}`}
                  value={draft.full_name}
                  onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))}
                  autoComplete="name"
                  spellCheck={false}
                  data-lpignore="true"
                  className="w-full min-w-0 rounded-lg border border-transparent bg-white px-0 py-0.5 text-left text-2xl font-bold tracking-tight text-slate-950 outline-none ring-0 transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 sm:text-3xl"
                  placeholder="Full name"
                />
              </div>
              <div className="grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3 lg:grid-cols-3">
                <label className="block min-w-0 sm:col-span-1" htmlFor={`lead-${leadId}-job_title`}>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Job title</span>
                  <input
                    id={`lead-${leadId}-job_title`}
                    value={draft.job_title}
                    onChange={(e) => setDraft((d) => ({ ...d, job_title: e.target.value }))}
                    autoComplete="organization-title"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    placeholder="Job title"
                  />
                </label>
                <label className="block min-w-0 sm:col-span-1" htmlFor={`lead-${leadId}-email`}>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</span>
                  <input
                    id={`lead-${leadId}-email`}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={draft.email}
                    onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    placeholder="name@company.com"
                    spellCheck={false}
                  />
                </label>
                <label className="block min-w-0 sm:col-span-1" htmlFor={`lead-${leadId}-company_text`}>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company</span>
                  <input
                    id={`lead-${leadId}-company_text`}
                    value={draft.company_text}
                    onChange={(e) => setDraft((d) => ({ ...d, company_text: e.target.value }))}
                    autoComplete="organization"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    placeholder="Company name"
                  />
                </label>
                <label className="block min-w-0 sm:col-span-1" htmlFor={`lead-${leadId}-linkedin_url`}>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">LinkedIn URL</span>
                  <input
                    id={`lead-${leadId}-linkedin_url`}
                    value={draft.linkedin_url}
                    onChange={(e) => setDraft((d) => ({ ...d, linkedin_url: e.target.value }))}
                    autoComplete="url"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    placeholder="https://www.linkedin.com/in/…"
                    spellCheck={false}
                  />
                  {linkedinDisplayOk ? (
                    <a
                      className="mt-1 inline-block text-xs font-medium text-indigo-600 underline-offset-2 hover:underline"
                      href={linkedinHref}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Open profile
                    </a>
                  ) : null}
                </label>
                <label className="block min-w-0 sm:col-span-1" htmlFor={`lead-${leadId}-company_domain`}>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company website</span>
                  <input
                    id={`lead-${leadId}-company_domain`}
                    value={draft.company_domain}
                    onChange={(e) => setDraft((d) => ({ ...d, company_domain: e.target.value }))}
                    autoComplete="url"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    placeholder="example.com"
                    spellCheck={false}
                  />
                  {domainHref ? (
                    <a
                      className="mt-1 inline-block text-xs font-medium text-indigo-600 underline-offset-2 hover:underline"
                      href={domainHref}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Open website
                    </a>
                  ) : null}
                </label>
                <label className="block min-w-0 sm:col-span-1" htmlFor={`lead-${leadId}-industry`}>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Industry</span>
                  <input
                    id={`lead-${leadId}-industry`}
                    value={draft.industry}
                    onChange={(e) => setDraft((d) => ({ ...d, industry: e.target.value }))}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    placeholder="Industry"
                  />
                </label>
                <label className="block min-w-0 sm:col-span-1" htmlFor={`lead-${leadId}-company_size`}>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company size</span>
                  <input
                    id={`lead-${leadId}-company_size`}
                    value={draft.company_size}
                    onChange={(e) => setDraft((d) => ({ ...d, company_size: e.target.value }))}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    placeholder="e.g. 51–200"
                  />
                </label>
                <label className="block min-w-0 sm:col-span-1" htmlFor={`lead-${leadId}-seniority`}>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seniority</span>
                  <input
                    id={`lead-${leadId}-seniority`}
                    value={draft.seniority}
                    onChange={(e) => setDraft((d) => ({ ...d, seniority: e.target.value }))}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    placeholder="Seniority"
                  />
                </label>
              </div>

              <IntentSignalsEditor
                leadId={leadId}
                signals={draft.intent_signals}
                disabled={saving}
                onChange={(next) => setDraft((d) => ({ ...d, intent_signals: next }))}
              />
            </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <ProfileStatCard label="Lead rating">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-0.5" role="group" aria-label="Rating 0 to 5">
                {stars.map((filled, index) => (
                  <button
                    key={`star-${index}`}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, rating: index + 1 }))}
                    className={`rounded p-0.5 text-xl leading-none transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                      filled ? "text-blue-600" : "text-slate-300"
                    }`}
                    aria-label={`Set rating to ${index + 1}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, rating: 0 }))}
                className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
              >
                Clear
              </button>
              <span className="text-sm font-medium text-slate-500">{draft.rating}/5</span>
            </div>
          </ProfileStatCard>

          <ProfileStatCard label="Temperature">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, temperature: null }))}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${temperatureButtonClass(
                  null,
                  draft.temperature === null
                )}`}
                aria-pressed={draft.temperature === null}
              >
                Unassessed
              </button>
              {LEAD_TEMPERATURE_VALUES.map((value) => (
                <button
                  key={`temperature-${value}`}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, temperature: value }))}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${temperatureButtonClass(
                    value,
                    draft.temperature === value
                  )}`}
                  aria-pressed={draft.temperature === value}
                >
                  {LEAD_TEMPERATURE_LABEL[value]}
                </button>
              ))}
            </div>
          </ProfileStatCard>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Lead metadata</p>
          <div className="mt-3 grid gap-3 text-[11px] leading-relaxed text-slate-500 sm:grid-cols-3 sm:gap-4">
            <p>
              <span className="block text-slate-400">Created</span>
              <span className="font-medium text-slate-600">{createdAtLabel}</span>
            </p>
            <p>
              <span className="block text-slate-400">Event</span>
              <span className="font-medium text-slate-600">{eventName}</span>
            </p>
            <p>
              <span className="block text-slate-400">Location</span>
              <span className="font-medium text-slate-600">{locationLabel}</span>
            </p>
          </div>
        </div>
      </fieldset>

      {confirmDeleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="lead-delete-confirm-dialog">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => {
              if (!deleting) setConfirmDeleteOpen(false);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="lead-delete-confirm-title"
            className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-700">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v5" />
                <path d="M14 11v5" />
              </svg>
            </div>
            <h2 id="lead-delete-confirm-title" className="mt-4 text-lg font-bold text-slate-950">
              Delete this lead?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This will permanently delete <span className="font-semibold text-slate-900">{draft.full_name || "this lead"}</span>.
              This action cannot be undone.
            </p>
            {deleteError ? (
              <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDeleteOpen(false)}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
              >
                Keep lead
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void deleteLead()}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
                data-testid="lead-delete-confirm-submit"
              >
                {deleting ? "Deleting..." : "Delete Lead"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
