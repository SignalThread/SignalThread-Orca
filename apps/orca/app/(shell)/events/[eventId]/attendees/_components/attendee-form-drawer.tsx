"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  REGISTRATION_STATUSES,
  REGISTRATION_STATUS_LABELS,
  type RegistrationStatus,
} from "./attendee-constants";

type AttendeeFormDrawerProps = {
  eventId: string;
  directoryPersonId?: string | null;
  onClose: () => void;
  onSaved: () => void;
};

function emptyForm() {
  return {
    firstName: "", lastName: "", email: "", phone: "", company: "", title: "",
    registrationStatus: "NOT_REGISTERED" as RegistrationStatus,
    registrationType: "", ticketType: "", badgeType: "",
    provider: "", externalRegistrationId: "", notes: "",
  };
}

export function AttendeeFormDrawer({ eventId, directoryPersonId, onClose, onSaved }: AttendeeFormDrawerProps) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof ReturnType<typeof emptyForm>>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/attendees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          directoryPersonId: directoryPersonId ?? null,
          profile: {
            firstName: form.firstName || null,
            lastName: form.lastName || null,
            email: form.email || null,
            phone: form.phone || null,
            company: form.company || null,
            title: form.title || null,
          },
          participation: {
            registrationStatus: form.registrationStatus,
            registrationType: form.registrationType || null,
            ticketType: form.ticketType || null,
            badgeType: form.badgeType || null,
            notes: form.notes || null,
            source: "MANUAL",
          },
          registration: {
            provider: form.provider || null,
            externalRegistrationId: form.externalRegistrationId || null,
          },
          sourceLabel: "Manually added attendee",
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Failed to add attendee");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add attendee");
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = Boolean(form.email.trim() || form.firstName.trim() || form.lastName.trim());

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-[15px] font-semibold text-slate-900">Add attendee</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700" role="alert">{error}</p> : null}

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Profile (Directory)</h3>
            <div className="grid grid-cols-2 gap-2">
              <Field label="First name" value={form.firstName} onChange={(v) => update("firstName", v)} />
              <Field label="Last name" value={form.lastName} onChange={(v) => update("lastName", v)} />
            </div>
            <Field label="Email" type="email" value={form.email} onChange={(v) => update("email", v)} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Phone" value={form.phone} onChange={(v) => update("phone", v)} />
              <Field label="Company" value={form.company} onChange={(v) => update("company", v)} />
            </div>
            <Field label="Title" value={form.title} onChange={(v) => update("title", v)} />
            <p className="mt-1 text-[11px] text-slate-400">If this email already exists in the Directory, we link to that person — no duplicate is created.</p>
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Attendance</h3>
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-slate-700">Registration status</span>
              <select value={form.registrationStatus} onChange={(e) => update("registrationStatus", e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 px-2 text-[13px] text-slate-700">
                {REGISTRATION_STATUSES.map((s) => (
                  <option key={s} value={s}>{REGISTRATION_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Registration type" value={form.registrationType} onChange={(v) => update("registrationType", v)} placeholder="Full Access" />
              <Field label="Ticket / pass type" value={form.ticketType} onChange={(v) => update("ticketType", v)} />
            </div>
            <Field label="Badge type" value={form.badgeType} onChange={(v) => update("badgeType", v)} />
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Registration / source (optional)</h3>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Provider" value={form.provider} onChange={(v) => update("provider", v)} placeholder="bizzabo, aura…" />
              <Field label="External registration ID" value={form.externalRegistrationId} onChange={(v) => update("externalRegistrationId", v)} />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">A registration record is only created when provider/registration data is entered.</p>
          </section>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={saving || !canSubmit} className="h-9 rounded-lg bg-[#28439A] px-3 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-50">
            {saving ? "Saving…" : "Add attendee"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="mt-2 block">
      <span className="mb-1 block text-[13px] font-medium text-slate-700">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-[13px] outline-none focus:border-slate-300" />
    </label>
  );
}
