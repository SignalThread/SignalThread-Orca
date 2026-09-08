"use client";

import { useEffect, useMemo, useState } from "react";
import { SignalIcon } from "@/components/signals/signal-icon";
import type { SignalRecord } from "@/components/signals/signal-types";
import { signalScopeLabel } from "@/lib/signals/signal-scope";

function scopeLabel(signal: Pick<SignalRecord, "signal_scope">) {
  return signalScopeLabel(signal.signal_scope);
}

const EMPTY_SELECTED_SIGNAL_NAMES: string[] = [];

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === left[index]);
}

export type SignalLibrarySelectModalProps = {
  open: boolean;
  signals: SignalRecord[];
  initialSelectedSignalNames?: string[];
  onClose: () => void;
  onSelectSignals?: (signalNames: string[]) => void;
};

/**
 * Campaign Builder (and similar): pick existing signals by name.
 * Create/edit flows live on dedicated pages — not here.
 */
export function SignalLibraryModal({
  open,
  signals,
  initialSelectedSignalNames = EMPTY_SELECTED_SIGNAL_NAMES,
  onClose,
  onSelectSignals
}: SignalLibrarySelectModalProps) {
  const [search, setSearch] = useState("");
  const [selectedNames, setSelectedNames] = useState<string[]>(initialSelectedSignalNames);
  const selectedNamesKey = useMemo(
    () => initialSelectedSignalNames.join("\u001f"),
    [initialSelectedSignalNames]
  );

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelectedNames((current) =>
      arraysEqual(current, initialSelectedSignalNames) ? current : initialSelectedSignalNames
    );
  }, [open, selectedNamesKey]);

  const selectableSignals = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return signals.filter((item) => {
      if (!item.is_active) return false;
      if (normalizedSearch && !`${item.name} ${item.category}`.toLowerCase().includes(normalizedSearch)) {
        return false;
      }
      return true;
    });
  }, [search, signals]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close Campaign Agent picker"
        className="min-h-0 flex-1 cursor-default bg-slate-900/[0.28] backdrop-blur-md backdrop-saturate-100"
        onClick={onClose}
      />
      <aside className="flex h-full w-full max-w-[min(40rem,100vw)] shrink-0 flex-col border-l border-slate-200/80 bg-gradient-to-b from-slate-50 via-white to-slate-50/95 shadow-[-24px_0_48px_-12px_rgba(15,23,42,0.12)]">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <div className="space-y-4 p-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Add more Campaign Agents</h2>
              <p className="mt-1 text-sm text-slate-600">Select reusable email-writing agents for this campaign.</p>
            </div>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Campaign Agents..."
              className="w-full rounded-xl border px-4 py-3"
            />

            <div className="max-h-[60vh] space-y-2 overflow-y-auto">
              {selectableSignals.map((item) => {
                const checked = selectedNames.includes(item.name);
                return (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border bg-slate-50 px-3 py-3"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedNames((current) =>
                          checked ? current.filter((value) => value !== item.name) : [...current, item.name]
                        )
                      }
                      className="mt-1 h-4 w-4"
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <SignalIcon name={item.name} category={item.category} />
                        <p className="font-semibold text-slate-900">{item.name}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded bg-slate-100 px-2 py-1 font-semibold text-slate-700">{item.category}</span>
                        <span className="rounded bg-violet-100 px-2 py-1 font-semibold text-violet-700">{scopeLabel(item)}</span>
                        {item.override_active ? (
                          <span className="rounded bg-amber-100 px-2 py-1 font-semibold text-amber-700">Override Active</span>
                        ) : null}
                      </div>
                      <p className="line-clamp-2 text-xs text-slate-600">{item.effective_prompt}</p>
                    </div>
                  </label>
                );
              })}
              {selectableSignals.length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-slate-500">
                  No Campaign Agents found.
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200/80 pt-4">
              <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 font-semibold">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onSelectSignals?.(selectedNames)}
                className="rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-5 py-2 font-semibold text-white"
              >
                Confirm selection
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
