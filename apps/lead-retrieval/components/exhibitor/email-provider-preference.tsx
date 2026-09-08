import type { EmailProvider } from "@/lib/integrations/email/types";

/** A compact card-level control; persistence remains owned by the integrations catalog. */
export function DefaultSenderControl({
  provider,
  selected,
  pending,
  onSelect,
  error
}: {
  provider: EmailProvider;
  selected: boolean;
  pending: boolean;
  onSelect: (provider: EmailProvider) => void;
  error?: string | null;
}) {
  return (
    <div className="space-y-2" data-testid={`default-sender-${provider}`}>
      <button
        type="button"
        disabled={pending}
        aria-pressed={selected}
        onClick={() => onSelect(provider)}
        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 ${
          selected
            ? "border-violet-400 bg-violet-50 text-violet-800"
            : "border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50/40"
        }`}
      >
        <span
          aria-hidden="true"
          className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] leading-none ${
            selected ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 bg-white text-transparent"
          }`}
        >
          ✓
        </span>
        {pending ? "Saving…" : "Default sender"}
      </button>
      {error ? <p className="text-sm font-medium text-rose-700" role="status">{error}</p> : null}
    </div>
  );
}
