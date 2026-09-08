"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createExhibitorEventAction, type ExhibitorCreateEventState } from "./actions";
import { EventTimezoneField } from "@/components/events/event-timezone-field";

const inputCls =
  "mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "block text-sm font-medium text-slate-700";
const helperCls = "mt-1 text-[11px] font-medium text-slate-400";

export function CreateExhibitorEventForm({ allowContinuousCapture }: { allowContinuousCapture: boolean }) {
  const [containerKind, setContainerKind] = useState<"event" | "continuous_capture">("event");
  const isCc = allowContinuousCapture && containerKind === "continuous_capture";

  const [state, formAction, pending] = useActionState<ExhibitorCreateEventState | null, FormData>(
    createExhibitorEventAction,
    null
  );

  const errorMessage = state && !state.ok ? state.error.message : null;

  const kindCard = (active: boolean) =>
    `flex cursor-pointer items-start gap-3 rounded-xl border bg-white px-3 py-3 shadow-sm transition hover:border-slate-300 ${
      active ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"
    }`;

  return (
    <form action={formAction} className="space-y-5">
      {!allowContinuousCapture ? <input type="hidden" name="containerKind" value="event" /> : null}

      {allowContinuousCapture ? (
        <fieldset className="space-y-2">
          <legend className={labelCls}>Event type</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={kindCard(containerKind === "event")}>
              <input
                type="radio"
                name="containerKind"
                value="event"
                className="mt-1"
                checked={containerKind === "event"}
                onChange={() => setContainerKind("event")}
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">Event</span>
                <span className="mt-0.5 block text-xs text-slate-500">Finite show or campaign — optional dates.</span>
              </span>
            </label>
            <label className={kindCard(containerKind === "continuous_capture")}>
              <input
                type="radio"
                name="containerKind"
                value="continuous_capture"
                className="mt-1"
                checked={containerKind === "continuous_capture"}
                onChange={() => setContainerKind("continuous_capture")}
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">Continuous capture</span>
                <span className="mt-0.5 block text-xs text-slate-500">Always-on event for ongoing lead capture.</span>
              </span>
            </label>
          </div>
        </fieldset>
      ) : null}

      <div>
        <label htmlFor="name" className={labelCls}>
          Name <span className="text-rose-600">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={160}
          autoComplete="off"
          placeholder={isCc ? "e.g. Field prospecting" : "e.g. Spring Showcase 2026"}
          className={inputCls}
        />
      </div>

      <EventTimezoneField className={inputCls} />

      <div>
        <label htmlFor="location" className={labelCls}>
          Location
        </label>
        <input
          id="location"
          name="location"
          type="text"
          maxLength={240}
          autoComplete="off"
          placeholder="Venue, city, or event location"
          className={inputCls}
        />
        <p className={helperCls}>Optional.</p>
      </div>

      {!isCc ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="startDate" className={labelCls}>
              Start date
            </label>
            <input id="startDate" name="startDate" type="date" className={inputCls} />
            <p className={helperCls}>Optional.</p>
          </div>
          <div>
            <label htmlFor="endDate" className={labelCls}>
              End date
            </label>
            <input id="endDate" name="endDate" type="date" className={inputCls} />
            <p className={helperCls}>Optional.</p>
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
          Continuous capture events do not use start/end dates. They stay open for ongoing lead capture.
        </p>
      )}

      {errorMessage ? (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Link
          href="/app/events"
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create event"}
        </button>
      </div>
    </form>
  );
}
