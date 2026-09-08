"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject
} from "react";
import { createPortal } from "react-dom";
import {
  PRIORITY_LEVELS,
  priorityLevelChipClass,
  priorityLevelLabel,
  scoreToPriorityLevel,
  type PriorityLevel
} from "@/lib/leads/priorityLevels";

function useFixedMenuPosition(open: boolean, anchorRef: RefObject<HTMLElement | null>) {
  const [box, setBox] = useState({ top: 0, left: 0, width: 176 });

  const update = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 176);
    setBox({
      top: r.bottom + 4,
      left: r.left,
      width
    });
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

export function CardPriorityChipSelect({
  leadId,
  priorityScore,
  saving,
  onChangeLevel
}: {
  leadId: string;
  priorityScore: number;
  saving: boolean;
  onChangeLevel: (level: PriorityLevel) => void;
}) {
  const level = scoreToPriorityLevel(priorityScore);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const { box, update } = useFixedMenuPosition(open, anchorRef);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
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

  const currentLabel = priorityLevelLabel(level);

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            id={`priority-menu-${leadId}`}
            className="fixed z-[500] max-h-[min(320px,calc(100vh-24px))] overflow-y-auto rounded-xl border border-slate-200 bg-white py-2 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/[0.08]"
            style={{
              top: box.top,
              left: box.left,
              minWidth: box.width,
              maxWidth: "min(100vw - 16px, 280px)",
              backgroundColor: "#ffffff"
            }}
          >
            {PRIORITY_LEVELS.map((p) => (
              <li key={p.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={level === p.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeLevel(p.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center px-2.5 py-2.5 text-left text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/45 focus-visible:ring-offset-1 ${
                    level === p.id ? "bg-slate-100/90" : "hover:bg-slate-50/90"
                  }`}
                >
                  <span
                    className={`inline-flex max-w-full truncate rounded-full px-2 py-0.5 ${priorityLevelChipClass(p.id)}`}
                  >
                    {p.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )
      : null;

  return (
    <div
      className="relative flex min-w-[8rem] max-w-[9rem] shrink-0 flex-col gap-1"
      data-interactive
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Priority</span>
      <button
        ref={anchorRef}
        type="button"
        disabled={saving}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `priority-menu-${leadId}` : undefined}
        aria-label="Lead priority"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`inline-flex w-full min-h-[2rem] items-center justify-between gap-1 rounded-full px-2.5 py-1 text-left text-[11px] font-semibold transition hover:opacity-[0.98] focus:outline-none disabled:opacity-60 ${priorityLevelChipClass(level)}`}
      >
        <span className="min-w-0 truncate">{currentLabel}</span>
        <span className="shrink-0 text-[9px] opacity-75" aria-hidden>
          ▾
        </span>
      </button>
      {menu}
    </div>
  );
}
