"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type EventOption = {
  id: string;
  name: string;
};

type OrganizerEventSwitcherProps = {
  events: EventOption[];
  value: string;
  storageKey?: string;
};

const DEFAULT_STORAGE_KEY = "leadintel.organizer.selectedEventId";

export function OrganizerEventSwitcher({
  events,
  value,
  storageKey = DEFAULT_STORAGE_KEY
}: OrganizerEventSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!events.length) return;

    if (value) {
      try {
        window.localStorage.setItem(storageKey, value);
      } catch {
        // Ignore storage write errors.
      }
      return;
    }

    try {
      const stored = window.localStorage.getItem(storageKey) ?? "";
      if (!stored || !events.some((event) => event.id === stored)) {
        return;
      }
      const params = new URLSearchParams(searchParams.toString());
      params.set("eventId", stored);
      router.replace(`${pathname}?${params.toString()}`);
    } catch {
      // Ignore storage read errors.
    }
  }, [events, pathname, router, searchParams, storageKey, value]);

  function onChange(nextEventId: string) {
    try {
      window.localStorage.setItem(storageKey, nextEventId);
    } catch {
      // Ignore storage write errors.
    }

    const params = new URLSearchParams(searchParams.toString());
    if (nextEventId) {
      params.set("eventId", nextEventId);
    } else {
      params.delete("eventId");
    }

    const suffix = params.toString();
    router.push(suffix ? `${pathname}?${suffix}` : pathname);
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Event</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 min-w-[220px] rounded-xl border border-border bg-white px-3 text-sm font-semibold"
      >
        {events.map((event) => (
          <option key={event.id} value={event.id}>
            {event.name}
          </option>
        ))}
      </select>
    </div>
  );
}
