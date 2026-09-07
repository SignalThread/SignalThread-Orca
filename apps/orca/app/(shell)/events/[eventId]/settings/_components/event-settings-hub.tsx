"use client";

import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  DollarSign,
  FileCheck2,
  LayoutGrid,
  Monitor,
  Package,
  Shield,
  Signpost,
  SlidersHorizontal,
  Tags,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MATRIX2_TEMPLATES } from "../../../../matrix-2/_components/types";
import { EventDangerActions } from "../../_components/event-danger-actions";
import { SessionRequirementsSettings } from "./session-requirements-settings";
import { EVENT_LIFECYCLE_META, EVENT_STATUS_VALUES, type EventStatusValue } from "@/lib/event-lifecycle";
import { getTimezoneOptions } from "@/lib/timezones";
import {
  ORCA_APPROVED_EVENT_TERMS,
  type OrcaEventTerminologyOverrides,
  type OrcaTerminology,
  type EventTerminologyEnvelope,
} from "@/lib/orca-terminology-contract";
import { useEventTerminology } from "@/components/event-terminology-context";

type SettingsDetail = "overview" | "terminology" | "session-types" | "av" | "staffing" | "supplies" | "signage" | "status" | "workspace-actions";

type EventSettingsHubProps = {
  eventId: string;
  canEdit: boolean;
  clients: Array<{ id: string; name: string }>;
  initialEvent: EventDetailsFormValues;
  initialApprovalWorkflows: ApprovalWorkflowValues;
  initialTerminology: EventTerminologyEnvelope;
};

type ApprovalWorkflowValues = {
  budgetApprovalsEnabled: boolean;
  documentApprovalsEnabled: boolean;
};

type EventDetailsFormValues = {
  name: string;
  startDate: string;
  endDate: string;
  timezone: string;
  venueName: string;
  clientId: string;
  status: EventStatusValue;
};

type SettingsCard = {
  id: Exclude<SettingsDetail, "overview">;
  icon: ReactNode;
  title: string;
  description: string;
  meta?: string;
  disabled?: boolean;
  actionLabel?: string;
};

