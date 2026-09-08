"use client";

import { useActionState } from "react";

type DeleteEventButtonProps = {
  action: (_previousState: string | null, formData: FormData) => Promise<string | null>;
  eventId: string;
};

export function DeleteEventButton({ action, eventId }: DeleteEventButtonProps) {
  const [errorMessage, formAction, isPending] = useActionState(action, null);

  return (
    <div className="flex flex-col items-end gap-2">
      <form
        action={formAction}
        onSubmit={(event) => {
          const confirmed = window.confirm("Delete this event?");
          if (!confirmed) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="eventId" value={eventId} />
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Deleting..." : "Delete"}
        </button>
      </form>
      {errorMessage ? <p className="text-xs font-medium text-rose-700">{errorMessage}</p> : null}
    </div>
  );
}
