"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { GoogleMeetingActivity } from "@/lib/integrations/google/calendar-service";
import {
  addDateKeyDays,
  addMonthKey,
  calendarMonthDays,
  monthKeyForDateKey,
  setDateKeyWithTime,
  weekDateKeys,
  weekStartDateKey
} from "@/lib/integrations/google/meeting-scheduler-ui-core";

type ConnectionStatus = "disconnected" | "connected" | "reconnect_required" | "error" | "revocation_pending";
type Suggestion = { start: string; end: string };

function localInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function tomorrowAtNine() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return localInputValue(date);
}

function formatMeetingTime(value: string, timezone: string) {
  return new Date(value).toLocaleString("en-US", {
    timeZone: timezone,
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short"
  });
}

function formatSlotTime(value: string, timezone: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatDateStripLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function formatStartDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatMonthLabel(monthKey: string) {
  return new Date(`${monthKey}-01T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? "00" : "30";
  const value = `${String(hour).padStart(2, "0")}:${minute}`;
  return { value, label: new Date(`2026-01-01T${value}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) };
});

const DURATION_OPTIONS: ListboxOption<number>[] = [15, 30, 45, 60].map((value) => ({ value, label: `${value} minutes` }));

const DATE_POPOVER_WIDTH = 288;
const DATE_POPOVER_HEIGHT = 320;

function useMeetingPopoverPosition(open: boolean, anchorRef: RefObject<HTMLButtonElement | null>, minWidth: number, height: number) {
  const [position, setPosition] = useState({ top: 0, left: 0, width: minWidth });
  const update = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const modal = anchor.closest("[data-meeting-dialog]")?.getBoundingClientRect();
    const minLeft = Math.max(8, modal ? modal.left + 8 : 8);
    const maxRight = Math.min(window.innerWidth - 8, modal ? modal.right - 8 : window.innerWidth - 8);
    const minTop = Math.max(8, modal ? modal.top + 8 : 8);
    const maxBottom = Math.min(window.innerHeight - 8, modal ? modal.bottom - 8 : window.innerHeight - 8);
    const width = Math.min(Math.max(minWidth, rect.width), maxRight - minLeft);
    const below = rect.bottom + 6;
    const above = rect.top - height - 6;
    const top = below + height <= maxBottom ? below : Math.max(minTop, above);
    const left = Math.min(Math.max(minLeft, rect.left), Math.max(minLeft, maxRight - width));
    setPosition({ top, left, width });
  }, [anchorRef, height, minWidth]);

  useLayoutEffect(() => {
    if (!open) return;
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, update]);
  return { position, update };
}

type ListboxOption<T extends string | number> = { value: T; label: string };

