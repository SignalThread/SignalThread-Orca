"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type EventDangerActionsProps = {
  eventId: string;
};

export function EventDangerActions({ eventId }: EventDangerActionsProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm("Delete this event? This action cannot be undone.");
    if (!confirmed) return;

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: "DELETE",
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete event");
      }

      router.push("/events");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete event");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="mt-6 border-t border-slate-200 pt-6">
      <h3 className="text-[16px] font-semibold text-slate-900">Danger Zone</h3>
      <p className="mt-2 text-[13px] text-slate-600">Deleting this event permanently removes it from the events list.</p>
      {errorMessage ? <p className="mt-3 text-[13px] text-rose-600">{errorMessage}</p> : null}
      <button
        type="button"
        onClick={() => void handleDelete()}
        disabled={isDeleting}
        className="mt-4 inline-flex h-10 items-center rounded-lg bg-rose-600 px-4 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
      >
        {isDeleting ? "Deleting..." : "Delete Event"}
      </button>
    </div>
  );
}
