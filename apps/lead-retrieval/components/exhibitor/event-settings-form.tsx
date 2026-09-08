"use client";

import { useActionState } from "react";
import { updateEventSettingsAction, type EventSettingsActionState } from "@/app/actions/event-settings";
import { EventTimezoneField } from "@/components/events/event-timezone-field";

type Props = {
  event: {
    id: string;
    name: string | null;
    start_date: string | null;
    end_date: string | null;
    location: string | null;
    timezone: string | null;
  };
};

const initialState: EventSettingsActionState = null;

export function EventSettingsForm({ event }: Props) {
  const [state, formAction, isPending] = useActionState(updateEventSettingsAction, initialState);

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-slate-900">Event settings</h2>
        <p className="text-sm leading-relaxed text-slate-600">
          Update the details your team sees for the active event.
        </p>
      </div>

      {state ? (
        <p
          className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${
            state.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
          role={state.ok ? "status" : "alert"}
          data-error-code={state.ok ? undefined : state.code}
        >
          {state.message}
        </p>
      ) : null}

      <form action={formAction} className="mt-5 space-y-4">
        <input type="hidden" name="eventId" value={event.id} />

        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Event name</span>
          <input
            required
            name="name"
            defaultValue={event.name ?? ""}
            maxLength={160}
            disabled={isPending}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
        </label>

        <EventTimezoneField
          defaultValue={event.timezone}
          disabled={isPending}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-50"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Start date</span>
            <input
              type="date"
              name="startDate"
              defaultValue={event.start_date ?? ""}
              disabled={isPending}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-50"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">End date</span>
            <input
              type="date"
              name="endDate"
              defaultValue={event.end_date ?? ""}
              disabled={isPending}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-50"
            />
          </label>
        </div>

        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</span>
          <input
            name="location"
            defaultValue={event.location ?? ""}
            maxLength={240}
            placeholder="Venue, city, or event location"
            disabled={isPending}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
        </label>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Saving..." : "Save event settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
