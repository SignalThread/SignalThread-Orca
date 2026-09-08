"use client";

import { KeyboardEvent, useState } from "react";

function isSimpleValidEmail(value: string) {
  const at = value.indexOf("@");
  if (at <= 0) return false;
  const dot = value.indexOf(".", at + 2);
  return dot > at + 1 && dot < value.length - 1;
}

export function LeadEmailInlineEditor({
  leadId,
  initialEmail
}: {
  leadId: string;
  initialEmail: string | null;
}) {
  const [email, setEmail] = useState<string | null>(initialEmail);
  const [draft, setDraft] = useState(initialEmail ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    const next = draft.trim();
    const value = next.length > 0 ? next : null;

    if (value && !isSimpleValidEmail(value)) {
      setError("Enter a valid email address");
      return;
    }

    if (value === email) {
      setEditing(false);
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);

    const response = await fetch(`/api/exhibitor/leads/${encodeURIComponent(leadId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: value }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      lead?: { email: string | null };
      error?: string;
    };

    setSaving(false);

    if (!response.ok || !payload.lead) {
      setError(payload.error ?? "Failed to update email");
      return;
    }

    setEmail(payload.lead.email ?? value);
    setDraft(payload.lead.email ?? value ?? "");
    setEditing(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setEditing(false);
      setDraft(email ?? "");
      setError(null);
    }
  }

  if (editing) {
    return (
      <span className="inline-flex flex-col gap-1 align-middle">
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={onKeyDown}
          placeholder="name@company.com"
          className="w-[260px] max-w-full rounded border bg-white px-2 py-1 text-sm"
        />
        {saving ? <span className="text-xs text-slate-500">Saving...</span> : null}
        {error ? <span className="text-xs text-rose-600">{error}</span> : null}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-1 align-middle">
      <button
        type="button"
        onClick={() => {
          setEditing(true);
          setDraft(email ?? "");
          setError(null);
        }}
        className={`max-w-[260px] truncate text-left text-sm ${email ? "text-slate-700" : "text-slate-400"}`}
      >
        {email ?? "Click to edit"}
      </button>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </span>
  );
}
