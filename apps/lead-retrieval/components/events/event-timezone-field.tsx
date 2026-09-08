"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  EVENT_TIMEZONE_OPTIONS,
  eventTimezoneLabel,
  findEventTimezoneOption
} from "@/lib/events/event-timezone-options";

export function EventTimezoneField({
  defaultValue = "",
  disabled = false,
  className
}: {
  defaultValue?: string | null;
  disabled?: boolean;
  className: string;
}) {
  const initialValue = String(defaultValue ?? "").trim();
  const [value, setValue] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showOtherInput, setShowOtherInput] = useState(Boolean(initialValue && !findEventTimezoneOption(initialValue)));
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selectedOption = findEventTimezoneOption(value);
  const isOther = Boolean(value && !selectedOption);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = EVENT_TIMEZONE_OPTIONS.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : EVENT_TIMEZONE_OPTIONS.length);
    const focusList = window.setTimeout(() => listRef.current?.focus(), 0);
    function closeOnOutsideClick(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(focusList);
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function choose(nextValue: string) {
    setValue(nextValue);
    setShowOtherInput(false);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function chooseOther() {
    setShowOtherInput(true);
    setOpen(false);
  }

  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-slate-700">Event timezone *</span>
      <input type="hidden" name="timezone" value={value} required />
      <div ref={wrapRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
            aria-controls={listId}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className={`${className} flex items-center justify-between gap-3 text-left ${open ? "border-indigo-300 ring-4 ring-indigo-100" : "hover:border-slate-300"}`}
        >
          <span className={value ? "truncate" : "truncate text-slate-400"}>{eventTimezoneLabel(value)}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>

        {open ? (
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label="Event timezone"
            aria-activedescendant={`${listId}-option-${activeIndex}`}
            onKeyDown={(event) => {
              const lastIndex = EVENT_TIMEZONE_OPTIONS.length;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(lastIndex, index + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(0, index - 1));
              } else if (event.key === "Home") {
                event.preventDefault();
                setActiveIndex(0);
              } else if (event.key === "End") {
                event.preventDefault();
                setActiveIndex(lastIndex);
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                const option = EVENT_TIMEZONE_OPTIONS[activeIndex];
                if (option) choose(option.value);
                else chooseOther();
              }
            }}
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-slate-200/90 bg-white py-1 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5"
          >
            {EVENT_TIMEZONE_OPTIONS.map((option) => {
              const selected = value === option.value;
              return (
                <button
                  key={option.value}
                  id={`${listId}-option-${EVENT_TIMEZONE_OPTIONS.indexOf(option)}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={selected}
                  onClick={() => choose(option.value)}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition ${selected ? "bg-indigo-50 text-indigo-950" : activeIndex === EVENT_TIMEZONE_OPTIONS.indexOf(option) ? "bg-slate-50 text-slate-900" : "text-slate-800 hover:bg-slate-50"}`}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {selected ? <Check className="h-3.5 w-3.5 text-indigo-600" strokeWidth={2.5} /> : null}
                  </span>
                  <span className="font-medium">{option.label}</span>
                </button>
              );
            })}
            <div className="my-1 border-t border-slate-100" />
            <button
              type="button"
              id={`${listId}-option-${EVENT_TIMEZONE_OPTIONS.length}`}
              role="option"
              tabIndex={-1}
              aria-selected={isOther}
              onClick={chooseOther}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition ${isOther ? "bg-indigo-50 text-indigo-950" : activeIndex === EVENT_TIMEZONE_OPTIONS.length ? "bg-slate-50 text-slate-900" : "text-slate-700 hover:bg-slate-50"}`}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {isOther ? <Check className="h-3.5 w-3.5 text-indigo-600" strokeWidth={2.5} /> : null}
              </span>
              <span className="font-medium">Other timezone…</span>
            </button>
          </div>
        ) : null}
      </div>
      {showOtherInput ? (
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="e.g. Europe/London"
          autoComplete="off"
          disabled={disabled}
          aria-label="Other IANA timezone"
          className={className}
        />
      ) : null}
      <span className="block text-xs font-normal text-slate-500">
        Choose the event’s local timezone. This controls event days and dashboard metrics.
      </span>
    </label>
  );
}
