"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from "react";
import { createPortal } from "react-dom";
import { toDateInputValue } from "@/lib/leads/leadDateInput";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatChip(iso: string | null) {
  if (!iso) return "Set date";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "Set date";
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" })
  });
}

function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 42) cells.push(null);
  return cells;
}

const POPOVER_W = 288;
const POPOVER_EST_H = 340;

function usePopoverPosition(open: boolean, anchorRef: RefObject<HTMLElement | null>) {
  const [box, setBox] = useState({ top: 0, left: 0 });

  const update = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let top = r.bottom + 6;
    if (top + POPOVER_EST_H > window.innerHeight - 8) {
      top = Math.max(8, r.top - POPOVER_EST_H - 6);
    }
    const left = Math.min(Math.max(8, r.left), window.innerWidth - POPOVER_W - 8);
    setBox({ top, left });
  }, [anchorRef]);

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

  return { box, update };
}

type LeadCardDateFieldProps = {
  followUpDate: string | null;
  onCommit: (isoYmd: string | null) => void;
  disabled?: boolean;
  /** Panel: Leads list intelligence strip. Toolbar: nested in lead detail header row. */
  variant?: "default" | "panel" | "detail" | "profile" | "toolbar";
};

export function LeadCardDateField({
  followUpDate,
  onCommit,
  disabled,
  variant = "default"
}: LeadCardDateFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = toDateInputValue(followUpDate) || null;
  const initialCursor = useMemo(() => {
    if (selected) {
      const [y, m] = selected.split("-").map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  }, [selected, followUpDate]);

  const [cursor, setCursor] = useState(initialCursor);
  const wrapRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { box, update } = usePopoverPosition(open, anchorRef);

  useEffect(() => {
    setCursor(initialCursor);
  }, [initialCursor]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
      update();
    }
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, update]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const todayYmd = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
  }, []);

  function pickDay(day: number) {
    const iso = `${year}-${pad2(month + 1)}-${pad2(day)}`;
    onCommit(iso);
    setOpen(false);
  }

  function clearDate() {
    onCommit(null);
    setOpen(false);
  }

  const triggerClass =
    variant === "toolbar"
      ? "inline-flex h-9 min-w-[5.25rem] cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-1 text-left text-xs font-semibold text-slate-800 shadow-none ring-0 transition hover:bg-slate-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/35 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[5.75rem] sm:px-1.5"
      : variant === "panel"
        ? "inline-flex h-9 min-w-[6.75rem] cursor-pointer items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-2.5 text-left text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-900/[0.05] transition hover:border-slate-300 hover:bg-slate-50/90 hover:ring-slate-900/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/35 disabled:cursor-not-allowed disabled:opacity-50"
      : variant === "detail"
        ? "inline-flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-900 shadow-sm outline-none transition hover:border-slate-300 hover:bg-slate-50 focus-visible:border-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
        : variant === "profile"
          ? "inline-flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-900 shadow-sm outline-none transition hover:border-slate-300 hover:bg-slate-50 focus-visible:border-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
          : "inline-flex h-8 min-w-[7.5rem] cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-left text-xs font-bold text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/35 disabled:cursor-not-allowed disabled:opacity-50";

  const popover = open ? (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Choose follow-up date"
      className="fixed z-[500] rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/[0.06]"
      style={{
        top: box.top,
        left: box.left,
        width: POPOVER_W,
        maxHeight: "min(100vh - 16px, 380px)"
      }}
      data-interactive
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100"
          aria-label="Previous month"
          onClick={(e) => {
            e.stopPropagation();
            setCursor(new Date(year, month - 1, 1));
          }}
        >
          <span className="text-lg leading-none">‹</span>
        </button>
        <span className="text-sm font-semibold tabular-nums text-slate-800">{monthLabel}</span>
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100"
          aria-label="Next month"
          onClick={(e) => {
            e.stopPropagation();
            setCursor(new Date(year, month + 1, 1));
          }}
        >
          <span className="text-lg leading-none">›</span>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-sm">
        {grid.map((cell, i) =>
          cell == null ? (
            <div key={`e-${i}`} className="h-9" />
          ) : (
            <button
              key={`d-${cell}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                pickDay(cell);
              }}
              className={`flex h-9 w-full items-center justify-center rounded-lg text-sm font-medium tabular-nums transition ${
                selected === `${year}-${pad2(month + 1)}-${pad2(cell)}`
                  ? "bg-indigo-600 text-white shadow-sm"
                  : todayYmd === `${year}-${pad2(month + 1)}-${pad2(cell)}`
                    ? "border border-indigo-200 bg-indigo-50 text-indigo-900"
                    : "text-slate-800 hover:bg-slate-100"
              }`}
            >
              {cell}
            </button>
          )
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          clearDate();
        }}
        className="mt-3 w-full rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
      >
        Clear date
      </button>
    </div>
  ) : null;

  const portal =
    typeof document !== "undefined" && popover ? createPortal(popover, document.body) : null;

  return (
    <div ref={wrapRef} className="relative" data-interactive>
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={triggerClass}
      >
        <svg
          className="h-4 w-4 shrink-0 text-slate-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span className="min-w-0 flex-1 truncate">{formatChip(selected)}</span>
      </button>

      {portal}
    </div>
  );
}
