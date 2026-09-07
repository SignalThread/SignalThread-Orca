"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, ExternalLink, FileCheck2, Pencil, Plus, ShieldCheck, X } from "lucide-react";
import { EVENT_MODULE_PRIMARY_CLASS, EventModuleHeader, EventModuleSurface } from "../_components/event-module-header";

type Area = "EMERGENCY_PLAN" | "SECURITY_PLAN" | "COMPLIANCE_PERMITS";
type RecordStatus = "NEEDS_REVIEW" | "IN_PROGRESS" | "APPROVED" | "NOT_STARTED" | "CONFIRMED" | "AT_RISK";
type RecordItem = { id: string; area: Area; title: string; status: RecordStatus; owner: string | null; dueDate: string | null; reviewedAt: string | null; details: string | null; evidenceUrl: string | null };
type ApiPayload = { records: RecordItem[]; canEdit: boolean; readiness: { ready: number; needsWork: number; atRisk: number }; error?: string };

const AREAS: Array<{ id: Area; label: string; eyebrow: string; description: string; empty: string; titleLabel: string }> = [
  { id: "EMERGENCY_PLAN", label: "Emergency Plan", eyebrow: "Canonical event plan", description: "Coordinate response roles, contacts, procedures, evacuation points, and critical plan references.", empty: "Add the first emergency role, procedure, contact, evacuation point, or critical document.", titleLabel: "Plan element" },
  { id: "SECURITY_PLAN", label: "Security Plan", eyebrow: "Event-wide coverage", description: "Track security leadership, coverage, access controls, protection measures, and escalation confirmations.", empty: "Add the first security lead, coverage measure, access control, or escalation step.", titleLabel: "Security measure" },
  { id: "COMPLIANCE_PERMITS", label: "Compliance & Permits", eyebrow: "Requirements and evidence", description: "Own permits, insurance, licenses, training, and other operational requirements without jurisdiction-specific advice.", empty: "Add the first permit, insurance item, license, training, or operational requirement.", titleLabel: "Requirement" },
];
const PLAN_STATUSES: Array<{ value: RecordStatus; label: string }> = [
  { value: "NEEDS_REVIEW", label: "Needs review" }, { value: "IN_PROGRESS", label: "In progress" },
  { value: "APPROVED", label: "Approved" }, { value: "AT_RISK", label: "At risk" },
];
const PERMIT_STATUSES: Array<{ value: RecordStatus; label: string }> = [
  { value: "NOT_STARTED", label: "Not started" }, { value: "IN_PROGRESS", label: "In progress" },
  { value: "CONFIRMED", label: "Confirmed" }, { value: "AT_RISK", label: "At risk" },
];

function prettyStatus(status: string) { return status.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase()); }
function statusTone(status: RecordStatus, dueDate: string | null) {
  const ready = status === "APPROVED" || status === "CONFIRMED";
  const overdue = !ready && Boolean(dueDate) && new Date(dueDate as string).getTime() < Date.now();
  if (ready) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (overdue || status === "AT_RISK") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}
function dateInputValue(value: string | null) { return value ? value.slice(0, 10) : ""; }

