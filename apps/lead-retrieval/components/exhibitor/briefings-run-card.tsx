"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { EllipsisVertical } from "lucide-react";
import { briefingsBatchListPrimaryCta } from "@/lib/exhibitor/briefings-ui-copy";

type StatusBadgeProps = { status: string; label: string };

function StatusBadge({ status, label }: StatusBadgeProps) {
  if (status === "draft") {
    return (
      <span className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200/90">
        {label}
      </span>
    );
  }
  if (status === "published") {
    return (
      <span className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900 ring-1 ring-emerald-200/90">
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 ring-1 ring-slate-200/90">
      {label}
    </span>
  );
}

export function BriefingsRunCard({
  batchId,
  batchStatus,
  statusBadgeLabel,
  title,
  sourceLine,
  lastUpdated,
  reviewLine,
  leadLine,
  showNoBriefsHint,
  briefingTotal,
  briefingApproved,
}: {
  batchId: string;
  batchStatus: string;
  statusBadgeLabel: string;
  title: string;
  sourceLine: string | null;
  lastUpdated: string;
  reviewLine: string | null;
  leadLine: string | null;
  showNoBriefsHint: boolean;
  briefingTotal: number;
  briefingApproved: number;
}) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingId = useId();

  const cta = briefingsBatchListPrimaryCta({
    batchId,
    batchStatus,
    briefingTotal,
    briefingApproved,
  });

  const isPublished = batchStatus === "published";

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen, closeMenu]);

  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  async function confirmDiscard() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/exhibitor/briefings/batches/${encodeURIComponent(batchId)}/discard`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Could not remove this run.");
      }
      setConfirmOpen(false);
      closeMenu();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <article
        className="relative flex flex-col rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm"
        data-testid="briefings-batch-card"
        aria-labelledby={headingId}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id={headingId} className="min-w-0 flex-1 text-[14px] font-semibold leading-snug text-slate-900">
            {title}
          </h2>
          <div className="flex shrink-0 items-start gap-1">
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                aria-label="Run actions — includes delete"
                title="More actions"
                aria-expanded={menuOpen}
                aria-haspopup="true"
                data-testid="briefings-batch-actions-trigger"
                onClick={() => setMenuOpen((o) => !o)}
              >
                <EllipsisVertical className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
              {menuOpen ? (
                <div
                  className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                  role="menu"
                  data-testid="briefings-batch-actions-menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full px-3 py-2 text-left text-xs font-semibold text-rose-700 hover:bg-rose-50"
                    data-testid="briefings-batch-delete-run"
                    onClick={() => {
                      closeMenu();
                      setError(null);
                      setConfirmOpen(true);
                    }}
                  >
                    Delete run…
                  </button>
                </div>
              ) : null}
            </div>
            <StatusBadge status={batchStatus} label={statusBadgeLabel} />
          </div>
        </div>
        {leadLine ? <p className="mt-2 text-[12px] font-medium tabular-nums text-slate-800">{leadLine}</p> : null}
        {reviewLine ? (
          <p className="mt-1 text-[11px] tabular-nums text-slate-600">{reviewLine}</p>
        ) : showNoBriefsHint ? (
          <p className="mt-1 text-[11px] text-slate-500">No generated briefs yet — use Start briefs to continue.</p>
        ) : null}
        <p className="mt-1.5 text-[11px] text-slate-500">Updated {lastUpdated}</p>
        {sourceLine ? <p className="mt-1 text-[11px] text-slate-500">{sourceLine}</p> : null}

        <div className="mt-3">
          <Link
            href={cta.href}
            className="inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-center text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
            data-testid="briefings-batch-primary-cta"
          >
            {cta.label}
          </Link>
        </div>
      </article>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 px-4 py-6 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="briefings-discard-title"
          data-testid="briefings-discard-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setConfirmOpen(false);
              setError(null);
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 id="briefings-discard-title" className="text-base font-semibold text-slate-900">
              Delete this brief run?
            </h3>
            {isPublished ? (
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <p className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 font-medium text-amber-950">
                  This run is live: leads were published from this import. Deleting the run only removes it from AI Briefings
                  and related import history here — it does <span className="font-semibold">not</span> delete leads from your
                  roster or remove briefs already shown on lead profiles.
                </p>
                <p>
                  Your team will lose access to this import batch, its mapping, draft rows, and batch-scoped briefing notes
                  in this product. This cannot be undone.
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-700">
                This removes the import run from AI Briefings and the Import Wizard: draft rows, generated briefs for this
                batch, field mapping, and batch notes tied to this run will no longer be available. Leads that were already
                published from this run (if any) are not deleted. This cannot be undone.
              </p>
            )}
            {error ? (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                data-testid="briefings-discard-cancel"
                disabled={busy}
                onClick={() => {
                  setConfirmOpen(false);
                  setError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                data-testid="briefings-discard-confirm"
                disabled={busy}
                onClick={() => void confirmDiscard()}
              >
                {busy ? "Removing…" : "Delete run"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
