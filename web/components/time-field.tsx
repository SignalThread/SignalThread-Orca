"use client";

import { Clock3, ChevronDown } from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type TimeFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
  name?: string;
  className?: string;
  inputClassName?: string;
  popoverClassName?: string;
  size?: "default" | "compact";
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
};

type ParsedTime = {
  hours: number;
  minutes: number;
};

function toTimeValue({ hours, minutes }: ParsedTime, preserveSeconds: boolean): string {
  const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  return preserveSeconds ? `${value}:00` : value;
}

export function parseTimeInput(value: string): ParsedTime | null {
  const match = value.trim().match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  const rawHours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const meridiem = match[3]?.toLowerCase();
  if (!Number.isInteger(rawHours) || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) return null;

  if (meridiem) {
    if (rawHours < 1 || rawHours > 12) return null;
    return {
      hours: (rawHours % 12) + (meridiem === "pm" ? 12 : 0),
      minutes,
    };
  }

  return rawHours >= 0 && rawHours <= 23 ? { hours: rawHours, minutes } : null;
}

export function formatTimeForDisplay(value: string): string {
  const parsed = parseTimeInput(value);
  if (!parsed) return "";
  const meridiem = parsed.hours >= 12 ? "PM" : "AM";
  const hours = parsed.hours % 12 || 12;
  return `${hours}:${String(parsed.minutes).padStart(2, "0")} ${meridiem}`;
}

export function buildTimeOptions(interval = 15): string[] {
  return Array.from({ length: (24 * 60) / interval }, (_, index) =>
    formatTimeForDisplay(toTimeValue({ hours: Math.floor((index * interval) / 60), minutes: (index * interval) % 60 }, false)),
  );
}

function mergeClassNames(parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function TimeField({
  value,
  onChange,
  disabled = false,
  required = false,
  ariaLabel,
  name,
  className,
  inputClassName,
  popoverClassName,
  size = "default",
  onKeyDown,
}: TimeFieldProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [draftValue, setDraftValue] = useState("");
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);
  const preserveSeconds = /^\d{2}:\d{2}:\d{2}$/.test(value);
  const options = useMemo(() => buildTimeOptions(), []);
  const isCompact = size === "compact";

  const updatePopoverPosition = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const popoverWidth = popoverRef.current?.offsetWidth ?? 192;
    const viewportPadding = 8;
    setPopoverStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left: Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - popoverWidth - viewportPadding)),
      zIndex: 90,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePopoverPosition();

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setIsOpen(false);
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.focus();
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

  function commitDraft() {
    if (!draftValue.trim()) {
      onChange("");
      return true;
    }
    const parsed = parseTimeInput(draftValue);
    if (!parsed) {
      setDraftValue(formatTimeForDisplay(value));
      return false;
    }
    const nextValue = toTimeValue(parsed, preserveSeconds);
    onChange(nextValue);
    setDraftValue(formatTimeForDisplay(nextValue));
    return true;
  }

  function chooseTime(option: string) {
    const parsed = parseTimeInput(option);
    if (!parsed) return;
    const nextValue = toTimeValue(parsed, preserveSeconds);
    onChange(nextValue);
    setDraftValue(formatTimeForDisplay(nextValue));
    setIsOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div ref={rootRef} className={mergeClassNames(["relative", className])}>
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      <div
        className={mergeClassNames([
          "group flex w-full items-center rounded-xl border border-slate-200 bg-white text-slate-900 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition focus-within:border-slate-400 focus-within:ring-4 focus-within:ring-slate-200/70 hover:border-slate-300 hover:bg-slate-50/80",
          disabled ? "cursor-not-allowed bg-slate-50 text-slate-400" : "",
          isCompact ? "h-8" : "h-11",
          inputClassName,
        ])}
      >
        <Clock3 className={mergeClassNames(["ml-3 shrink-0 text-slate-400", isCompact ? "h-3.5 w-3.5" : "h-4 w-4"])} aria-hidden />
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={isFocused ? draftValue : formatTimeForDisplay(value)}
          onChange={(event) => setDraftValue(event.target.value)}
          onFocus={() => {
            setDraftValue(formatTimeForDisplay(value));
            setIsFocused(true);
          }}
          onBlur={() => {
            setIsFocused(false);
            commitDraft();
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (!disabled) {
                updatePopoverPosition();
                setIsOpen(true);
              }
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (commitDraft()) setIsOpen(false);
            }
            onKeyDown?.(event);
          }}
          disabled={disabled}
          aria-label={ariaLabel}
          placeholder="9:00 AM"
          className={mergeClassNames([
            "min-w-0 flex-1 bg-transparent px-2 text-left outline-none placeholder:text-slate-400",
            isCompact ? "text-xs" : "text-[14px]",
          ])}
        />
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            updatePopoverPosition();
            setIsOpen((current) => !current);
          }}
          aria-label={`Choose ${ariaLabel ?? "time"}`}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          className={mergeClassNames([
            "mr-1 inline-flex items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed",
            isCompact ? "h-6 w-6" : "h-8 w-8",
          ])}
        >
          <ChevronDown className={mergeClassNames(["transition", isCompact ? "h-3.5 w-3.5" : "h-4 w-4", isOpen ? "rotate-180" : ""])} />
        </button>
      </div>

      {isOpen
        ? createPortal(
            <div
              ref={popoverRef}
              id={listboxId}
              role="listbox"
              aria-label={`${ariaLabel ?? "Time"} options`}
              style={popoverStyle ?? undefined}
              className={mergeClassNames([
                "w-48 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_24px_70px_-30px_rgba(15,23,42,0.45)] ring-1 ring-slate-950/[0.03]",
                popoverClassName,
              ])}
            >
              <div className="max-h-64 overflow-y-auto py-0.5" aria-label="15 minute time options">
                {options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={formatTimeForDisplay(value) === option}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseTime(option)}
                    className={mergeClassNames([
                      "flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium transition",
                      formatTimeForDisplay(value) === option
                        ? "bg-[#28439A] text-white"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
                    ])}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
