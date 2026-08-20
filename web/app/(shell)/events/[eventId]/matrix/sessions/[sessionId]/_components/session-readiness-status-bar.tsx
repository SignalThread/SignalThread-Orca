"use client";

import { AlertCircle, ArrowRight, CheckCircle2, CircleDashed, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type ReadinessBucket = "ready" | "needsWork" | "blocked";

/**
 * One enumerated contributor to a readiness count. Every field is derived from a canonical
 * module readiness record — nothing here is a label invented for display.
 */
export type ReadinessDetailItem = {
  id: string;
  /** Operational area / module, e.g. "F&B". */
  area: string;
  /** The specific record this applies to, e.g. the session or function name. */
  subject: string;
  bucket: ReadinessBucket;
  statusLabel: string;
  /** Why the item landed in this bucket. */
  reason: string;
  /** The missing field, failed check, or blocking dependency. */
  blocker: string | null;
  owner: string | null;
  actionLabel: string;
  /** Invoked to navigate to the exact record/field that resolves the item. */
  onAction: () => void;
};

type Props = {
  items: ReadinessDetailItem[];
  /** True while the session snapshot is still loading, so counts are not yet enumerable. */
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
};

const BUCKET_ORDER: ReadinessBucket[] = ["ready", "needsWork", "blocked"];

const BUCKET_LABEL: Record<ReadinessBucket, string> = {
  ready: "Ready",
  needsWork: "Needs work",
  blocked: "Blocked",
};

const BUCKET_MEANING: Record<ReadinessBucket, string> = {
  ready: "Required information and dependencies are complete.",
  needsWork: "Actionable and incomplete, but not blocked.",
  blocked: "Cannot proceed until a prerequisite is resolved.",
};

const BUCKET_CHIP: Record<ReadinessBucket, string> = {
  ready:
    "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 focus-visible:ring-emerald-500",
  needsWork:
    "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 focus-visible:ring-amber-500",
  blocked:
    "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100 focus-visible:ring-rose-500",
};

const BUCKET_ICON: Record<ReadinessBucket, typeof CheckCircle2> = {
  ready: CheckCircle2,
  needsWork: CircleDashed,
  blocked: AlertCircle,
};

/**
 * Session readiness as three interactive status controls rather than static text.
 *
 * Every count is enumerable: the panel lists the exact canonical items behind it, each with its
 * area, subject, status, cause, blocker, owner, and a direct action to the record that resolves
 * it. A bucket with no items is rendered disabled rather than as a dead control.
 */
export function SessionReadinessStatusBar({ items, isLoading, error, onRetry }: Props) {
  const [openBucket, setOpenBucket] = useState<ReadinessBucket | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const byBucket = useMemo(() => {
    const grouped: Record<ReadinessBucket, ReadinessDetailItem[]> = {
      ready: [],
      needsWork: [],
      blocked: [],
    };
    for (const item of items) grouped[item.bucket].push(item);
    return grouped;
  }, [items]);

  // If the open bucket empties out from under us (for example after a fix lands), treat it as
  // closed during render rather than scheduling a state update from an effect.
  const activeBucket = openBucket && byBucket[openBucket].length > 0 ? openBucket : null;

  useEffect(() => {
    if (!activeBucket) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpenBucket(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenBucket(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [activeBucket]);

  if (isLoading) {
    return (
      <div
        className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-500"
        aria-live="polite"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Checking session readiness…
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="inline-flex min-h-9 flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-800"
      >
        <AlertCircle className="h-3.5 w-3.5" aria-hidden />
        Readiness could not be calculated.
        <button type="button" onClick={onRetry} className="underline focus:outline-none focus:ring-2 focus:ring-rose-500">
          Retry
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="inline-flex min-h-9 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-500">
        No readiness checks apply to this session yet.
      </div>
    );
  }

  const openItems = activeBucket ? byBucket[activeBucket] : [];

  return (
    <div ref={rootRef} className="relative w-full sm:w-auto">
      {/* Full width and wrapping on phones, compact and inline from tablet up, matching the
          rest of the session header action cluster. */}
      <div
        className="flex min-h-9 w-full flex-wrap items-center gap-1.5 sm:h-9 sm:w-auto sm:flex-nowrap"
        role="group"
        aria-label="Session readiness"
      >
        {BUCKET_ORDER.map((bucket) => {
          const bucketItems = byBucket[bucket];
          const count = bucketItems.length;
          const isOpen = activeBucket === bucket;
          const Icon = BUCKET_ICON[bucket];
          // A bucket with nothing in it must not look clickable.
          const disabled = count === 0;

          return (
            <button
              key={bucket}
              type="button"
              data-readiness-status={bucket}
              disabled={disabled}
              aria-expanded={disabled ? undefined : isOpen}
              aria-controls={disabled ? undefined : "session-readiness-detail-panel"}
              aria-label={
                disabled
                  ? `${BUCKET_LABEL[bucket]}: no items`
                  : `${BUCKET_LABEL[bucket]}: ${count} item${count === 1 ? "" : "s"}. ${isOpen ? "Hide" : "Show"} details.`
              }
              title={disabled ? `No items are ${BUCKET_LABEL[bucket].toLowerCase()}` : BUCKET_MEANING[bucket]}
              onClick={() => setOpenBucket((current) => (current === bucket ? null : bucket))}
              className={[
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                disabled
                  ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                  : `cursor-pointer ${BUCKET_CHIP[bucket]}`,
                isOpen ? "ring-2 ring-slate-900/20" : "",
              ].join(" ")}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {BUCKET_LABEL[bucket]}
              <span className="rounded-full bg-white/80 px-1.5 py-0.5 tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      {activeBucket ? (
        <div
          id="session-readiness-detail-panel"
          role="dialog"
          aria-label={`${BUCKET_LABEL[activeBucket]} — ${openItems.length} item${openItems.length === 1 ? "" : "s"}`}
          className="absolute right-0 z-30 mt-2 w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-slate-950">
              {BUCKET_LABEL[activeBucket]} — {openItems.length} item{openItems.length === 1 ? "" : "s"}
            </h3>
            <button
              type="button"
              onClick={() => setOpenBucket(null)}
              className="text-[11px] font-semibold text-slate-500 underline focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Close
            </button>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">{BUCKET_MEANING[activeBucket]}</p>

          <ul className="mt-2 max-h-[22rem] space-y-2 overflow-y-auto">
            {openItems.map((item) => (
              <li key={item.id} className="rounded-lg border border-slate-200 p-2.5 text-[12px]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    {item.area}
                    <span className="font-normal text-slate-600"> · {item.subject}</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                    {item.statusLabel}
                  </span>
                </div>
                <p className="mt-1 text-slate-700">{item.reason}</p>
                {item.blocker ? (
                  <p className="mt-0.5 text-slate-600">
                    <span className="font-semibold">Blocking:</span> {item.blocker}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">
                    Owner: {item.owner ?? "Unassigned"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenBucket(null);
                      item.onAction();
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {item.actionLabel}
                    <ArrowRight className="h-3 w-3" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
