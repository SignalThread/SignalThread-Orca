"use client";

import { Check, Plus, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

export type Matrix2InlinePickerOption = {
  id: string;
  label: string;
  meta?: string | null;
  searchText?: string | null;
  disabled?: boolean;
};

type Matrix2InlinePickerFooterAction = {
  label: string;
  href?: string;
  onClick?: () => void;
};

type Matrix2InlineModulePickerProps = {
  ariaLabel: string;
  placeholder: string;
  selectedIds: readonly string[];
  options: readonly Matrix2InlinePickerOption[];
  selectedLabel?: string;
  availableLabel?: string;
  emptyLabel: string;
  isLoading?: boolean;
  error?: string | null;
  notice?: ReactNode;
  footerActions: readonly Matrix2InlinePickerFooterAction[];
  onToggle: (optionId: string, selected: boolean) => void;
};

function pickerTestId(ariaLabel: string): string {
  return `${ariaLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-quick-picker`;
}

export function Matrix2InlineModulePicker({
  ariaLabel,
  placeholder,
  selectedIds,
  options,
  selectedLabel = "Selected",
  availableLabel = "Available",
  emptyLabel,
  isLoading = false,
  error = null,
  notice = null,
  footerActions,
  onToggle,
}: Matrix2InlineModulePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [popoverStyle, setPopoverStyle] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedOptions = useMemo(() => options.filter((option) => selectedSet.has(option.id)), [options, selectedSet]);
  const availableOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return options
      .filter((option) => !selectedSet.has(option.id))
      .filter((option) => !query || `${option.label} ${option.meta ?? ""} ${option.searchText ?? ""}`.toLowerCase().includes(query))
      .slice(0, 6);
  }, [options, search, selectedSet]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(380, Math.max(320, rect.width));
    const availableBelow = window.innerHeight - rect.bottom - 12;
    const availableAbove = rect.top - 12;
    const openAbove = availableBelow < 300 && availableAbove > availableBelow;
    const maxHeight = Math.max(260, Math.min(440, openAbove ? availableAbove : availableBelow));
    setPopoverStyle({
      top: openAbove ? Math.max(8, rect.top - maxHeight - 8) : rect.bottom + 6,
      left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8)),
      width,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setIsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  const summary = selectedOptions.length === 0
    ? placeholder
    : selectedOptions.length <= 2
      ? selectedOptions.map((option) => option.label).join(", ")
      : `${selectedOptions.length} selected`;

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((current) => !current);
        }}
        className="flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 text-left text-[12px] text-slate-800 outline-none hover:border-slate-300 focus:border-[#28439A]"
      >
        <span className={selectedOptions.length > 0 ? "truncate" : "truncate text-slate-400"}>{summary}</span>
        <span aria-hidden className="shrink-0 text-slate-400">⌄</span>
      </button>
      {isOpen && popoverStyle && typeof document !== "undefined" ? createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={ariaLabel}
          data-testid={pickerTestId(ariaLabel)}
          className="fixed z-[90] flex overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-2xl ring-1 ring-slate-900/5"
          style={{ ...popoverStyle, flexDirection: "column" }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="border-b border-slate-100 p-2.5">
            <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 focus-within:border-[#28439A]/50 focus-within:bg-white">
              <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${placeholder.toLowerCase()}`}
                aria-label={`Search ${ariaLabel}`}
                className="min-w-0 flex-1 bg-transparent text-[12px] text-slate-800 outline-none placeholder:text-slate-400"
                autoFocus
              />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
            {notice}
            {error ? <p className="mb-2 rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">{error}</p> : null}
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{selectedLabel}</p>
            <div className="space-y-1">
              {selectedOptions.length > 0 ? selectedOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onToggle(option.id, false)}
                  className="flex min-h-9 w-full items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-left hover:bg-slate-100"
                  aria-label={`Remove ${option.label}`}
                >
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-slate-800">{option.label}</span>
                    {option.meta ? <span className="block truncate text-[10px] text-slate-500">{option.meta}</span> : null}
                  </span>
                  <X className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                </button>
              )) : <p className="rounded-lg border border-dashed border-slate-200 px-2.5 py-2 text-[11px] text-slate-500">Nothing selected</p>}
            </div>
            <p className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{availableLabel}</p>
            <div className="space-y-1">
              {isLoading ? <p className="px-2.5 py-3 text-[11px] text-slate-500">Loading options…</p> : null}
              {!isLoading && availableOptions.length > 0 ? availableOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => onToggle(option.id, true)}
                  className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Add ${option.label}`}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0 text-[#28439A]" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-slate-800">{option.label}</span>
                    {option.meta ? <span className="block truncate text-[10px] text-slate-500">{option.meta}</span> : null}
                  </span>
                </button>
              )) : null}
              {!isLoading && availableOptions.length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-2.5 py-3 text-[11px] text-slate-500">{emptyLabel}</p> : null}
            </div>
          </div>
          <div className="sticky bottom-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 bg-white px-3 py-2">
            {footerActions.map((action) => action.href ? (
              <a key={action.label} href={action.href} onClick={(event) => event.stopPropagation()} className="text-[11px] font-semibold text-[#28439A] hover:text-[#1f3478]">{action.label}</a>
            ) : (
              <button key={action.label} type="button" onClick={(event) => { event.stopPropagation(); action.onClick?.(); }} className="text-[11px] font-semibold text-[#28439A] hover:text-[#1f3478]">{action.label}</button>
            ))}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
