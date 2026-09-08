"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function CampaignNameEditor({
  campaignId,
  initialName,
  isDraft
}: {
  campaignId: string;
  initialName: string;
  isDraft: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isDraft || saving) {
      return;
    }

    const nextName = name.trim();
    if (!nextName) {
      setError("Campaign name is required");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name: nextName })
      });

      const payload = (await response.json()) as {
        campaign?: { name?: string };
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save campaign");
      }

      setName(payload.campaign?.name ?? nextName);
      setMessage("Saved");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save campaign");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <label className="text-sm font-medium text-slate-900">Name:</label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!isDraft || saving}
          className="min-w-[220px] rounded-lg border bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
        />
        {isDraft ? (
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        ) : null}
      </div>
      {isDraft ? null : <p className="text-xs text-slate-500">Only draft campaigns can be renamed.</p>}
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </form>
  );
}
