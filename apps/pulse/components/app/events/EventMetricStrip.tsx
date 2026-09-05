import type { ReactNode } from 'react'

/**
 * Event-only metric strip. Renders the small row of headline counts shared by
 * Events Home, Event Workspace, and the Command Center (Surveys, Responses,
 * Answers Captured, Feedback Points, etc.).
 *
 * Truthful-data rule: a `null`/`undefined` value renders a neutral em dash, not
 * a fabricated zero-with-confidence. Pass `0` explicitly for a real zero.
 *
 * EVENTS-only primitive. Does not affect retail/SMB surfaces.
 */
export interface EventMetric {
  label: string
  value: number | string | null | undefined
  /** Small helper line under the value. */
  hint?: ReactNode
  /** Optional emphasis tone for the value (e.g. attention counts). */
  tone?: 'default' | 'positive' | 'attention' | 'critical'
}

const TONE_CLASSES: Record<NonNullable<EventMetric['tone']>, string> = {
  default: 'text-zinc-900 dark:text-zinc-50',
  positive: 'text-green-600 dark:text-green-400',
  attention: 'text-amber-600 dark:text-amber-400',
  critical: 'text-red-600 dark:text-red-400',
}

function formatValue(value: EventMetric['value']): ReactNode {
  if (value === null || value === undefined) return <span className="text-zinc-400 dark:text-zinc-600">—</span>
  if (typeof value === 'number') return value.toLocaleString()
  return value
}

// Static map so Tailwind's scanner sees every column count (no dynamic class names).
const LG_COLS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
}

interface EventMetricStripProps {
  metrics: EventMetric[]
  className?: string
}

export function EventMetricStrip({ metrics, className = '' }: EventMetricStripProps) {
  if (metrics.length === 0) return null
  const lgCols = LG_COLS[Math.min(Math.max(metrics.length, 1), 6)] ?? 'lg:grid-cols-4'
  return (
    <dl
      className={`grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-zinc-800 dark:bg-zinc-800 sm:grid-cols-3 ${lgCols} ${className}`}
    >
      {metrics.map((metric, index) => (
        <div key={`${metric.label}-${index}`} className="bg-white px-3 py-2.5 dark:bg-zinc-900">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500">
            {metric.label}
          </dt>
          <dd className={`mt-0.5 text-xl font-bold tabular-nums ${TONE_CLASSES[metric.tone ?? 'default']}`}>
            {formatValue(metric.value)}
          </dd>
          {metric.hint && (
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-zinc-400">{metric.hint}</p>
          )}
        </div>
      ))}
    </dl>
  )
}
