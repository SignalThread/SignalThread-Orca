"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import type { ExhibitorAppShellEventChrome } from "@/lib/exhibitor/exhibitor-app-shell-types";
import { EXHIBITOR_EVENTS_ENTRY_HREF } from "@/lib/exhibitor/exhibitor-app-nav";
import { exhibitorOpenEventHref } from "@/lib/events/event-portfolio";
import {
  EXHIBITOR_APP_ACTIVE_EVENT_COOKIE,
  EXHIBITOR_APP_ACTIVE_EVENT_COOKIE_MAX_AGE_SEC
} from "@/lib/exhibitor/exhibitor-app-active-event-constants";

function writeActiveEventCookie(eventId: string) {
  document.cookie = `${EXHIBITOR_APP_ACTIVE_EVENT_COOKIE}=${encodeURIComponent(eventId)}; Path=/; Max-Age=${EXHIBITOR_APP_ACTIVE_EVENT_COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
}

function mergeEventIdIntoPath(pathname: string, searchParams: URLSearchParams, eventId: string) {
  const next = new URLSearchParams(searchParams.toString());
  next.set("eventId", eventId);
  const q = next.toString();
  return q ? `${pathname}?${q}` : `${pathname}?eventId=${encodeURIComponent(eventId)}`;
}

export function ExhibitorAppTopBarEventSlot({
  accessibleEvents,
  activeEventId: serverActiveEventId,
  activeEventName: serverActiveEventName,
  showManageEventsLink,
  eventSelectorLocked
}: ExhibitorAppShellEventChrome) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const urlEventId = searchParams.get("eventId");

  const resolvedId = useMemo(() => {
    const u = urlEventId?.trim() ?? "";
    if (u && accessibleEvents.some((e) => e.id === u)) return u;
    if (serverActiveEventId && accessibleEvents.some((e) => e.id === serverActiveEventId)) {
      return serverActiveEventId;
    }
    return accessibleEvents[0]?.id ?? null;
  }, [urlEventId, serverActiveEventId, accessibleEvents]);

  const resolvedName =
    accessibleEvents.find((e) => e.id === resolvedId)?.name ?? serverActiveEventName ?? "Event";

  useEffect(() => {
    const u = urlEventId?.trim() ?? "";
    if (!u || !accessibleEvents.some((e) => e.id === u)) return;
    writeActiveEventCookie(u);
  }, [urlEventId, accessibleEvents]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (accessibleEvents.length === 0) {
    return null;
  }

  if (eventSelectorLocked) {
    return (
      <div
        className="flex max-w-[min(100%,16rem)] items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 shadow-sm"
        role="status"
        aria-label="Selected event"
      >
        <span className="min-w-0 flex-1 truncate">{resolvedName}</span>
      </div>
    );
  }

  function navigateToEvent(eventId: string) {
    writeActiveEventCookie(eventId);
    const onExhibitorWorkflow =
      pathname === "/exhibitor" || pathname.startsWith("/exhibitor/");
    if (onExhibitorWorkflow) {
      router.push(mergeEventIdIntoPath(pathname, searchParams, eventId));
    } else {
      // Account routes (including /app/events/new) do not have an event query
      // context to merge. Use the same canonical event destination as the
      // portfolio cards; it validates access before entering the workspace.
      router.push(exhibitorOpenEventHref(eventId));
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="flex max-w-[min(100%,16rem)] cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-left text-sm font-medium text-gray-900 shadow-sm transition hover:bg-gray-50"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0 flex-1 truncate">{resolvedName}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-1.5 min-w-[220px] max-w-[300px] overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
            <ul
              role="listbox"
              aria-label="Events"
              className="max-h-[min(50vh,16rem)] overflow-y-auto"
            >
              {accessibleEvents.map((ev) => {
                const selected = ev.id === resolvedId;
                const isCapture = ev.container_kind === "continuous_capture";
                return (
                  <li key={ev.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                        selected ? "font-medium text-gray-900" : "font-normal text-gray-600"
                      }`}
                      onClick={() => {
                        navigateToEvent(ev.id);
                        setOpen(false);
                      }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{ev.name}</span>
                        {isCapture ? (
                          <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                            Continuous capture
                          </span>
                        ) : null}
                      </span>
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
                        {selected ? <Check className="h-4 w-4 text-gray-900" strokeWidth={2.25} /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {showManageEventsLink ? (
              <>
                <div className="my-1 border-t border-gray-200" />

                <Link
                  href={EXHIBITOR_EVENTS_ENTRY_HREF}
                  className="block cursor-pointer px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  onClick={() => setOpen(false)}
                >
                  Manage
                </Link>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
