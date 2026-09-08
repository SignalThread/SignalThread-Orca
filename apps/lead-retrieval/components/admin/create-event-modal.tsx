"use client";

import { useEffect, useState } from "react";

type CreateEventModalProps = {
  open: boolean;
  onClose: () => void;
};

export function CreateEventModal({ open, onClose }: CreateEventModalProps) {
  const [eventName, setEventName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("upcoming");

  useEffect(() => {
    if (!open) return;
    setEventName("");
    setStartDate("");
    setEndDate("");
    setLocation("");
    setStatus("upcoming");
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 px-4 py-6 sm:items-center" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
        <div className="border-b border-border px-6 py-6 sm:px-8">
          <h2 className="text-4xl font-bold">Create Event</h2>
        </div>

        <div className="space-y-5 overflow-y-auto px-6 py-6 sm:px-8">
          <label className="block space-y-2.5">
            <span className="text-sm font-semibold text-slate-700">Event Name *</span>
            <input
              value={eventName}
              onChange={(event) => setEventName(event.target.value)}
              placeholder="e.g., Tech Summit 2026"
              className="h-14 w-full rounded-2xl border border-border px-4 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block space-y-2.5">
              <span className="text-sm font-semibold text-slate-700">Start Date *</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </label>

            <label className="block space-y-2.5">
              <span className="text-sm font-semibold text-slate-700">End Date *</span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </label>
          </div>

          <label className="block space-y-2.5">
            <span className="text-sm font-semibold text-slate-700">Location *</span>
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="e.g., San Francisco, CA"
              className="h-14 w-full rounded-2xl border border-border px-4 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>

          <label className="block space-y-2.5">
            <span className="text-sm font-semibold text-slate-700">Status *</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="upcoming">Upcoming</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </label>
        </div>

        <div className="border-t border-border px-6 py-5 sm:px-8">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <button type="button" onClick={onClose} className="h-14 rounded-2xl bg-slate-100 text-lg font-semibold text-slate-700 transition hover:bg-slate-200">
              Cancel
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-14 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 text-lg font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700"
            >
              Create Event
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