export function SecurityComplianceWorkspace({ eventId }: { eventId: string }) {
  const [activeArea, setActiveArea] = useState<Area>("EMERGENCY_PLAN");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [readiness, setReadiness] = useState({ ready: 0, needsWork: 0, atRisk: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecordItem | null | "new">(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/security-compliance`, { cache: "no-store" });
      const payload = await response.json() as ApiPayload;
      if (!response.ok) throw new Error(payload.error ?? "Unable to load Security & Compliance");
      if (!Array.isArray(payload.records) || !payload.readiness) throw new Error("Security & Compliance returned an invalid response. Reload the page and try again.");
      setRecords(payload.records); setCanEdit(payload.canEdit); setReadiness(payload.readiness);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Unable to load Security & Compliance"); }
    finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);
  const area = AREAS.find((candidate) => candidate.id === activeArea) ?? AREAS[0];
  const visibleRecords = useMemo(() => records.filter((record) => record.area === activeArea), [activeArea, records]);

  async function save(form: FormData) {
    setSaving(true); setError(null);
    const isNew = editing === "new";
    const payload = { ...(isNew ? { area: activeArea } : { id: editing?.id }), title: form.get("title"), owner: form.get("owner"), dueDate: form.get("dueDate"), status: form.get("status"), details: form.get("details"), evidenceUrl: form.get("evidenceUrl") };
    try {
      const response = await fetch(`/api/events/${eventId}/security-compliance`, { method: isNew ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to save this item");
      setEditing(null); await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to save this item"); }
    finally { setSaving(false); }
  }

  return <div className="space-y-5 pb-10">
    <EventModuleSurface>
      <EventModuleHeader title="Security & Compliance" subtitle="Event-level operational readiness for emergency response, security planning, and permits." badge="Onsite"
        stats={[{ label: "Ready", value: String(readiness.ready), tone: "good" }, { label: "Needs work", value: String(readiness.needsWork), tone: "warning" }, { label: "Overdue / at risk", value: String(readiness.atRisk), tone: "critical" }]}
        actions={canEdit ? <button type="button" onClick={() => setEditing("new")} className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold transition hover:bg-[#20377f] ${EVENT_MODULE_PRIMARY_CLASS}`}><Plus className="h-4 w-4" aria-hidden /> Add {area.id === "COMPLIANCE_PERMITS" ? "requirement" : "plan item"}</button> : <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">View only</span>}
      />
    </EventModuleSurface>

    <EventModuleSurface paddingClassName="p-3 sm:p-4">
      <div className="grid gap-2 md:grid-cols-3" role="tablist" aria-label="Security and Compliance work areas">
        {AREAS.map((candidate) => { const count = records.filter((record) => record.area === candidate.id).length; const selected = candidate.id === activeArea; return <button key={candidate.id} type="button" role="tab" aria-selected={selected} onClick={() => setActiveArea(candidate.id)} className={`rounded-2xl border p-4 text-left transition ${selected ? "border-[#28439A] bg-[#28439A]/5 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}><span className={`text-[13px] font-semibold ${selected ? "text-[#28439A]" : "text-slate-900"}`}>{candidate.label}</span><span className="mt-1 block text-[11px] text-slate-500">{count} {count === 1 ? "item" : "items"}</span></button>; })}
      </div>
    </EventModuleSurface>

    <EventModuleSurface>
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#28439A]/8 text-[#28439A]">{activeArea === "EMERGENCY_PLAN" ? <ShieldCheck className="h-5 w-5" aria-hidden /> : activeArea === "SECURITY_PLAN" ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <FileCheck2 className="h-5 w-5" aria-hidden />}</span><div><p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">{area.eyebrow}</p><h2 className="mt-1 text-lg font-semibold text-slate-950">{area.label}</h2><p className="mt-1 max-w-3xl text-[13px] leading-5 text-slate-600">{area.description}</p></div></div>
      </div>

      {error ? <div role="alert" className="mt-5 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" aria-hidden /><div><p className="text-sm font-semibold text-rose-900">Security &amp; Compliance could not be loaded</p><p className="mt-1 text-xs text-rose-700">{error}</p></div></div><button type="button" onClick={() => void load()} className="self-start rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-800">Try again</button></div> : null}

      {loading ? <div className="mt-5 grid gap-3" aria-label="Loading Security and Compliance items">{[0, 1].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}</div>
      : visibleRecords.length === 0 && !error ? <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-10 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-slate-400" aria-hidden /><h3 className="mt-3 text-sm font-semibold text-slate-900">No {area.label.toLowerCase()} items yet</h3><p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-slate-500">{area.empty}</p>{canEdit ? <button type="button" onClick={() => setEditing("new")} className="mt-4 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Add the first item</button> : null}</div>
      : <div className="mt-5 grid gap-3">{visibleRecords.map((record) => <article key={record.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-slate-950">{record.title}</h3><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(record.status, record.dueDate)}`}>{prettyStatus(record.status)}</span></div><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500"><span><strong className="font-semibold text-slate-700">Owner:</strong> {record.owner ?? "Unassigned"}</span>{record.dueDate ? <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" aria-hidden />{activeArea === "COMPLIANCE_PERMITS" ? "Due" : "Review"} {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(record.dueDate))}</span> : null}</div>{record.details ? <p className="mt-3 whitespace-pre-wrap text-[13px] leading-5 text-slate-700">{record.details}</p> : null}{record.evidenceUrl ? <a href={record.evidenceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#28439A] hover:underline">Open evidence or plan reference <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a> : null}</div>{canEdit ? <button type="button" onClick={() => setEditing(record)} className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" aria-hidden /> Edit</button> : null}</div></article>)}</div>}
    </EventModuleSurface>

    <p className="px-1 text-[11px] leading-5 text-slate-500">Restricted incident narratives are intentionally excluded until OrcaOS has a dedicated server-enforced role boundary for those records.</p>

    {editing ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditing(null); }}><div role="dialog" aria-modal="true" aria-labelledby="security-item-dialog-title" className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl"><div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-6"><div><p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#28439A]">{area.label}</p><h2 id="security-item-dialog-title" className="mt-1 text-lg font-semibold text-slate-950">{editing === "new" ? `Add ${area.titleLabel.toLowerCase()}` : `Edit ${area.titleLabel.toLowerCase()}`}</h2></div><button type="button" onClick={() => setEditing(null)} disabled={saving} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
      <form action={(form) => void save(form)} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <label className="grid gap-1.5 sm:col-span-2"><span className="text-xs font-semibold text-slate-700">{area.titleLabel}</span><input required name="title" defaultValue={editing === "new" ? "" : editing.title} placeholder={activeArea === "EMERGENCY_PLAN" ? "e.g. Medical response lead" : activeArea === "SECURITY_PLAN" ? "e.g. VIP access control" : "e.g. Certificate of insurance"} className="h-10 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-[#28439A] focus:ring-2 focus:ring-[#28439A]/10" /></label>
        <label className="grid gap-1.5"><span className="text-xs font-semibold text-slate-700">Owner</span><input name="owner" defaultValue={editing === "new" ? "" : editing.owner ?? ""} placeholder="Person or team" className="h-10 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-[#28439A] focus:ring-2 focus:ring-[#28439A]/10" /></label>
        <label className="grid gap-1.5"><span className="text-xs font-semibold text-slate-700">{activeArea === "COMPLIANCE_PERMITS" ? "Due date" : "Review date"}</span><input type="date" name="dueDate" defaultValue={editing === "new" ? "" : dateInputValue(editing.dueDate)} className="h-10 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-[#28439A] focus:ring-2 focus:ring-[#28439A]/10" /></label>
        <label className="grid gap-1.5 sm:col-span-2"><span className="text-xs font-semibold text-slate-700">Status</span><select name="status" defaultValue={editing === "new" ? (activeArea === "COMPLIANCE_PERMITS" ? "NOT_STARTED" : "NEEDS_REVIEW") : editing.status} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#28439A] focus:ring-2 focus:ring-[#28439A]/10">{(activeArea === "COMPLIANCE_PERMITS" ? PERMIT_STATUSES : PLAN_STATUSES).map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
        <label className="grid gap-1.5 sm:col-span-2"><span className="text-xs font-semibold text-slate-700">Operational details</span><textarea name="details" defaultValue={editing === "new" ? "" : editing.details ?? ""} rows={5} placeholder="Response steps, coverage, contacts, confirmation notes, or next action" className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#28439A] focus:ring-2 focus:ring-[#28439A]/10" /></label>
        <label className="grid gap-1.5 sm:col-span-2"><span className="text-xs font-semibold text-slate-700">Evidence or plan reference link</span><input type="url" name="evidenceUrl" defaultValue={editing === "new" ? "" : editing.evidenceUrl ?? ""} placeholder="https://" className="h-10 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-[#28439A] focus:ring-2 focus:ring-[#28439A]/10" /></label>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 sm:col-span-2"><button type="button" onClick={() => setEditing(null)} disabled={saving} className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700">Cancel</button><button type="submit" disabled={saving} className={`h-10 rounded-xl px-4 text-xs font-semibold disabled:opacity-60 ${EVENT_MODULE_PRIMARY_CLASS}`}>{saving ? "Saving…" : editing === "new" ? "Add item" : "Save changes"}</button></div>
      </form></div></div> : null}
  </div>;
}
