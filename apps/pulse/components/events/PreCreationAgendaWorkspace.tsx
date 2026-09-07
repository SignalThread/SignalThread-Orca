'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EVENT_AGENDA_IMPORT_FIELDS, type AgendaImportMappingField } from '@/lib/event-agenda-import-template'
import { countPreCreationAgendaRows, type PreCreationAgendaDraft, type ReviewedInitialAgenda } from '@/lib/pre-creation-agenda-types'

const CORE_FIELDS: AgendaImportMappingField[] = ['startDate', 'startTime', 'title', 'speakerNames']
const FIELD_LABELS: Partial<Record<AgendaImportMappingField, string>> = {
  startDate: 'Date', startTime: 'Start + end time', title: 'Session title', speakerNames: 'Speakers',
}

function sourceExample(draft: PreCreationAgendaDraft, column: string | null | undefined) {
  if (!column) return 'Not mapped'
  const worksheet = draft.inspection.worksheets.find((item) => item.name === draft.worksheetName)
  return worksheet?.rows.find((row) => row.values[column]?.trim())?.values[column] || column
}

export function PreCreationAgendaWorkspace({
  draft,
  stage,
  busy,
  error,
  onDraftChange,
  onBackToSetup,
  onReviewAgenda,
  onChangeMapping,
  onDiscard,
  onCreate,
}: {
  draft: PreCreationAgendaDraft
  stage: 'mapping' | 'review'
  busy: boolean
  error: string | null
  onDraftChange: (draft: PreCreationAgendaDraft) => void
  onBackToSetup: () => void
  onReviewAgenda: () => void
  onChangeMapping: () => void
  onDiscard: () => void
  onCreate: (agenda: ReviewedInitialAgenda) => void
}) {
  const [advanced, setAdvanced] = useState(false)
  const [filter, setFilter] = useState<'ALL' | 'READY' | 'NEEDS_REVIEW' | 'INVALID'>('ALL')
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set())
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set())
  const counts = countPreCreationAgendaRows(draft.rows)
  const worksheet = draft.inspection.worksheets.find((item) => item.name === draft.worksheetName)

  const updateMapping = (field: AgendaImportMappingField, value: string) => {
    onDraftChange({
      ...draft,
      mapping: {
        ...draft.mapping,
        [field]: value || null,
        ...(field === 'startTime' ? { endTime: value || null } : {}),
      },
    })
  }

  if (stage === 'mapping') {
    const visibleFields = advanced ? EVENT_AGENDA_IMPORT_FIELDS.map((field) => field.key) : CORE_FIELDS
    return <div className="mx-auto max-w-5xl pb-8">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-2xl font-bold text-slate-950">Adjust interpretation</h1><p className="mt-1 text-sm text-slate-600">Pulse interpreted {worksheet?.columns.length ?? 0} source columns. Nothing has been created yet.</p></div>
          <div className="flex gap-2"><Button type="button" variant="secondary" onClick={onBackToSetup}>Back to setup</Button><Button type="button" variant="ghost" onClick={onDiscard}>Discard import</Button></div>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          {visibleFields.map((field) => {
            const mappedColumn = draft.mapping[field]
            const label = FIELD_LABELS[field] ?? EVENT_AGENDA_IMPORT_FIELDS.find((item) => item.key === field)?.label ?? field
            return <div key={field} className="grid gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto_220px] md:items-center">
              <div><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{mappedColumn || label}</p><p className="mt-0.5 truncate text-sm text-slate-700">{sourceExample(draft, mappedColumn)}</p></div>
              <span aria-hidden className="hidden text-xl text-slate-400 md:block">→</span>
              <div><p className="mb-1 text-sm font-semibold text-slate-900">{label}</p><select aria-label={`Map ${label}`} value={mappedColumn ?? ''} onChange={(event) => updateMapping(field, event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Not mapped</option>{worksheet?.columns.map((column) => <option key={column} value={column}>{column}</option>)}</select></div>
            </div>
          })}
        </div>
        <button type="button" className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-semibold text-slate-800" onClick={() => setAdvanced((value) => !value)}>{advanced ? '▾' : '▸'} Advanced options</button>
        <div className="mt-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Source preview</p><div className="mt-2 overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{worksheet?.columns.map((column) => <th key={column} className="px-3 py-2">{column}</th>)}</tr></thead><tbody>{worksheet?.rows.slice(0, 5).map((row) => <tr key={row.sourceRowNumber} className="border-t border-slate-100">{worksheet.columns.map((column) => <td key={column} className="max-w-[320px] truncate px-3 py-2.5 text-slate-700">{row.values[column]}</td>)}</tr>)}</tbody></table></div></div>
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex justify-end"><Button type="button" disabled={busy || !draft.mapping.title} onClick={onReviewAgenda}>{busy ? 'Interpreting…' : 'Review agenda'}</Button></div>
      </div>
    </div>
  }

  const visibleRows = draft.rows.filter((row) => filter === 'ALL' || row.status === filter)
  const blocking = draft.rows.filter((row) => {
    if (skipped.has(row.id)) return false
    if (row.status === 'READY') return false
    if (row.status === 'NEEDS_REVIEW' && accepted.has(row.id)) return false
    return true
  })
  const reviewedRows = draft.rows.flatMap((row) => {
    if (skipped.has(row.id) || !row.normalized) return []
    return [{ sourceRowNumber: row.sourceRowNumber, normalized: row.normalized }]
  })

  return <div className="mx-auto max-w-5xl pb-8">
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-950">Review agenda</h1><p className="mt-1 text-sm text-slate-600">{draft.sourceFileName} · {counts.sessions} sessions · {counts.speakers} speakers</p></div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={onChangeMapping}>Change mapping</Button><Button type="button" variant="ghost" onClick={onDiscard}>Discard</Button></div></div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[
        ['Ready', counts.ready, 'text-emerald-700'], ['Needs review', counts.needsReview, 'text-amber-700'], ['Invalid', counts.invalid, 'text-red-700'], ['Speakers', counts.speakers, 'text-slate-900'],
      ].map(([label, value, tone]) => <div key={String(label)} className="rounded-lg border border-slate-200 p-3"><p className={`text-xl font-bold ${tone}`}>{value}</p><p className="text-xs font-semibold text-slate-500">{label}</p></div>)}</div>
      <div className="mt-4 flex flex-wrap gap-2">{(['ALL', 'READY', 'NEEDS_REVIEW', 'INVALID'] as const).map((value) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{value === 'ALL' ? 'All sessions' : value === 'NEEDS_REVIEW' ? 'Needs review' : value === 'READY' ? 'Ready' : 'Invalid'}</button>)}</div>
      <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">{visibleRows.map((row) => <div key={row.id} className={`p-3 ${skipped.has(row.id) ? 'opacity-55' : ''}`}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-slate-900">{row.normalized?.title || row.sourceValues[draft.mapping.title] || `Source row ${row.sourceRowNumber}`}</p><p className="mt-1 text-xs text-slate-500">Row {row.sourceRowNumber}{row.normalized?.startsAt ? ` · ${new Date(row.normalized.startsAt).toLocaleString()}` : ''}{row.normalized?.speakers.length ? ` · ${row.normalized.speakers.map((speaker) => speaker.name).join(', ')}` : ''}</p>{row.issues.map((issue, index) => <p key={`${issue.code}-${index}`} className={`mt-1 text-xs ${issue.severity === 'ERROR' ? 'text-red-700' : 'text-amber-700'}`}>{issue.message}</p>)}</div><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${row.status === 'READY' ? 'bg-emerald-50 text-emerald-700' : row.status === 'NEEDS_REVIEW' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{skipped.has(row.id) ? 'SKIPPED' : row.status.replace('_', ' ')}</span>{row.status === 'NEEDS_REVIEW' && !skipped.has(row.id) && <Button type="button" size="sm" variant="secondary" onClick={() => setAccepted((current) => new Set(current).add(row.id))}>{accepted.has(row.id) ? 'Accepted' : 'Accept'}</Button>}<Button type="button" size="sm" variant="ghost" onClick={() => setSkipped((current) => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next })}>{skipped.has(row.id) ? 'Restore' : 'Skip'}</Button></div></div></div>)}</div>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4"><div>{blocking.length > 0 && <p className="text-sm text-amber-700">Resolve or skip {blocking.length} blocking item{blocking.length === 1 ? '' : 's'} before creating the event.</p>}</div><Button type="button" disabled={busy || blocking.length > 0 || reviewedRows.length === 0} onClick={() => onCreate({ sourceFileName: draft.sourceFileName, rows: reviewedRows })}>{busy ? 'Creating Event…' : 'Create Event'}</Button></div>
    </div>
  </div>
}
