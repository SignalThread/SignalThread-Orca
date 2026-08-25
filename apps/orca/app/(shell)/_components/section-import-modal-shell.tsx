"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type SectionImportModalShellProps = {
  title: string;
  description: string;
  detail?: string;
  compact?: boolean;
  footer: ReactNode;
  children: ReactNode;
};

export function SectionImportModalShell({
  title,
  description,
  detail,
  compact = false,
  footer,
  children,
}: SectionImportModalShellProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-[2px] sm:p-6">
      <div
        className={[
          "flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-xl sm:max-h-[calc(100dvh-3rem)]",
          compact ? "max-w-2xl" : "max-w-6xl",
        ].join(" ")}
      >
        <div className="shrink-0 border-b border-slate-200 px-6 py-4">
          <h3 className="text-[18px] font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-[13px] text-slate-600">{description}</p>
          {detail ? <p className="mt-1 text-[12px] text-slate-500">{detail}</p> : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          {children}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  );
}
