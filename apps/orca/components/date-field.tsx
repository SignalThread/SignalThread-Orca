"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  type CSSProperties,
  forwardRef,
  type KeyboardEvent,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type DateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  name?: string;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
  size?: "default" | "compact";
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

type CalendarDay = {
  date: Date;
  iso: string;
  inMonth: boolean;
};

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const DISPLAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const;

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonths(date: Date, count: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function formatDisplayDate(value: string): string {
  const date = parseIsoDate(value);
  return date ? DISPLAY_FORMATTER.format(date) : "";
}

function buildCalendarDays(month: Date): CalendarDay[] {
  const first = startOfMonth(month);
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - first.getUTCDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);
    return {
      date,
      iso: toIsoDate(date),
      inMonth: date.getUTCMonth() === first.getUTCMonth(),
    };
  });
}

function mergeClassNames(parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export const DateField = forwardRef<HTMLButtonElement, DateFieldProps>(function DateField(
  {
    value,
    onChange,
    min,
    disabled = false,
    required = false,
    placeholder = "Select date",
    ariaLabel,
    name,
    className,
    buttonClassName,
    popoverClassName,
    size = "default",
    onKeyDown,
  },
  ref,
) {
  const calendarId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);
  const selectedDate = parseIsoDate(value);
  const minDate = min ? parseIsoDate(min) : null;
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => startOfMonth(selectedDate ?? minDate ?? todayUtc()));
  const alignPopoverEnd = popoverClassName?.includes("right-0") ?? false;

  const updatePopoverPosition = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const rect = root.getBoundingClientRect();
    const popoverWidth = popoverRef.current?.offsetWidth ?? 280;
    const viewportPadding = 8;
    const left = alignPopoverEnd ? rect.right - popoverWidth : rect.left;
    const clampedLeft = Math.max(
      viewportPadding,
      Math.min(left, window.innerWidth - popoverWidth - viewportPadding),
    );

    setPopoverStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left: clampedLeft,
      zIndex: 90,
    });
  }, [alignPopoverEnd]);

  useEffect(() => {
    if (!isOpen) return;
    updatePopoverPosition();

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, updatePopoverPosition]);

  const days = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const todayIso = toIsoDate(todayUtc());
  const selectedIso = selectedDate ? toIsoDate(selectedDate) : "";
  const minIso = minDate ? toIsoDate(minDate) : "";
  const canSelectToday = !minIso || todayIso >= minIso;
  const displayValue = value ? formatDisplayDate(value) : "";
  const isCompact = size === "compact";

  function selectDate(nextValue: string) {
    onChange(nextValue);
    setIsOpen(false);
  }

  return (
    <div ref={rootRef} className={mergeClassNames(["relative", className])}>
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      <button
        ref={ref as Ref<HTMLButtonElement>}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={calendarId}
        onClick={() => {
          if (!disabled) {
            if (!isOpen) {
              setVisibleMonth(startOfMonth(selectedDate ?? minDate ?? todayUtc()));
            }
            updatePopoverPosition();
            setIsOpen((current) => !current);
          }
        }}
        onKeyDown={onKeyDown}
        className={mergeClassNames([
          "group inline-flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white text-left text-slate-900 shadow-[0_1px_0_rgba(15,23,42,0.03)] outline-none transition",
          "hover:border-slate-300 hover:bg-slate-50/80 focus:border-slate-400 focus:ring-4 focus:ring-slate-200/70 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400",
          isCompact ? "h-8 px-2 text-xs" : "h-11 px-3 text-[14px]",
          buttonClassName,
        ])}
      >
        <span className={mergeClassNames([displayValue ? "text-slate-900" : "text-slate-400", "truncate"])}>
          {displayValue || placeholder}
        </span>
        <CalendarDays className={mergeClassNames([
          "shrink-0 text-slate-400 transition group-hover:text-slate-600",
          isCompact ? "h-3.5 w-3.5" : "h-4 w-4",
        ])} />
      </button>

      {isOpen ? createPortal(
        <div
          ref={popoverRef}
          data-date-field-popover="true"
          id={calendarId}
          role="dialog"
          aria-label={ariaLabel ?? "Choose date"}
          style={popoverStyle ?? undefined}
          className={mergeClassNames([
            "w-[17.5rem] rounded-2xl border border-slate-200/90 bg-white p-2.5 shadow-[0_24px_70px_-30px_rgba(15,23,42,0.45)] ring-1 ring-slate-950/[0.03]",
            popoverClassName,
          ])}
        >
          <div className="flex items-center justify-between gap-3 px-1">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Select date</p>
              <p className="text-[14px] font-semibold tracking-tight text-slate-950">
                {MONTH_FORMATTER.format(visibleMonth)}
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-slate-950 hover:shadow-sm"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-slate-950 hover:shadow-sm"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 px-1 text-center text-[10px] font-semibold text-slate-400">
            {WEEKDAY_LABELS.map((weekday, index) => (
              <span key={`${weekday}-${index}`}>{weekday}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map((day) => {
              const isSelected = day.iso === selectedIso;
              const isToday = day.iso === todayIso;
              const isDisabled = Boolean(minIso && day.iso < minIso);
              return (
                <button
                  key={day.iso}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => selectDate(day.iso)}
                  className={mergeClassNames([
                    "relative inline-flex h-7 items-center justify-center rounded-lg text-[12px] font-medium transition",
                    isSelected
                      ? "bg-slate-950 text-white shadow-[0_10px_24px_-14px_rgba(15,23,42,0.9)]"
                      : day.inMonth
                        ? "text-slate-800 hover:bg-slate-100 hover:text-slate-950"
                        : "text-slate-300 hover:bg-slate-50",
                    isToday && !isSelected ? "ring-1 ring-inset ring-slate-300" : "",
                    isDisabled ? "cursor-not-allowed text-slate-200 hover:bg-transparent" : "",
                  ])}
                >
                  {day.date.getUTCDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={() => selectDate("")}
              className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={!canSelectToday}
              onClick={() => selectDate(toIsoDate(todayUtc()))}
              className="rounded-full bg-slate-950 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              Today
            </button>
          </div>
        </div>
        , document.body) : null}
    </div>
  );
});
