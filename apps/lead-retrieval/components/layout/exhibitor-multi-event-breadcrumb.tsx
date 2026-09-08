import Link from "next/link";

/** Subtle back link to the events index; only rendered when `show` (multi-event users). */
export function ExhibitorMultiEventBreadcrumb({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="mb-1">
      <Link
        href="/app/events"
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-800"
      >
        <span aria-hidden className="select-none">
          ←
        </span>
        Events
      </Link>
    </div>
  );
}