function MeetingListbox<T extends string | number>({ label, value, options, onChange, disabled = false, testId }: {
  label: string;
  value: T;
  options: ListboxOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((option) => option.value === value)));
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedOptionRef = useRef<HTMLButtonElement>(null);
  const { position, update } = useMeetingPopoverPosition(open, triggerRef, 160, 288);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);
  const openList = useCallback(() => {
    setActiveIndex(selectedIndex);
    setOpen(true);
  }, [selectedIndex]);
  const choose = useCallback((index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    close();
  }, [close, onChange, options]);

  useEffect(() => {
    if (!open) return;
    const focusAndScroll = window.setTimeout(() => {
      listRef.current?.focus();
      selectedOptionRef.current?.scrollIntoView({ block: "nearest" });
    }, 0);
    function dismissOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      close();
    }
    function dismissEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }
    document.addEventListener("mousedown", dismissOutside);
    document.addEventListener("keydown", dismissEscape);
    update();
    return () => {
      window.clearTimeout(focusAndScroll);
      document.removeEventListener("mousedown", dismissOutside);
      document.removeEventListener("keydown", dismissEscape);
    };
  }, [close, open, update]);

  const popover = open ? <div ref={listRef} id={`${id}-listbox`} role="listbox" tabIndex={-1} aria-label={label} aria-activedescendant={`${id}-option-${activeIndex}`} data-testid={testId} onKeyDown={(event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(options.length - 1, index + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
    else if (event.key === "Home") { event.preventDefault(); setActiveIndex(0); }
    else if (event.key === "End") { event.preventDefault(); setActiveIndex(options.length - 1); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(activeIndex); }
  }} className="fixed z-[70] max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl" style={{ top: position.top, left: position.left, width: position.width }}>
    {options.map((option, index) => <button key={String(option.value)} ref={option.value === value ? selectedOptionRef : undefined} id={`${id}-option-${index}`} type="button" role="option" tabIndex={-1} aria-selected={option.value === value} onMouseMove={() => setActiveIndex(index)} onClick={() => choose(index)} className={`flex w-full items-center px-3 py-2 text-left text-sm font-medium transition focus:outline-none ${option.value === value ? "bg-indigo-600 text-white" : index === activeIndex ? "bg-indigo-50 text-indigo-900" : "text-slate-800 hover:bg-slate-50"}`}>{option.label}</button>)}
  </div> : null;

  return <div className="min-w-0"><span className="text-sm font-semibold text-slate-700">{label}</span><button ref={triggerRef} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-listbox` : undefined} onClick={() => open ? close() : openList()} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); openList(); } }} className="mt-1.5 flex h-10 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-left text-sm font-normal text-slate-900 hover:border-indigo-300 disabled:bg-slate-50"><span className="whitespace-nowrap">{options[selectedIndex]?.label}</span><span aria-hidden="true" className="text-slate-500">▾</span></button>{typeof document !== "undefined" && popover ? createPortal(popover, document.body) : null}</div>;
}

function MeetingStartPicker({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const dateKey = value.slice(0, 10);
  const time = value.split("T")[1]?.slice(0, 5) || "09:00";
  const [open, setOpen] = useState(false);
  const [monthKey, setMonthKey] = useState(() => monthKeyForDateKey(dateKey));
  const today = localInputValue(new Date()).slice(0, 10);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { position, update } = useMeetingPopoverPosition(open, triggerRef, DATE_POPOVER_WIDTH, DATE_POPOVER_HEIGHT);

  const closePicker = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open) return;
    function dismissOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      closePicker();
    }
    function dismissEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
      }
    }
    document.addEventListener("mousedown", dismissOutside);
    document.addEventListener("keydown", dismissEscape);
    update();
    return () => {
      document.removeEventListener("mousedown", dismissOutside);
      document.removeEventListener("keydown", dismissEscape);
    };
  }, [closePicker, open, update]);

  function togglePicker() {
    if (open) {
      closePicker();
      return;
    }
    setMonthKey(monthKeyForDateKey(dateKey));
    setOpen(true);
  }

  const popover = open ? <div id="meeting-date-popover" ref={popoverRef} role="dialog" aria-modal="false" aria-label="Choose meeting date" className="fixed z-[70] w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl" style={{ top: position.top, left: position.left, maxHeight: "calc(100vh - 16px)" }} data-testid="meeting-date-popover">
    <div className="flex items-center justify-between gap-2"><button type="button" onClick={() => setMonthKey((current) => addMonthKey(current, -1))} className="rounded-md px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100" aria-label="Previous month">‹</button><p className="text-sm font-semibold text-slate-900" aria-live="polite">{formatMonthLabel(monthKey)}</p><button type="button" onClick={() => setMonthKey((current) => addMonthKey(current, 1))} className="rounded-md px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100" aria-label="Next month">›</button></div>
    <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500" aria-hidden="true">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label={`${formatMonthLabel(monthKey)} dates`}>{calendarMonthDays(monthKey).map((day) => {
      const unavailable = day.dateKey < today;
      const selected = day.dateKey === dateKey;
      return <button type="button" role="gridcell" key={day.dateKey} disabled={unavailable} aria-selected={selected} onClick={() => { onChange(setDateKeyWithTime(value, day.dateKey)); closePicker(); }} className={`h-8 rounded-md text-xs font-semibold transition ${selected ? "bg-indigo-600 text-white" : day.inMonth ? "text-slate-800 hover:bg-indigo-50" : "text-slate-400 hover:bg-slate-50"} disabled:cursor-not-allowed disabled:text-slate-300`}>{Number(day.dateKey.slice(-2))}</button>;
    })}</div>
  </div> : null;

  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(11.5rem,1fr)_8rem]">
      <div className="min-w-0">
        <span className="text-sm font-semibold text-slate-700">Date</span>
        <button ref={triggerRef} type="button" onClick={togglePicker} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? "meeting-date-popover" : undefined} aria-label="Choose meeting date" className="mt-1.5 flex h-10 w-full min-w-[11.5rem] items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-left text-sm font-normal text-slate-900 hover:border-indigo-300 disabled:bg-slate-50">
          <span className="whitespace-nowrap">{formatStartDate(dateKey)}</span><span aria-hidden="true" className="text-slate-500">▾</span>
        </button>
      </div>
      <MeetingListbox label="Time" value={time} options={TIME_OPTIONS} onChange={(nextTime) => onChange(`${dateKey}T${nextTime}`)} disabled={disabled} testId="meeting-time-popover" />
      {typeof document !== "undefined" && popover ? createPortal(popover, document.body) : null}
    </div>
  );
}

function personLabel(name: string | null, email: string | null) {
  return name?.trim() || email?.trim() || null;
}

function calendarOwnerLabel(name: string) {
  return `${name}${name.endsWith("s") ? "'" : "'s"} calendar`;
}

export function GoogleMeetingPanel({
  leadId,
  leadName,
  recipientEmail,
  connectionStatus,
  calendarFreeBusy,
  calendarEventsOwned,
  meetings
}: {
  leadId: string;
  leadName: string;
  recipientEmail: string | null;
  connectionStatus: ConnectionStatus;
  calendarFreeBusy: boolean;
  calendarEventsOwned: boolean;
  meetings: GoogleMeetingActivity[];
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [manualStart, setManualStart] = useState(tomorrowAtNine);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [title, setTitle] = useState(`Meeting with ${leadName || "lead"}`);
  const [includeMeet, setIncludeMeet] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [weekStart, setWeekStart] = useState(() => weekStartDateKey(tomorrowAtNine().slice(0, 10)));
  const [showAllTimes, setShowAllTimes] = useState(false);
  const [availabilityState, setAvailabilityState] = useState<"idle" | "checking" | "ready" | "failed">("idle");
  const [availabilityCategory, setAvailabilityCategory] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "saving" | "sent" | "failed" | "unknown">("idle");
  const [scheduledMeeting, setScheduledMeeting] = useState<GoogleMeetingActivity | null>(null);
  const [meetLinkCopied, setMeetLinkCopied] = useState(false);
  const ready = connectionStatus === "connected" && calendarFreeBusy && calendarEventsOwned;
  const email = String(recipientEmail ?? "").trim();
  const availabilityInputKey = `${manualStart}|${durationMinutes}|${timezone}`;
  const availabilityInputKeyRef = useRef(availabilityInputKey);
  const keepAvailabilityAfterSlotSync = useRef(false);
  const selectedDateKey = manualStart.slice(0, 10);
  const weekDates = weekDateKeys(weekStart);

  useEffect(() => {
    if (availabilityInputKeyRef.current === availabilityInputKey) return;
    availabilityInputKeyRef.current = availabilityInputKey;
    if (keepAvailabilityAfterSlotSync.current) {
      keepAvailabilityAfterSlotSync.current = false;
      return;
    }
    setSuggestions([]);
    setSelected(null);
    setShowAllTimes(false);
    setAvailabilityState("idle");
    setAvailabilityCategory(null);
  }, [availabilityInputKey]);

  useEffect(() => {
    setWeekStart(weekStartDateKey(selectedDateKey));
  }, [selectedDateKey]);

  function openCreate() {
    setManualStart(tomorrowAtNine());
    setDurationMinutes(30);
    setTitle(`Meeting with ${leadName || "lead"}`);
    setSuggestions([]);
    setSelected(null);
    setWeekStart(weekStartDateKey(tomorrowAtNine().slice(0, 10)));
    setShowAllTimes(false);
    setAvailabilityState("idle");
    setAvailabilityCategory(null);
    setState("idle");
    setScheduledMeeting(null);
    setMeetLinkCopied(false);
    setDialogOpen(true);
  }

  async function checkAvailability(day = selectedDateKey) {
    if (!day || availabilityState === "checking") return;
    // The service generates slots from this exact lower bound. Keep the chosen
    // time when checking another day instead of silently reopening the morning.
    const selectedTime = manualStart.split("T")[1]?.slice(0, 5) || "09:00";
    setAvailabilityState("checking");
    setAvailabilityCategory(null);
    setSelected(null);
    setShowAllTimes(false);
    try {
      const response = await fetch(`/api/exhibitor/leads/${encodeURIComponent(leadId)}/google/availability`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windowStartLocal: `${day}T${selectedTime}`, windowEndLocal: `${day}T17:00`, timezone, durationMinutes })
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; suggestions?: Suggestion[]; category?: string };
      if (!response.ok || !payload.ok) {
        setAvailabilityState("failed");
        setAvailabilityCategory(payload.category ?? "provider_unavailable");
        return;
      }
      setSuggestions(payload.suggestions ?? []);
      setAvailabilityState("ready");
    } catch {
      setAvailabilityState("failed");
      setAvailabilityCategory("provider_unavailable");
    }
  }

  function selectAvailabilityDate(day: string) {
    setWeekStart(weekStartDateKey(day));
    setManualStart((current) => setDateKeyWithTime(current, day));
    void checkAvailability(day);
  }

  function selectSuggestedTime(slot: Suggestion) {
    keepAvailabilityAfterSlotSync.current = true;
    setSelected(slot);
    setManualStart(localInputValue(new Date(slot.start)));
  }

  function selectedOrManual() {
    if (selected) return selected;
    const start = new Date(manualStart);
    if (!Number.isFinite(start.getTime())) return null;
    return { start: start.toISOString(), end: new Date(start.getTime() + durationMinutes * 60000).toISOString() };
  }

  async function saveMeeting() {
    if (submitting.current) return;
    const slot = selectedOrManual();
    if (!slot || !title.trim()) return;
    submitting.current = true;
    setState("saving");
    const key = crypto.randomUUID();
    try {
      const response = await fetch(`/api/exhibitor/leads/${encodeURIComponent(leadId)}/google/meetings`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: key, includeMeet,
          startsAt: slot.start, endsAt: slot.end, timezone, title
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; outcome?: string; activity?: GoogleMeetingActivity };
      if (payload.ok) {
        setScheduledMeeting(payload.activity ?? null);
        setState("sent");
        router.refresh();
      } else setState(payload.outcome === "unknown" ? "unknown" : "failed");
    } catch {
      setState("unknown");
    } finally {
      submitting.current = false;
    }
  }

  async function copyMeetLink() {
    if (!scheduledMeeting?.googleMeetUri) return;
    try {
      await navigator.clipboard.writeText(scheduledMeeting.googleMeetUri);
      setMeetLinkCopied(true);
    } catch {
      setMeetLinkCopied(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openCreate}
        disabled={!email}
        title={!email ? "No email on file" : undefined}
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-slate-200/90 bg-white px-2.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 sm:px-3"
        data-testid="google-schedule-meeting"
      >
        Schedule meeting
      </button>

      {dialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => state !== "saving" && setDialogOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="google-meeting-title" data-meeting-dialog className="relative flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <h2 id="google-meeting-title" className="text-xl font-bold text-slate-950">{state === "sent" ? "Meeting scheduled" : "Schedule meeting"}</h2>
              {state === "sent" && scheduledMeeting ? (
                <div className="mt-6 text-center" data-testid="google-meeting-confirmation">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-2xl font-bold text-indigo-700" aria-hidden="true">✓</div>
                  <p className="mt-4 text-lg font-semibold text-slate-950">Meeting scheduled</p>
                  <p className="mt-1 text-sm text-slate-600">An invitation was sent to {scheduledMeeting.attendeeEmail}.</p>
                  <dl className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-left text-sm">
                    <div className="flex justify-between gap-4"><dt className="text-slate-500">When</dt><dd className="text-right font-medium text-slate-900">{formatMeetingTime(scheduledMeeting.startsAt, scheduledMeeting.timezone)}</dd></div>
                    <div className="mt-3 flex justify-between gap-4"><dt className="text-slate-500">Duration</dt><dd className="font-medium text-slate-900">{Math.round((Date.parse(scheduledMeeting.endsAt) - Date.parse(scheduledMeeting.startsAt)) / 60000)} minutes</dd></div>
                    <div className="mt-3 flex justify-between gap-4"><dt className="text-slate-500">Timezone</dt><dd className="font-medium text-slate-900">{scheduledMeeting.timezone}</dd></div>
                  </dl>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <a href={`https://calendar.google.com/calendar/u/0/r/eventedit/${encodeURIComponent(scheduledMeeting.googleEventId)}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">Open in Google Calendar</a>
                    {scheduledMeeting.googleMeetUri ? <button type="button" onClick={() => void copyMeetLink()} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">{meetLinkCopied ? "Meet link copied" : "Copy Meet link"}</button> : null}
                  </div>
                  {scheduledMeeting.googleMeetUri ? <a href={scheduledMeeting.googleMeetUri} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-indigo-700 underline">{scheduledMeeting.googleMeetUri}</a> : null}
                </div>
              ) : !ready ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  {connectionStatus === "disconnected" ? "Connect Google Workspace to schedule meetings." : connectionStatus !== "connected" ? "Reconnect Google Workspace to schedule meetings." : !calendarFreeBusy ? "Google did not grant Calendar free/busy permission. Reconnect Google Workspace and approve the requested access." : "Google did not grant owned-calendar permission. Reconnect Google Workspace and approve the requested access."}
                  <a href="/exhibitor/integrations/google-workspace" className="mt-3 block font-semibold text-indigo-700">Manage Google Workspace</a>
                </div>
              ) : (
                <div className="mt-5 grid gap-3">
                  <label className="text-sm font-semibold text-slate-700">Attendee<input readOnly value={email} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 font-normal" /></label>
                  <label className="text-sm font-semibold text-slate-700">Title<input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal" /></label>
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_9rem]">
                    <MeetingStartPicker value={manualStart} onChange={(value) => { setManualStart(value); setSelected(null); }} />
                    <MeetingListbox label="Duration" value={durationMinutes} options={DURATION_OPTIONS} onChange={(value) => { setDurationMinutes(value); setSelected(null); }} testId="meeting-duration-popover" />
                  </div>
                  <p className="-mt-1 text-xs text-slate-500">Timezone: {timezone}</p>

                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">Availability</p>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setWeekStart((value) => addDateKeyDays(value, -7))} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">Previous week</button>
                        <button type="button" onClick={() => selectAvailabilityDate(localInputValue(new Date()).slice(0, 10))} className="rounded-md px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Today</button>
                        <button type="button" onClick={() => setWeekStart((value) => addDateKeyDays(value, 7))} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">Next week</button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-7 gap-1" role="group" aria-label="Availability dates">
                      {weekDates.map((day) => <button type="button" key={day} onClick={() => selectAvailabilityDate(day)} className={`rounded-lg px-1 py-2 text-center text-[11px] font-semibold transition ${selectedDateKey === day ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"}`} aria-pressed={selectedDateKey === day}>{formatDateStripLabel(day)}</button>)}
                    </div>
                  </div>

                  <button type="button" onClick={() => void checkAvailability()} disabled={availabilityState === "checking"} className="h-10 rounded-lg border border-indigo-200 bg-indigo-50 text-sm font-semibold text-indigo-700">{availabilityState === "checking" ? "Checking…" : "Check availability"}</button>
                  {availabilityState === "idle" ? <p className="-mt-1 text-xs text-slate-500">Choose a day or check availability before scheduling.</p> : null}
                  {availabilityState === "failed" ? <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Availability could not be checked. Review your Google Workspace connection and try again.{availabilityCategory === "reconnect_required" ? " Reconnect Google Workspace first." : ""}</p> : null}
                  {availabilityState === "ready" && !suggestions.length ? <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">No available times in this window. Choose another day.</p> : null}
                  {suggestions.length ? <div className="rounded-xl border border-slate-200 bg-white p-3" data-testid="google-availability-times"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-800">{suggestions.length} {suggestions.length === 1 ? "time" : "times"} available</p>{suggestions.length > 6 ? <button type="button" onClick={() => setShowAllTimes((value) => !value)} className="text-xs font-semibold text-slate-700 underline">{showAllTimes ? "Show less" : "View more"}</button> : null}</div><div className="mt-2 grid grid-cols-2 gap-2">{(showAllTimes ? suggestions : suggestions.slice(0, 6)).map((slot) => <button type="button" key={slot.start} onClick={() => selectSuggestedTime(slot)} data-testid={`google-availability-slot-${slot.start}`} className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${selected?.start === slot.start ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-800 hover:border-indigo-300"}`}>{formatSlotTime(slot.start, timezone)}</button>)}</div></div> : null}
                  <label className="-mt-1 flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={includeMeet} onChange={(event) => setIncludeMeet(event.target.checked)} /> Create a Google Meet link</label>
                </div>
              )}
              {state === "unknown" ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Google may have accepted this change. Do not retry until you check the activity.</p> : state === "failed" ? <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Google could not complete this meeting action.</p> : null}
            </div>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">{state === "sent" ? <button type="button" onClick={() => setDialogOpen(false)} className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white">Done</button> : <><button type="button" onClick={() => setDialogOpen(false)} disabled={state === "saving"} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold">Cancel</button>{ready ? <button type="button" onClick={() => void saveMeeting()} disabled={state === "saving" || state === "unknown" || availabilityState !== "ready" || !title.trim()} className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{state === "saving" ? "Saving…" : "Confirm and schedule"}</button> : null}</>}</div>
          </div>
        </div>
      ) : null}

    </>
  );
}

export function GoogleMeetingActivityList({ meetings, leadId, leadName }: { meetings: GoogleMeetingActivity[]; leadId: string; leadName: string }) {
  const router = useRouter();
  const browserTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const [editTarget, setEditTarget] = useState<GoogleMeetingActivity | null>(null);
  const [cancelTarget, setCancelTarget] = useState<GoogleMeetingActivity | null>(null);
  const [startLocal, setStartLocal] = useState("");
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function beginEdit(meeting: GoogleMeetingActivity) {
    setEditTarget(meeting);
    setStartLocal(localInputValue(new Date(meeting.startsAt)));
    setDuration(Math.max(15, Math.round((Date.parse(meeting.endsAt) - Date.parse(meeting.startsAt)) / 60000)));
    setError(null);
  }

  async function updateMeeting() {
    if (!editTarget || busy) return;
    const startsAt = new Date(startLocal);
    if (!Number.isFinite(startsAt.getTime())) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/exhibitor/leads/${encodeURIComponent(leadId)}/google/meetings/${encodeURIComponent(editTarget.id)}`, {
        method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationKey: crypto.randomUUID(), startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + duration * 60000).toISOString(), timezone: browserTimezone, title: `Meeting with ${leadName || "lead"}` })
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; outcome?: string };
      if (!payload.ok) { setError(payload.outcome === "unknown" ? "Update could not be confirmed. Check Google Calendar before retrying." : "Google could not update this meeting."); return; }
      setEditTarget(null);
      router.refresh();
    } catch {
      setError("Update could not be confirmed. Check Google Calendar before retrying.");
    } finally { setBusy(false); }
  }

  async function cancelMeeting() {
    if (!cancelTarget || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/exhibitor/leads/${encodeURIComponent(leadId)}/google/meetings/${encodeURIComponent(cancelTarget.id)}`, {
        method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationKey: crypto.randomUUID() })
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; outcome?: string };
      if (!payload.ok) { setError(payload.outcome === "unknown" ? "Cancellation could not be confirmed. Check Google Calendar before retrying." : "Google could not cancel this meeting."); return; }
      setCancelTarget(null);
      router.refresh();
    } catch {
      setError("Cancellation could not be confirmed. Check Google Calendar before retrying.");
    } finally { setBusy(false); }
  }

  return (
    <>
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="google-meeting-activity">
      <h2 className="text-base font-bold text-slate-950">Meeting activity</h2>
      <p className="mt-1 text-sm text-slate-600">Scheduled meetings and their current status.</p>
      {meetings.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No meetings scheduled for this lead.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {meetings.map((meeting) => {
            const calendarOwner = personLabel(meeting.calendarOwnerName, meeting.calendarOwnerEmail);
            const actingUser = personLabel(meeting.actingUserName, meeting.actingUserEmail);
            return (
              <li key={meeting.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                <p className="text-sm font-semibold text-slate-900">{formatMeetingTime(meeting.startsAt, meeting.timezone)}</p>
                <p className="text-xs text-slate-500">
                  {meeting.status === "cancelled" ? "Cancelled" : meeting.lastOperationStatus === "unknown" ? "Status unknown" : meeting.lastOperationStatus === "failed" ? "Failed" : meeting.lastOperationStatus === "pending" ? "In progress" : "Scheduled"}
                  {" · Google Workspace"}
                  {calendarOwner ? ` · ${calendarOwnerLabel(calendarOwner)}` : ""}
                  {actingUser ? ` · Scheduled by ${actingUser}` : ""}
                  {meeting.googleMeetUri ? " · Google Meet" : ""}
                </p>
              </div>
              {meeting.status === "scheduled" ? <div className="flex gap-3"><button type="button" onClick={() => beginEdit(meeting)} className="text-xs font-semibold text-indigo-700">Update</button><button type="button" onClick={() => { setError(null); setCancelTarget(meeting); }} className="text-xs font-semibold text-rose-700">Cancel</button></div> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
    {editTarget ? <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-slate-900/60" onClick={() => !busy && setEditTarget(null)} /><div role="dialog" aria-modal="true" data-meeting-dialog className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-xl font-bold">Update meeting</h2><div className="mt-4"><p className="text-sm font-semibold">Start</p><MeetingStartPicker value={startLocal} onChange={setStartLocal} disabled={busy} /></div><div className="mt-4"><MeetingListbox label="Duration" value={duration} options={DURATION_OPTIONS} onChange={setDuration} disabled={busy} testId="meeting-update-duration-popover" /></div><p className="mt-2 text-xs text-slate-500">Timezone: {browserTimezone}</p>{error ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : null}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setEditTarget(null)} disabled={busy} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold">Cancel</button><button type="button" onClick={() => void updateMeeting()} disabled={busy} className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Updating…" : "Confirm update"}</button></div></div></div> : null}
    {cancelTarget ? <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-slate-900/60" onClick={() => !busy && setCancelTarget(null)} /><div role="dialog" aria-modal="true" className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-xl font-bold">Cancel this meeting?</h2><p className="mt-2 text-sm text-slate-600">Google Calendar will notify the lead that the meeting was cancelled.</p>{error ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : null}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setCancelTarget(null)} disabled={busy} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold">Keep meeting</button><button type="button" onClick={() => void cancelMeeting()} disabled={busy || Boolean(error?.includes("could not be confirmed"))} className="h-10 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Cancelling…" : "Confirm cancellation"}</button></div></div></div> : null}
    </>
  );
}
