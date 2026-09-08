"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ExhibitorDetailActionsProps = {
  exhibitorId: string;
  eventId?: string;
  currentName: string;
};

export function ExhibitorDetailActions({
  exhibitorId,
  eventId,
  currentName
}: ExhibitorDetailActionsProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleEdit() {
    const nextName = window.prompt("Update exhibitor name", currentName);
    if (nextName == null) return;

    const trimmed = nextName.trim();
    if (!trimmed) {
      window.alert("Exhibitor name is required.");
      return;
    }

    setIsPending(true);
    try {
      const response = await fetch(`/api/v1/exhibitors/${exhibitorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exhibitorName: trimmed, eventId })
      });

      const data = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        window.alert(data?.message ?? "Failed updating exhibitor.");
        return;
      }

      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm("Delete this exhibitor? This will remove associated license records.");
    if (!confirmed) return;

    setIsPending(true);
    try {
      const qs = eventId ? `?eventId=${encodeURIComponent(eventId)}` : "";
      const response = await fetch(`/api/v1/exhibitors/${exhibitorId}${qs}`, {
        method: "DELETE"
      });

      const data = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        window.alert(data?.message ?? "Failed deleting exhibitor.");
        return;
      }

      router.push(eventId ? `/admin/events/${eventId}` : "/admin/exhibitors");
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleEdit}
        disabled={isPending}
        className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="inline-flex h-10 items-center justify-center rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Delete
      </button>
    </div>
  );
}
