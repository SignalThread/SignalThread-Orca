"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { EVENT_GOAL_PRESETS } from "@/lib/import-wizard/batch-briefing-context";

type Props = {
  value: string;
  onSelectPreset: (presetValue: string) => void;
  onPickCustom: () => void;
  disabled?: boolean;
};

export function BriefingSetupEventGoalCombobox({ value, onSelectPreset, onPickCustom, disabled }: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const matchedPreset = EVENT_GOAL_PRESETS.find((p) => p.value === value);
  const isCustomCopy = value.trim() !== "" && !matchedPreset;

  const triggerLabel = matchedPreset
    ? matchedPreset.label
    : isCustomCopy
      ? "Custom goal"
      : "Select a goal…";

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        id="batch-context-goal-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        data-testid="batch-context-goal"
        onClick={() => !disabled && setOpen((o) => !o)}
        className={
          "flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200/95 bg-white px-3.5 py-2.5 text-left text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition " +
          "hover:border-slate-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 " +
          (disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer") +
          (open ? " border-indigo-300 ring-2 ring-indigo-100" : "")
        }
      >
        <span className={`min-w-0 truncate ${!matchedPreset && !isCustomCopy ? "text-slate-400" : ""}`}>{triggerLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-labelledby="batch-context-goal-trigger"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-slate-200/90 bg-white py-1 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5"
        >
          <div className="max-h-[min(22rem,60vh)] overflow-y-auto py-1">
            {EVENT_GOAL_PRESETS.map((p) => {
              const selected = value === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={
                    "flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm transition " +
                    (selected ? "bg-indigo-50 text-indigo-950" : "text-slate-800 hover:bg-slate-50")
                  }
                  onClick={() => {
                    onSelectPreset(p.value);
                    close();
                  }}
                >
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                    {selected ? <Check className="h-3.5 w-3.5 text-indigo-600" strokeWidth={2.5} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-tight">{p.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{p.description}</span>
                  </span>
                </button>
              );
            })}
            <div className="my-1 border-t border-slate-100" />
            <button
              type="button"
              role="option"
              aria-selected={isCustomCopy}
              className={
                "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition " +
                (isCustomCopy ? "bg-indigo-50 text-indigo-950" : "text-slate-700 hover:bg-slate-50")
              }
              onClick={() => {
                onPickCustom();
                close();
              }}
            >
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                {isCustomCopy ? <Check className="h-3.5 w-3.5 text-indigo-600" strokeWidth={2.5} /> : null}
              </span>
              <span className="font-medium">Custom goal…</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
