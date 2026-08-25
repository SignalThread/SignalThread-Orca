"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  DIRECTORY_ROLE_OPTIONS,
  canonicalRoleKey,
  roleChipClasses,
  type DirectoryRole,
} from "./directory-constants";

export type DirectoryPersonRecord = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  roles: { id: string; role: DirectoryRole }[];
};

type DuplicateMatch = {
  matchType: string;
  person: { id: string; displayName: string; email: string | null; company: string | null };
};

type PersonFormDrawerProps = {
  eventId: string;
  mode: "add" | "edit";
  person?: DirectoryPersonRecord | null;
  onClose: () => void;
  onSaved: () => void;
  onOpenExisting: (personId: string) => void;
};

function emptyForm() {
  return { firstName: "", lastName: "", email: "", phone: "", company: "", title: "", sourceLabel: "" };
}

export function PersonFormDrawer({ eventId, mode, person, onClose, onSaved, onOpenExisting }: PersonFormDrawerProps) {
  const [form, setForm] = useState(() =>
    person
      ? {
          firstName: person.firstName ?? "",
          lastName: person.lastName ?? "",
          email: person.email ?? "",
          phone: person.phone ?? "",
          company: person.company ?? "",
          title: person.title ?? "",
          sourceLabel: "",
        }
      : emptyForm(),
  );
  const [roles, setRoles] = useState<DirectoryRole[]>(person?.roles.map((r) => r.role) ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState<DuplicateMatch | null>(null);

  function update<K extends keyof ReturnType<typeof emptyForm>>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleRole(role: DirectoryRole) {
    const roleKey = canonicalRoleKey(role);
    setRoles((prev) =>
      prev.some((r) => canonicalRoleKey(r) === roleKey)
        ? prev.filter((r) => canonicalRoleKey(r) !== roleKey)
        : [...prev, role],
    );
  }

  async function submitAdd(allowDuplicate: boolean) {
    setSaving(true);
    setError(null);
    setDuplicate(null);
    try {
      const response = await fetch(`/api/events/${eventId}/directory/people`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          firstName: form.firstName || null,
          lastName: form.lastName || null,
          email: form.email || null,
          phone: form.phone || null,
          company: form.company || null,
          title: form.title || null,
          roles,
          source: { type: "MANUAL", label: form.sourceLabel || "Manually added" },
          allowDuplicate,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (response.status === 409 && payload?.status === "possible_duplicate") {
        setDuplicate(payload.existing as DuplicateMatch);
        return;
      }
      if (!response.ok) throw new Error(payload?.error ?? "Failed to add person");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add person");
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit() {
    if (!person) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/directory/people/${person.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          firstName: form.firstName || null,
          lastName: form.lastName || null,
          email: form.email || null,
          phone: form.phone || null,
          company: form.company || null,
          title: form.title || null,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Failed to update person");
      }
      // Reconcile roles: add newly-checked, remove unchecked.
      const current = new Map(person.roles.map((r) => [r.role, r.id] as const));
      const desired = new Set(roles);
      for (const role of desired) {
        if (!current.has(role)) {
          await fetch(`/api/events/${eventId}/directory/people/${person.id}/roles`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ role }),
          });
        }
      }
      for (const [role, roleId] of current) {
        if (!desired.has(role)) {
          await fetch(`/api/events/${eventId}/directory/people/${person.id}/roles/${roleId}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update person");
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = Boolean(form.email.trim() || form.firstName.trim() || form.lastName.trim());

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-[15px] font-semibold text-slate-900">{mode === "add" ? "Add person" : "Edit person"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700" role="alert">{error}</p> : null}

          {duplicate ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-[13px] text-amber-900">
              <p className="font-semibold">A matching person already exists</p>
              <p className="mt-0.5">
                {duplicate.person.displayName}
                {duplicate.person.email ? ` · ${duplicate.person.email}` : ""}
                {duplicate.person.company ? ` · ${duplicate.person.company}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => onOpenExisting(duplicate.person.id)} className="rounded-md bg-amber-600 px-2.5 py-1 text-[12px] font-semibold text-white">
                  Open existing person
                </button>
                <button type="button" onClick={() => void submitAdd(true)} disabled={saving} className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[12px] font-medium text-amber-800 disabled:opacity-50">
                  Create separate person
                </button>
              </div>
            </div>
          ) : null}

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
          {mode === "add" ? (
            <Field label="Source label" value={form.sourceLabel} onChange={(v) => update("sourceLabel", v)} placeholder="e.g. VIP list, Speaker intake" />
          ) : null}

          <div>
            <p className="mb-1 text-[13px] font-medium text-slate-700">Roles</p>
            <div className="flex flex-wrap gap-1.5">
              {DIRECTORY_ROLE_OPTIONS.map((option) => {
                const on = roles.some((role) => canonicalRoleKey(role) === option.semanticKey);
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleRole(option.value)}
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${on ? roleChipClasses(option.value) : "border-slate-200 bg-white text-slate-500"}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Contact is for event-tied leads who are not registered yet. Attendee is the attendance role.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => (mode === "add" ? void submitAdd(false) : void submitEdit())}
            disabled={saving || !canSubmit}
            className="h-9 rounded-lg bg-[#28439A] px-3 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-50"
          >
            {saving ? "Saving…" : mode === "add" ? "Add person" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-[13px] outline-none focus:border-slate-300"
      />
    </label>
  );
}
