'use client'

import type { EventThemeEvidenceResult } from '@/lib/event-intelligence/theme-evidence'

function humanize(value: string | null | undefined) {
  if (!value) return 'No data'
  return value.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not updated'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not updated'
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function displayableSentimentLabel(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase()
  // Sentiment remains on the evidence row for analysis and grouping, but only
  // explicit evaluative language earns a visible label. A neutral score is not
  // useful context for a question, request, or other planning input.
  return normalized === 'POSITIVE' || normalized === 'NEGATIVE' || normalized === 'MIXED'
    ? humanize(normalized)
    : null
}

/** Shared inline evidence renderer for Signals findings and agenda-backed session intelligence. */
export function EventThemeEvidencePanel({
  loading,
  error,
  detail,
  fallbackTheme,
  heading = 'Theme Evidence',
  onClear,
}: {
  loading: boolean
  error: string | null
  detail: EventThemeEvidenceResult | null
  fallbackTheme: { label: string; count: number; sentimentLabel: string | null } | null
  heading?: string
  onClear: () => void
}) {
  const themeLabel = fallbackTheme?.label ?? detail?.themeLabel ?? 'Theme evidence'
  const mentionCount = detail?.mentionCount ?? fallbackTheme?.count ?? 0

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3 dark:border-zinc-800">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{heading}</p>
          <h4 className="mt-1 text-sm font-black text-slate-950 dark:text-zinc-50">{themeLabel}</h4>
          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">{mentionCount} mention{mentionCount === 1 ? '' : 's'}</p>
        </div>
        <button type="button" onClick={onClear} className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900">Hide</button>
      </div>

      <div className="mt-3">
        {loading ? (
          <div className="space-y-3"><div className="h-5 w-44 animate-pulse rounded bg-slate-100 dark:bg-zinc-800" /><div className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-zinc-800" /><div className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-zinc-800" /></div>
        ) : error ? (
          <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-700">{error}</div>
        ) : detail?.evidence.length ? (
          <div className="space-y-3">
            {detail.evidence.map((row) => {
              const sentimentLabel = displayableSentimentLabel(row.sentimentLabel)
              return (
              <article data-testid="event-theme-evidence-record" key={`${row.answerId}-${row.createdAt}`} className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">{formatDateTime(row.createdAt)}</span>
                  {sentimentLabel && <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400">{sentimentLabel}</span>}
                </div>
                <p className="mt-3 whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 text-sm leading-6 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-200">&ldquo;{row.transcriptSnippet || row.transcriptText || 'Transcript unavailable.'}&rdquo;</p>
                <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                  <div className="min-w-0"><p className="font-bold uppercase tracking-wide text-zinc-400">Question</p><p className="mt-1 break-words leading-5 text-zinc-700 dark:text-zinc-300">{row.question.label ?? row.question.promptLabel ?? row.question.key ?? 'Question metadata unavailable'}</p></div>
                  <div className="min-w-0"><p className="font-bold uppercase tracking-wide text-zinc-400">Source</p><p className="mt-1 break-words leading-5 text-zinc-700 dark:text-zinc-300">{[row.target.name, row.target.category].filter(Boolean).join(' / ') || row.response.status || 'Event-level feedback'}</p>{(row.target.session || row.target.speaker) && <p className="mt-1 break-words text-[11px] leading-4 text-zinc-500">{[row.target.session?.name, row.target.speaker ? `${row.target.speaker.name} · ${row.target.speaker.role.toLocaleLowerCase()}` : null].filter(Boolean).join(' / ')}</p>}</div>
                </div>
              </article>
              )
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/70 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">No source answers are linked to this theme yet.</div>
        )}
      </div>
    </div>
  )
}