function CardButton({ card, onOpen }: { card: SettingsCard; onOpen: (detail: SettingsDetail) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(card.id)}
      className="group flex min-h-[148px] w-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#28439A]/30 hover:shadow-md"
    >
      <span>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-[#28439A] ring-1 ring-slate-200">
          {card.icon}
        </span>
        <span className="mt-3 block text-[15px] font-semibold text-slate-950">{card.title}</span>
        <span className="mt-1 block text-[13px] leading-5 text-slate-600">{card.description}</span>
      </span>
      <span className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[12px] font-medium text-slate-500">{card.meta}</span>
        <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[12px] font-semibold text-slate-700 transition group-hover:border-[#28439A]/25 group-hover:bg-white group-hover:text-[#28439A]">
          {card.actionLabel ?? "Manage"}
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </span>
    </button>
  );
}

function CategorySection({
  eyebrow,
  title,
  description,
  cards,
  onOpen,
}: {
  eyebrow: string;
  title: string;
  description: string;
  cards: SettingsCard[];
  onOpen: (detail: SettingsDetail) => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#28439A]">{eyebrow}</p>
        <h3 className="mt-1 text-[20px] font-semibold text-slate-950">{title}</h3>
        <p className="mt-1 max-w-3xl text-[13px] leading-5 text-slate-600">{description}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <CardButton key={card.id} card={card} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function SessionTypesDetail({ onBack }: { onBack: () => void }) {
  const terminology = useEventTerminology();
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Settings
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[20px] leading-[24px] font-semibold text-slate-900">Built-in session types</h3>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-slate-600">
            View the starter chips, filters, and grouping options shown in {terminology.runOfShow}.
          </p>
        </div>
        <span className="inline-flex h-9 items-center rounded-full border border-amber-200 bg-amber-50 px-3 text-[12px] font-semibold text-amber-800">
          Read-only defaults
        </span>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-[13px] leading-5 text-amber-900">
        Custom session types need an event-scoped session type model before add, edit, or delete can be made safely. The current {terminology.runOfShow} uses these built-in templates plus per-session free-text type values.
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MATRIX2_TEMPLATES.map((template) => (
          <div key={template.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#28439A] ring-1 ring-slate-200">
                <Tags className="h-4 w-4" />
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                Default
              </span>
            </div>
            <h4 className="mt-3 text-[15px] font-semibold text-slate-950">{template.label}</h4>
            <p className="mt-1 text-[12px] text-slate-500">{template.durationMinutes} min starter template</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const TERMINOLOGY_FIELDS: Array<{ key: keyof OrcaTerminology; label: string; help: string }> = [
  { key: "agenda", label: "Agenda", help: "Attendee-facing schedules and public projections." },
  { key: "runOfShow", label: "Run of Show", help: "Navigation and the room-by-time operations board." },
  { key: "matrix", label: "Matrix", help: "Matrix-specific supporting copy." },
  { key: "showFlow", label: "Show Flow", help: "Session cue and production-flow detail." },
];

function EventTerminologySettings({ eventId, canEdit, initialTerminology }: EventSettingsHubProps) {
  const router = useRouter();
  const [values, setValues] = useState<OrcaEventTerminologyOverrides>(initialTerminology.overrides);
  const [saved, setSaved] = useState<OrcaEventTerminologyOverrides>(initialTerminology.overrides);
  const [version, setVersion] = useState(initialTerminology.updatedAt);
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);

  useEffect(() => {
    setValues(initialTerminology.overrides);
    setSaved(initialTerminology.overrides);
    setVersion(initialTerminology.updatedAt);
  }, [initialTerminology]);

  async function save() {
    if (!canEdit || !dirty || state === "saving") return;
    setState("saving");
    setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/terminology`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, expectedUpdatedAt: version }),
      });
      const payload = await response.json() as EventTerminologyEnvelope & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to save display terminology.");
      setValues(payload.overrides);
      setSaved(payload.overrides);
      setVersion(payload.updatedAt);
      setState("success");
      setMessage("Event display terminology saved.");
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to save display terminology.");
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#28439A]">Display labels</p>
          <h3 className="mt-1 text-[20px] font-semibold text-slate-950">Event terminology</h3>
          <p className="mt-1 max-w-3xl text-[13px] leading-5 text-slate-600">Choose approved labels for this event. Inherit uses the organization label; internal routes, API fields, permissions, and analytics keys do not change.</p>
        </div>
        {!canEdit ? <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-semibold text-slate-600">Read-only access</span> : null}
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {TERMINOLOGY_FIELDS.map((field) => (
          <label key={field.key} className="text-[12px] font-semibold text-slate-700">
            {field.label} display label
            <select
              value={values[field.key] ?? ""}
              onChange={(event) => {
                setValues((current) => ({ ...current, [field.key]: (event.target.value || null) as OrcaEventTerminologyOverrides[typeof field.key] }));
                setState("idle");
                setMessage("");
              }}
              disabled={!canEdit || state === "saving"}
              className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-900 outline-none focus:border-[#28439A] focus:ring-2 focus:ring-[#28439A]/15 disabled:cursor-not-allowed disabled:bg-slate-50"
            >
              <option value="">Inherit organization label ({initialTerminology.organizationTerms[field.key]})</option>
              {ORCA_APPROVED_EVENT_TERMS.map((term) => <option key={term} value={term}>{term}</option>)}
            </select>
            <span className="mt-1 block font-normal leading-5 text-slate-500">{field.help}</span>
          </label>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" disabled={!canEdit || !dirty || state === "saving"} onClick={() => void save()} className="inline-flex h-10 items-center rounded-xl bg-[#28439A] px-4 text-[13px] font-semibold text-white transition hover:bg-[#20377f] disabled:cursor-not-allowed disabled:opacity-50">{state === "saving" ? "Saving…" : "Save labels"}</button>
        <button type="button" disabled={!canEdit || !dirty || state === "saving"} onClick={() => { setValues(saved); setState("idle"); setMessage(""); }} className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Discard changes</button>
        <button type="button" disabled={!canEdit || state === "saving"} onClick={() => setValues({ agenda: null, runOfShow: null, matrix: null, showFlow: null })} className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Use organization labels</button>
        {message ? <p role={state === "error" ? "alert" : "status"} className={`text-[13px] font-medium ${state === "error" ? "text-rose-700" : "text-emerald-700"}`}>{message}</p> : null}
      </div>
    </section>
  );
}

function EventDetailsSettings({
  eventId,
  canEdit,
  clients,
  initialEvent,
}: EventSettingsHubProps) {
  const router = useRouter();
  const [values, setValues] = useState<EventDetailsFormValues>(initialEvent);
  const [savedValues, setSavedValues] = useState<EventDetailsFormValues>(initialEvent);
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);
  const isDirty = JSON.stringify(values) !== JSON.stringify(savedValues);

  useEffect(() => {
    setValues(initialEvent);
    setSavedValues(initialEvent);
  }, [initialEvent]);

  function update<K extends keyof EventDetailsFormValues>(key: K, value: EventDetailsFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setState("idle");
    setMessage("");
  }

  async function save() {
    if (!canEdit || !isDirty || state === "saving") return;
    const name = values.name.trim();
    if (!name) {
      setState("error");
      setMessage("Event name is required.");
      return;
    }
    if (values.endDate && values.startDate > values.endDate) {
      setState("error");
      setMessage("Start date cannot be after end date.");
      return;
    }

    setState("saving");
    setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          startDate: values.startDate,
          endDate: values.endDate || null,
          timezone: values.timezone,
          venueName: values.venueName.trim() || null,
          clientId: values.clientId || null,
          status: values.status,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to save event details.");

      const nextValues = { ...values, name, venueName: values.venueName.trim() };
      setValues(nextValues);
      setSavedValues(nextValues);
      setState("success");
      setMessage("Event details saved.");
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to save event details.");
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#28439A]">Event</p>
          <h3 className="mt-1 text-[20px] font-semibold text-slate-950">Event details</h3>
          <p className="mt-1 text-[13px] leading-5 text-slate-600">Core details used across this event workspace.</p>
        </div>
        {!canEdit && (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-semibold text-slate-600">
            Read-only access
          </span>
        )}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-[12px] font-semibold text-slate-700 md:col-span-2 xl:col-span-2">
          Event name
          <input value={values.name} onChange={(event) => update("name", event.target.value)} disabled={!canEdit || state === "saving"} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] font-medium text-slate-900 outline-none focus:border-[#28439A] focus:ring-2 focus:ring-[#28439A]/15 disabled:cursor-not-allowed disabled:bg-slate-50" />
        </label>
        <label className="text-[12px] font-semibold text-slate-700">
          Event status
          <select value={values.status} onChange={(event) => update("status", event.target.value as EventStatusValue)} disabled={!canEdit || state === "saving"} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-900 outline-none focus:border-[#28439A] focus:ring-2 focus:ring-[#28439A]/15 disabled:cursor-not-allowed disabled:bg-slate-50">
            {EVENT_STATUS_VALUES.map((status) => <option key={status} value={status}>{EVENT_LIFECYCLE_META[status].label}</option>)}
          </select>
        </label>
        <label className="text-[12px] font-semibold text-slate-700">
          Start date
          <input type="date" value={values.startDate} onChange={(event) => update("startDate", event.target.value)} disabled={!canEdit || state === "saving"} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-900 outline-none focus:border-[#28439A] focus:ring-2 focus:ring-[#28439A]/15 disabled:cursor-not-allowed disabled:bg-slate-50" />
        </label>
        <label className="text-[12px] font-semibold text-slate-700">
          End date
          <input type="date" value={values.endDate} min={values.startDate || undefined} onChange={(event) => update("endDate", event.target.value)} disabled={!canEdit || state === "saving"} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-900 outline-none focus:border-[#28439A] focus:ring-2 focus:ring-[#28439A]/15 disabled:cursor-not-allowed disabled:bg-slate-50" />
        </label>
        <label className="text-[12px] font-semibold text-slate-700">
          Time zone
          <select value={values.timezone} onChange={(event) => update("timezone", event.target.value)} disabled={!canEdit || state === "saving"} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-900 outline-none focus:border-[#28439A] focus:ring-2 focus:ring-[#28439A]/15 disabled:cursor-not-allowed disabled:bg-slate-50">
            {!timezoneOptions.some((option) => option.value === values.timezone) && <option value={values.timezone}>{values.timezone}</option>}
            {timezoneOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="text-[12px] font-semibold text-slate-700">
          Location / venue
          <input value={values.venueName} onChange={(event) => update("venueName", event.target.value)} disabled={!canEdit || state === "saving"} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-900 outline-none focus:border-[#28439A] focus:ring-2 focus:ring-[#28439A]/15 disabled:cursor-not-allowed disabled:bg-slate-50" />
        </label>
        {clients.length > 0 && (
          <label className="text-[12px] font-semibold text-slate-700">
            Client
            <select value={values.clientId} onChange={(event) => update("clientId", event.target.value)} disabled={!canEdit || state === "saving"} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-900 outline-none focus:border-[#28439A] focus:ring-2 focus:ring-[#28439A]/15 disabled:cursor-not-allowed disabled:bg-slate-50">
              <option value="">No client</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p aria-live="polite" className={`text-[13px] ${state === "error" ? "text-red-700" : state === "success" ? "text-emerald-700" : "text-slate-500"}`}>
          {message || (canEdit ? "Dates are saved as event calendar days." : "You need editor access to change event details.")}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setValues(savedValues); setState("idle"); setMessage(""); }} disabled={!canEdit || !isDirty || state === "saving"} className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            Cancel changes
          </button>
          <button type="button" onClick={() => void save()} disabled={!canEdit || !isDirty || state === "saving"} className="inline-flex h-9 items-center rounded-lg bg-[#28439A] px-3.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#20377e] disabled:cursor-not-allowed disabled:bg-slate-300">
            {state === "saving" ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </section>
  );
}

function ApprovalWorkflowsSettings({ eventId, canEdit, initialApprovalWorkflows }: EventSettingsHubProps) {
  const router = useRouter();
  const [values, setValues] = useState(initialApprovalWorkflows);
  const [saving, setSaving] = useState<keyof ApprovalWorkflowValues | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => setValues(initialApprovalWorkflows), [initialApprovalWorkflows]);

  async function toggle(key: keyof ApprovalWorkflowValues) {
    if (!canEdit || saving) return;
    const nextValue = !values[key];
    setSaving(key);
    setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [key]: nextValue }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to update approval workflow.");
      setValues((current) => ({ ...current, [key]: nextValue }));
      setMessage("Approval workflow saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update approval workflow.");
    } finally {
      setSaving(null);
    }
  }

  const cards: Array<{ key: keyof ApprovalWorkflowValues; title: string; description: string; icon: ReactNode }> = [
    { key: "budgetApprovalsEnabled", title: "Budget approvals", description: "Require review submissions before budget line-item approvals are managed.", icon: <DollarSign className="h-5 w-5" /> },
    { key: "documentApprovalsEnabled", title: "Document approvals", description: "Enable review requests and approval decisions for event documents.", icon: <FileCheck2 className="h-5 w-5" /> },
  ];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#28439A]">Approvals</p>
          <h3 className="mt-1 text-[20px] font-semibold text-slate-950">Approval workflows</h3>
          <p className="mt-1 max-w-3xl text-[13px] leading-5 text-slate-600">Control whether new budget and document approval requests are available for this event.</p>
        </div>
        <p aria-live="polite" className="text-[12px] font-medium text-slate-500">{message || (canEdit ? "Changes save immediately." : "Read-only access")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => {
          const enabled = values[card.key];
          const isSaving = saving === card.key;
          return (
            <div key={card.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-[#28439A] ring-1 ring-slate-200">{card.icon}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`${card.title} ${enabled ? "enabled" : "disabled"}`}
                  onClick={() => void toggle(card.key)}
                  disabled={!canEdit || Boolean(saving)}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28439A] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${enabled ? "bg-[#28439A]" : "bg-slate-300"}`}
                >
                  <span className={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
              <h4 className="mt-3 text-[15px] font-semibold text-slate-950">{card.title}</h4>
              <p className="mt-1 text-[13px] leading-5 text-slate-600">{card.description}</p>
              <p className={`mt-4 text-[12px] font-semibold ${enabled ? "text-emerald-700" : "text-slate-500"}`}>{isSaving ? "Saving…" : enabled ? "Enabled" : "Disabled"}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function EventSettingsHub(props: EventSettingsHubProps) {
  const { eventId } = props;
  const [activeDetail, setActiveDetail] = useState<SettingsDetail>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("section") === "session-types"
      ? "session-types"
      : "overview",
  );

  const runOfShowCards = useMemo<SettingsCard[]>(() => [
    {
      id: "session-types",
      icon: <Tags className="h-5 w-5" />,
      title: "Built-in session types",
      description: `View the read-only starter types used in ${props.initialTerminology.terms.runOfShow}.`,
      meta: `${MATRIX2_TEMPLATES.length} default types`,
      actionLabel: "View defaults",
    },
    {
      id: "av",
      icon: <Monitor className="h-5 w-5" />,
      title: "AV Requirements",
      description: "Manage reusable AV options for sessions.",
      meta: "Reusable checklist",
    },
    {
      id: "staffing",
      icon: <UsersRound className="h-5 w-5" />,
      title: "Staffing",
      description: "Manage staffing options used during session planning.",
      meta: "Session planning",
    },
    {
      id: "supplies",
      icon: <Package className="h-5 w-5" />,
      title: "Supplies",
      description: "Manage permanent supply options and quantities for sessions.",
      meta: "Operational checklist",
    },
    {
      id: "signage",
      icon: <Signpost className="h-5 w-5" />,
      title: "Signage",
      description: "Manage permanent signage and wayfinding options for sessions.",
      meta: "Operational checklist",
    },
    {
      id: "status",
      icon: <BadgeCheck className="h-5 w-5" />,
      title: "Status options",
      description: "Manage planning statuses used across sessions.",
      meta: "Workflow labels",
    },
  ], [props.initialTerminology.terms.runOfShow]);

  const workspaceCards = useMemo<SettingsCard[]>(() => [
    {
      id: "terminology",
      icon: <Tags className="h-5 w-5" />,
      title: "Display terminology",
      description: "Choose approved event-level labels for schedules and show operations.",
      meta: "Event overrides",
    },
    {
      id: "workspace-actions",
      icon: <Shield className="h-5 w-5" />,
      title: "Workspace actions",
      description: "Manage event-level actions that affect this workspace.",
      meta: "Event controls",
    },
  ], []);

  if (activeDetail === "terminology") {
    return <EventTerminologySettings {...props} />;
  }

  if (activeDetail === "session-types") {
    return <SessionTypesDetail onBack={() => setActiveDetail("overview")} />;
  }

  if (activeDetail === "av") {
    return (
      <SessionRequirementsSettings
        eventId={eventId}
        focusCatalogType="AV"
        title="AV Requirements"
        description="Manage reusable AV options for sessions."
        onBack={() => setActiveDetail("overview")}
      />
    );
  }

  if (activeDetail === "staffing") {
    return (
      <SessionRequirementsSettings
        eventId={eventId}
        focusCatalogType="STAFFING"
        title="Staffing"
        description="Manage staffing options used during session planning."
        onBack={() => setActiveDetail("overview")}
      />
    );
  }

  if (activeDetail === "supplies") {
    return (
      <SessionRequirementsSettings
        eventId={eventId}
        focusCatalogType="SUPPLIES"
        title="Supplies"
        description="Manage permanent supply options and quantities for sessions."
        onBack={() => setActiveDetail("overview")}
      />
    );
  }

  if (activeDetail === "signage") {
    return (
      <SessionRequirementsSettings
        eventId={eventId}
        focusCatalogType="SIGNAGE"
        title="Signage"
        description="Manage permanent signage and wayfinding options for sessions."
        onBack={() => setActiveDetail("overview")}
      />
    );
  }

  if (activeDetail === "status") {
    return (
      <SessionRequirementsSettings
        eventId={eventId}
        focusCatalogType="STATUS"
        title="Status options"
        description="Manage planning statuses used across sessions."
        onBack={() => setActiveDetail("overview")}
      />
    );
  }

  if (activeDetail === "workspace-actions") {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveDetail("overview")}
          className="mb-3 inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Settings
        </button>
        <h3 className="text-[20px] leading-[24px] font-semibold text-slate-900">Workspace actions</h3>
        <p className="mt-1 max-w-2xl text-[13px] leading-5 text-slate-600">
          Manage event-level actions that affect this workspace.
        </p>
        <EventDangerActions eventId={eventId} />
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[26px] leading-[32px] font-semibold text-slate-950">Event settings</h2>
            <p className="mt-2 max-w-3xl text-[14px] leading-6 text-slate-600">
              Manage workspace configuration, defaults, and module options for this event.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
              <LayoutGrid className="mx-auto h-4 w-4 text-[#28439A]" />
              <p className="mt-1 text-[11px] font-semibold text-slate-600">Modules</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
              <SlidersHorizontal className="mx-auto h-4 w-4 text-[#28439A]" />
              <p className="mt-1 text-[11px] font-semibold text-slate-600">Defaults</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
              <CalendarDays className="mx-auto h-4 w-4 text-[#28439A]" />
              <p className="mt-1 text-[11px] font-semibold text-slate-600">Event</p>
            </div>
          </div>
        </div>
      </div>

      <EventDetailsSettings {...props} />

      <CategorySection
        eyebrow={props.initialTerminology.terms.runOfShow}
        title={`${props.initialTerminology.terms.runOfShow} settings`}
        description="Configure the reusable options that appear while planning sessions."
        cards={runOfShowCards}
        onOpen={setActiveDetail}
      />

      <ApprovalWorkflowsSettings {...props} />

      <CategorySection
        eyebrow="Event workspace"
        title="Event workspace settings"
        description="Manage supported workspace-level controls for this event."
        cards={workspaceCards}
        onOpen={setActiveDetail}
      />
    </section>
  );
}
