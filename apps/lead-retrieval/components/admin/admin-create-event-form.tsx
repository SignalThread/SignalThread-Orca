"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createAdminEventAction } from "@/app/admin/events/new/actions";
import { EventTimezoneField } from "@/components/events/event-timezone-field";

export function AdminCreateEventForm() {
  const [state, formAction, isPending] = useActionState(createAdminEventAction, null);

  const error = state && !state.ok ? state.error : null;

  return (
    <>
      {error ? (
        <div
          className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"
          role="alert"
          data-error-code={error.code}
          {...(error.reason != null ? { "data-error-reason": error.reason } : {})}
        >
          {error.message}
        </div>
      ) : null}

      <form action={formAction} className="mt-7 space-y-5">
        <label className="block space-y-2.5">
          <span className="text-sm font-semibold text-slate-700">Event Name *</span>
          <input
            required
            name="name"
            placeholder="e.g., Tech Summit 2026"
            className="h-14 w-full rounded-2xl border border-border px-4 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30"
            disabled={isPending}
          />
        </label>

        <EventTimezoneField
          disabled={isPending}
          className="h-14 w-full rounded-2xl border border-border px-4 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30"
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block space-y-2.5">
            <span className="text-sm font-semibold text-slate-700">Start Date *</span>
            <input
              required
              type="date"
              name="startDate"
              className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
              disabled={isPending}
            />
          </label>

          <label className="block space-y-2.5">
            <span className="text-sm font-semibold text-slate-700">End Date *</span>
            <input
              required
              type="date"
              name="endDate"
              className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
              disabled={isPending}
            />
          </label>
        </div>

        <label className="block space-y-2.5">
          <span className="text-sm font-semibold text-slate-700">Location *</span>
          <input
            required
            name="location"
            placeholder="e.g., San Francisco, CA"
            className="h-14 w-full rounded-2xl border border-border px-4 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30"
            disabled={isPending}
          />
        </label>

        <label className="block space-y-2.5">
          <span className="text-sm font-semibold text-slate-700">Status *</span>
          <select
            required
            name="status"
            defaultValue="UPCOMING"
            className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
            disabled={isPending}
          >
            <option value="UPCOMING">Upcoming</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>

        <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2 sm:gap-4">
          <Link
            href="/admin/events"
            className="inline-flex h-14 items-center justify-center rounded-2xl bg-slate-100 text-lg font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="h-14 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 text-lg font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? "Creating…" : "Create Event"}
          </button>
        </div>
      </form>
    </>
  );
}
