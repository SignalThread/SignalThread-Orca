"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type EnrichLeadFormState = {
  message: string | null;
  tone: "error" | "success" | "info" | null;
};

const initialState: EnrichLeadFormState = {
  message: null,
  tone: null
};

function SubmitButton({
  isPending,
  submitLabel,
  pendingLabel,
  onClick,
  compact,
  primary
}: {
  isPending: boolean;
  submitLabel: string;
  pendingLabel: string;
  onClick: () => void;
  compact?: boolean;
  /** Emphasized toolbar style (lead detail top bar). */
  primary?: boolean;
}) {
  const className = compact
    ? primary
      ? "inline-flex h-9 w-full shrink-0 items-center justify-center rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      : "inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    : "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <button type="button" disabled={isPending} onClick={onClick} className={className}>
      {isPending ? pendingLabel : submitLabel}
    </button>
  );
}

export function EnrichLeadForm({
  leadId,
  action,
  submitLabel = "Enrich Lead",
  pendingLabel = "Enriching...",
  compact = false,
  primary = false,
  /** Single-row header: keeps status beside the button so the bar height stays stable. */
  rowLayout = false
}: {
  leadId: string;
  action: (prevState: EnrichLeadFormState, formData: FormData) => Promise<EnrichLeadFormState>;
  submitLabel?: string;
  pendingLabel?: string;
  /** Secondary toolbar styling for lead Profile header. */
  compact?: boolean;
  /** Primary (filled) button when compact. */
  primary?: boolean;
  rowLayout?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<EnrichLeadFormState>(initialState);
  const [isPending, startTransition] = useTransition();

  const handleEnrich = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("leadId", leadId);
      const newState = await action(state, formData);
      setState(newState);
      router.refresh();
    });
  };

  const row = compact && rowLayout;
  return (
    <div
      className={
        row
          ? "flex max-w-[min(100%,28rem)] flex-row flex-nowrap items-center gap-1.5 sm:gap-2"
          : `flex flex-col gap-1.5 ${compact ? "items-stretch sm:items-end" : "items-end gap-2"}`
      }
    >
      <SubmitButton
        isPending={isPending}
        submitLabel={submitLabel}
        pendingLabel={pendingLabel}
        onClick={handleEnrich}
        compact={compact}
        primary={primary}
      />
      {state.message ? (
        <p
          className={`min-w-0 text-left text-xs leading-tight ${
            row ? "max-w-[140px] truncate sm:max-w-[180px]" : "max-w-xs sm:text-right"
          } ${
            state.tone === "error"
              ? "text-rose-600"
              : state.tone === "success"
                ? "text-emerald-700"
                : "text-slate-600"
          }`}
          title={row ? state.message ?? undefined : undefined}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
