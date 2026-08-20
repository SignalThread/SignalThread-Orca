"use client";

import type { ReactNode } from "react";
import type { EventImportMethod } from "@/lib/event-import-types";

type EventImportMethodCardProps = {
  method: EventImportMethod;
  title: string;
  description: string;
  icon: ReactNode;
  badge?: string;
  selected: boolean;
  onSelect: (method: EventImportMethod) => void;
};

export function EventImportMethodCard({
  method,
  title,
  description,
  icon,
  badge,
  selected,
  onSelect,
}: EventImportMethodCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(method)}
      className={`flex w-full flex-col gap-2 rounded-xl border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#28439A] ${
        selected
          ? "border-[#28439A] bg-[#28439A]/[0.04] shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            selected ? "bg-[#28439A] text-white" : "bg-slate-100 text-slate-600"
          }`}
        >
          {icon}
        </span>
        {badge ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            {badge}
          </span>
        ) : null}
      </div>
      <span className="text-[14px] font-semibold text-slate-900">{title}</span>
      <span className="text-[12px] leading-snug text-slate-500">{description}</span>
    </button>
  );
}
