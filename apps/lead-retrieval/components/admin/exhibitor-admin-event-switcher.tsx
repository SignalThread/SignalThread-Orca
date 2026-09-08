"use client";

import { useRouter } from "next/navigation";
import {
  EXHIBITOR_ADMIN_ACTIVE_EVENT_COOKIE,
  EXHIBITOR_ADMIN_ACTIVE_EVENT_COOKIE_MAX_AGE_SEC
} from "@/lib/admin/exhibitor-admin-constants";

export function ExhibitorAdminEventSwitcher({
  accessibleEvents,
  activeEventId
}: {
  accessibleEvents: Array<{ id: string; name: string }>;
  activeEventId: string | null;
}) {
  const router = useRouter();

  if (accessibleEvents.length === 0) {
    return null;
  }

  if (accessibleEvents.length === 1) {
    const only = accessibleEvents[0];
    return (
      <span className="admin-exhibitor-active-event rounded-lg border border-border px-3 py-1.5 text-sm text-slate-700">
        {only?.name ?? "Event"}
      </span>
    );
  }

  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <span className="hidden sm:inline font-medium text-slate-600">Event</span>
      <select
        className="admin-exhibitor-event-select rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-slate-900"
        value={activeEventId ?? ""}
        aria-label="Active event"
        onChange={(e) => {
          const next = e.target.value;
          document.cookie = `${EXHIBITOR_ADMIN_ACTIVE_EVENT_COOKIE}=${encodeURIComponent(next)}; Path=/; Max-Age=${EXHIBITOR_ADMIN_ACTIVE_EVENT_COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
          router.refresh();
        }}
      >
        {accessibleEvents.map((ev) => (
          <option key={ev.id} value={ev.id}>
            {ev.name}
          </option>
        ))}
      </select>
    </label>
  );
}
