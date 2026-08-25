"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

type MarketingDatePickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: ReactNode;
};

const POPOVER_WIDTH = 294;
const POPOVER_HEIGHT = 336;
const VIEWPORT_PADDING = 16;
const POPOVER_OFFSET = 8;

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function MarketingDatePicker({ label, value, onChange, helper }: MarketingDatePickerProps) {
  const selectedDate = parseDateInput(value);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const base = selectedDate ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const weeks = useMemo(() => {
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_item, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [visibleMonth]);

  const displayValue = selectedDate
    ? selectedDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "Select date";

  function moveMonth(delta: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function choose(date: Date) {
    onChange(toDateInput(date));
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setOpen(false);
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    function updatePopoverPosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const availableBelow = viewportHeight - rect.bottom - VIEWPORT_PADDING - POPOVER_OFFSET;
      const availableAbove = rect.top - VIEWPORT_PADDING - POPOVER_OFFSET;
      const showAbove = availableBelow < POPOVER_HEIGHT && availableAbove > availableBelow;
      const maxHeight = Math.max(220, Math.min(POPOVER_HEIGHT, showAbove ? availableAbove : availableBelow));
      const unclampedLeft = rect.left;
      const maxLeft = Math.max(VIEWPORT_PADDING, viewportWidth - POPOVER_WIDTH - VIEWPORT_PADDING);
      const left = Math.min(Math.max(unclampedLeft, VIEWPORT_PADDING), maxLeft);
      const top = showAbove
        ? Math.max(VIEWPORT_PADDING, rect.top - maxHeight - POPOVER_OFFSET)
        : Math.min(rect.bottom + POPOVER_OFFSET, viewportHeight - maxHeight - VIEWPORT_PADDING);

      setPopoverStyle({ top, left, maxHeight });
    }

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <span className="text-[12px] font-semibold text-slate-700">{label}</span>
      <div className="mt-1 flex h-11 items-center rounded-xl border border-slate-200 bg-white focus-within:border-slate-300">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex h-full min-w-0 flex-1 items-center gap-2 rounded-l-xl px-3 text-left text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          aria-label={`Open ${label} calendar`}
        >
          <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
          <span className={selectedDate ? "truncate text-slate-800" : "truncate text-slate-400"}>
            {displayValue}
          </span>
        </button>
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            aria-label={`Clear ${label}`}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {helper ? <span className="mt-1 block text-[12px] text-slate-400">{helper}</span> : null}

      {open && mounted && popoverStyle
        ? createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[70] w-[294px] overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
          style={{
            top: popoverStyle.top,
            left: popoverStyle.left,
            maxHeight: popoverStyle.maxHeight,
          }}
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-[13px] font-semibold text-slate-900">{monthLabel(visibleMonth)}</div>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-slate-400">
            {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
              <div key={`${day}-${index}`} className="py-1">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weeks.map((date) => {
              const dateValue = toDateInput(date);
              const inMonth = date.getMonth() === visibleMonth.getMonth();
              const selected = value === dateValue;
              return (
                <button
                  key={dateValue}
                  type="button"
                  onClick={() => choose(date)}
                  className={`h-8 rounded-lg text-[12px] font-semibold transition ${
                    selected
                      ? "bg-[#28439A] text-white"
                      : inMonth
                        ? "text-slate-700 hover:bg-slate-100"
                        : "text-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )
        : null}
    </div>
  );
}
