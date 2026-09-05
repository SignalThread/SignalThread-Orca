'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EventCard, EventEmptyState, EventStatusPill } from '@/components/app/events'
import { EventConfirmDialog } from '@/components/events/EventConfirmDialog'
import { EventWorkspaceDrawer } from '@/components/events/EventEvidenceDrawer'
import {
  buildAgendaImportTemplateCsv,
  EVENT_AGENDA_IMPORT_FIELDS,
  EVENT_AGENDA_IMPORT_TEMPLATE_FILENAME,
  type AgendaImportMappingField,
} from '@/lib/event-agenda-import-template'
import { buildSpeakerRosterImportTemplateCsv, EVENT_SPEAKER_ROSTER_IMPORT_FIELDS, EVENT_SPEAKER_ROSTER_TEMPLATE_FILENAME, type SpeakerRosterImportMappingField } from '@/lib/event-speaker-roster-import-template'

type ImportStatus = 'UPLOADED' | 'MAPPING' | 'NEEDS_REVIEW' | 'READY' | 'CONFIRMING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
type RowStatus = 'PENDING' | 'READY' | 'NEEDS_REVIEW' | 'DUPLICATE' | 'INVALID' | 'IGNORED' | 'CONFIRMED' | 'FAILED'
type RowResolution = 'SKIP' | 'REPLACE_EXISTING' | 'KEEP_BOTH' | 'REVIEW'
type SpeakerDecision = 'LINK_EXISTING' | 'CREATE_NEW' | 'KEEP_SEPARATE' | 'MERGE' | 'IGNORE'

interface ImportSpeakerResolution {
  sourceName: string
  sourceEmail?: string | null
  decision?: SpeakerDecision | null
  matchedSpeakerId?: string | null
  candidateSpeakerIds: string[]
}

interface ImportValidationIssue {
  code: string
  field?: string | null
  message: string
  severity: 'ERROR' | 'WARNING'
}

interface ImportRow {
  id: string
  updatedAt?: string
  sourceRowNumber: number
  rawRowSnapshot: Record<string, string>
  normalizedRowSnapshot: {
    title?: string
    displayName?: string
    sessionTitle?: string | null
    startsAt: string | null
    endsAt: string | null
    timezone: string | null
    room?: string | null
    track?: string | null
    format?: string | null
    description?: string | null
    externalId?: string | null
    capacity?: number | null
    tags?: string[]
    speakers?: Array<{ name: string; email?: string | null; organization?: string | null; title?: string | null }>
  } | null
  validationIssues: ImportValidationIssue[] | null
  status: RowStatus
  conflictType: string | null
  resolution: RowResolution | null
  speakerResolutionSnapshot: ImportSpeakerResolution[] | null
  existingSessionId: string | null
  result: 'CREATED' | 'UPDATED' | 'SKIPPED' | 'FAILED' | null
  resultMessage: string | null
}

interface ImportJob {
  id: string
  importType: 'AGENDA' | 'SPEAKER_ROSTER'
  status: ImportStatus
  sourceFileName: string
  worksheetName: string | null
  worksheetIndex: number | null
  failureMessage: string | null
  mappingSnapshot?: {
    mapping?: {
      timezone: string
      columns: Record<MappingField, string | null>
      assignSpeakersToEvent?: boolean
    } | null
  }
  rows: ImportRow[]
  inspection: {
    fileType: 'CSV' | 'XLSX'
    worksheets: Array<{ name: string; index: number; columns: string[]; rowCount: number }>
  }
  sourcePreview?: {
    worksheetName: string
    columns: string[]
    rows: Array<Record<string, string>>
  } | null
  discoveredMapping: { mapping: Partial<Record<MappingField, string>>; missingRequired: MappingField[] } | null
  aiInterpretation?: { status: 'NOT_NEEDED' | 'PROPOSED' | 'UNAVAILABLE' | 'FAILED'; plan: { confidence: number; warnings: string[] } | null; message: string | null }
  reconciliation?: {
    summary: { addedSessions: number; updatedSessions: number; unchangedSessions: number; missingSessions: number; changedTimes: number; changedRooms: number; changedSpeakerAssignments: number }
    missing: Array<{ id: string; title: string }>
  } | null
  completion: {
    importedCount: number
    updatedCount: number
    skippedCount: number
    duplicateCount: number
    failedCount: number
    createdSpeakerCount: number
    matchedSpeakerCount: number
  }
  sessionsStillNeedingReview: number | null
  confirmationMode: 'ATOMIC_ALL_OR_NOTHING'
}

interface AgendaSpeakerOption { id: string; name: string; email: string | null }

const MAPPING_FIELDS = EVENT_AGENDA_IMPORT_FIELDS
type MappingField = AgendaImportMappingField | SpeakerRosterImportMappingField

const fieldClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white'

const AGENDA_ADVANCED_MAPPING_FIELDS: AgendaImportMappingField[] = [
  'description', 'room', 'track', 'format', 'capacity', 'externalId', 'tags',
  'speakerEmails', 'speakerTitles', 'speakerOrganizations', 'speakerFirstNames', 'speakerLastNames',
]

const AGENDA_INTERPRETATION_LABELS: Record<AgendaImportMappingField, string> = {
  title: 'Session title', description: 'Description', startDate: 'Date', startTime: 'Start time',
  endDate: 'End date', endTime: 'End time', room: 'Room', track: 'Track', format: 'Format',
  speakerNames: 'Speakers', speakerFirstNames: 'Speaker first names', speakerLastNames: 'Speaker last names',
  speakerEmails: 'Speaker emails', speakerOrganizations: 'Speaker organizations', speakerTitles: 'Speaker titles',
  capacity: 'Capacity', externalId: 'External / source ID', tags: 'Tags',
}

function sourceInterpretation(column: string, mapping: Partial<Record<MappingField, string>>) {
  const keys = (Object.keys(AGENDA_INTERPRETATION_LABELS) as AgendaImportMappingField[]).filter((key) => mapping[key] === column)
  if (keys.includes('startTime') && keys.includes('endTime')) return { label: 'Start + end time', keys: ['startTime', 'endTime'] as AgendaImportMappingField[] }
  const key = keys[0]
  return key ? { label: AGENDA_INTERPRETATION_LABELS[key], keys: [key] } : { label: 'Not used', keys: [] as AgendaImportMappingField[] }
}

function sourceTransformation(keys: AgendaImportMappingField[], values: string[]) {
  if (keys.includes('startTime') && keys.includes('endTime')) return 'Time range detected'
  if (keys.includes('speakerNames') && values.some((value) => /[\n;|]/.test(value))) return 'Multiple names detected'
  return null
}

function sourceColumnCouldResolve(column: string, field: AgendaImportMappingField) {
  const normalizedColumn = column.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, ' ').trim()
  const definition = MAPPING_FIELDS.find((candidate) => candidate.key === field)
  return definition?.aliases.some((alias) => normalizedColumn.includes(alias)) ?? false
}

function jobTone(status: ImportStatus) {
  if (status === 'COMPLETED' || status === 'READY') return 'positive' as const
  if (status === 'FAILED' || status === 'CANCELLED') return 'critical' as const
  return 'attention' as const
}

function rowLabel(row: ImportRow) {
  if (row.status === 'READY') return 'Ready'
  if (row.status === 'DUPLICATE') return 'Duplicate'
  if (row.status === 'INVALID') {
    if (row.validationIssues?.some((issue) => issue.code === 'END_BEFORE_START')) return 'End time before start'
    if (row.validationIssues?.some((issue) => issue.code === 'INVALID_DATE_TIME' || issue.code === 'UNSUPPORTED_DATE_FORMAT')) return 'Invalid date/time'
    return 'Missing required information'
  }
  if (row.conflictType === 'POSSIBLE_OVERLAP') return 'Possible overlap'
  if (row.status === 'NEEDS_REVIEW') return 'Needs review'
  if (row.status === 'CONFIRMED') return row.result === 'UPDATED' ? 'Updated' : row.result === 'SKIPPED' ? 'Skipped' : 'Imported'
  return row.status.toLocaleLowerCase('en-US').replaceAll('_', ' ')
}

function rowTone(row: ImportRow) {
  if (row.status === 'READY' || row.status === 'CONFIRMED') return 'positive' as const
  if (row.status === 'INVALID' || row.status === 'FAILED') return 'critical' as const
  return 'attention' as const
}

function formatSessionDate(value?: string | null) {
  if (!value) return 'Date not provided'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date not provided' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatSessionTime(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function formatSessionMeta(row: ImportRow) {
  const startsAt = row.normalizedRowSnapshot?.startsAt
  const endsAt = row.normalizedRowSnapshot?.endsAt
  if (!startsAt) return 'Schedule not provided'
  const startTime = formatSessionTime(startsAt)
  const endTime = formatSessionTime(endsAt)
  return `${formatSessionDate(startsAt)}${startTime ? ` · ${startTime}${endTime ? `–${endTime}` : ''}` : ''}`
}

function dateTimeInputValue(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toIsoDateTime(value: string, fallback: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function AgendaRowCorrectionEditor({
  row,
  busy,
  onSave,
}: {
  row: ImportRow
  busy: boolean
  onSave: (normalizedRow: NonNullable<ImportRow['normalizedRowSnapshot']>) => void
}) {
  const normalized = row.normalizedRowSnapshot
  const [title, setTitle] = useState(normalized?.title ?? '')
  const [startsAt, setStartsAt] = useState(dateTimeInputValue(normalized?.startsAt))
  const [endsAt, setEndsAt] = useState(dateTimeInputValue(normalized?.endsAt))
  const [room, setRoom] = useState(normalized?.room ?? '')
  const [speakerNames, setSpeakerNames] = useState((normalized?.speakers ?? []).map((speaker) => speaker.name).join('; '))
  const [editing, setEditing] = useState(false)
  if (!normalized?.title) return null
  const save = () => {
    const names = speakerNames.split(/\s*[;|]\s*/).map((name) => name.trim()).filter(Boolean)
    onSave({
      ...normalized,
      title: title.trim(),
      startsAt: toIsoDateTime(startsAt, normalized.startsAt),
      endsAt: toIsoDateTime(endsAt, normalized.endsAt),
      timezone: startsAt || endsAt ? normalized.timezone : null,
      room: room.trim() || null,
      speakers: names.map((name, index) => ({ ...normalized.speakers?.[index], name })),
    })
  }
  if (!editing) return <div className="mt-4 border-t border-slate-200 pt-4"><Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(true)}>Edit details</Button></div>
  return <div className="mt-4 border-t border-slate-200 pt-4"><div className="grid gap-3"><label className="text-xs font-semibold text-slate-600">Title<input className={`${fieldClass} mt-1`} value={title} onChange={(event) => setTitle(event.target.value)} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Start<input type="datetime-local" className={`${fieldClass} mt-1`} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label className="text-xs font-semibold text-slate-600">End<input type="datetime-local" className={`${fieldClass} mt-1`} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label></div><label className="text-xs font-semibold text-slate-600">Room<input className={`${fieldClass} mt-1`} value={room} onChange={(event) => setRoom(event.target.value)} /></label><label className="text-xs font-semibold text-slate-600">Speakers<input className={`${fieldClass} mt-1`} value={speakerNames} onChange={(event) => setSpeakerNames(event.target.value)} /></label></div><div className="mt-3 flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button><Button type="button" size="sm" variant="secondary" disabled={busy || !title.trim()} onClick={save}>Save changes</Button></div></div>
}

export function EventAgendaImportWorkspace({
  eventId,
  accountSlug,
  importJobId,
  speakers,
  eventIsActive,
  onImportJobChanged,
  onManualEntry,
  onOpenSessions,
  onDiscard,
  speakerRosterOnly = false,
  agendaOnly = false,
}: {
  eventId: string
  accountSlug: string
  importJobId: string
  speakers: AgendaSpeakerOption[]
  eventIsActive: boolean
  onImportJobChanged: (jobId: string, status: ImportStatus) => void
  onManualEntry: () => void
  onOpenSessions: (filter?: 'review') => void
  onDiscard: () => void
  /** Speakers opens this same durable importer as a focused roster workflow. */
  speakerRosterOnly?: boolean
  /** Guided TEMPLATE setup uses this importer only for agenda ingestion. */
  agendaOnly?: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [job, setJob] = useState<ImportJob | null>(null)
  const [loading, setLoading] = useState(importJobId !== 'new')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  const [importType, setImportType] = useState<'AGENDA' | 'SPEAKER_ROSTER'>(speakerRosterOnly ? 'SPEAKER_ROSTER' : 'AGENDA')
  const [assignSpeakersToEvent, setAssignSpeakersToEvent] = useState(true)
  const [mapping, setMapping] = useState<Partial<Record<MappingField, string>>>({})
  const [filter, setFilter] = useState<'all' | 'ready' | 'review' | 'duplicate' | 'invalid' | 'ignored'>('all')
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [confirmLiveImportOpen, setConfirmLiveImportOpen] = useState(false)
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false)
  const endpoint = `/api/app/events/${encodeURIComponent(eventId)}/agenda/imports?account=${encodeURIComponent(accountSlug)}`

  const acceptJob = (nextJob: ImportJob) => {
    setJob(nextJob)
    const savedMapping = nextJob.mappingSnapshot?.mapping
    setMapping(Object.fromEntries(Object.entries(savedMapping?.columns ?? nextJob.discoveredMapping?.mapping ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string')))
    if (savedMapping?.timezone) setTimezone(savedMapping.timezone)
    if (savedMapping && typeof savedMapping.assignSpeakersToEvent === 'boolean') setAssignSpeakersToEvent(savedMapping.assignSpeakersToEvent)
    onImportJobChanged(nextJob.id, nextJob.status)
  }

  useEffect(() => {
    if (importJobId === 'new') { setLoading(false); setJob(null); return }
    let active = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`${endpoint}&job=${encodeURIComponent(importJobId)}`, { credentials: 'include', cache: 'no-store' })
        const body = await response.json().catch(() => ({}))
        if (!response.ok || !body.success) throw new Error(body.error || 'Failed to resume agenda import')
        if (active) acceptJob(body.data)
      } catch (currentError) {
        if (active) setError(currentError instanceof Error ? currentError.message : 'Failed to resume agenda import')
      } finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
    // acceptJob intentionally applies the latest route job only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, importJobId])

  const request = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.error || 'Agenda import update failed')
      // Confirmation returns completion counts alongside the persisted job.
      // Reload the canonical import shape so completed jobs still include their
      // inspection snapshot for this workspace.
      if (body.action === 'CONFIRM' && result.data?.job?.id) {
        const refreshed = await fetch(`${endpoint}&job=${encodeURIComponent(result.data.job.id)}`, { credentials: 'include', cache: 'no-store' })
        const refreshedBody = await refreshed.json().catch(() => ({}))
        if (!refreshed.ok || !refreshedBody.success) throw new Error(refreshedBody.error || 'Agenda import completed but could not be refreshed')
        acceptJob(refreshedBody.data)
        return refreshedBody.data as ImportJob
      }
      if (body.action === 'DISCARD') return result.data
      acceptJob(result.data)
      return result.data as ImportJob
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : 'Agenda import update failed')
      return null
    } finally { setBusy(false) }
  }

  const upload = async (file?: File) => {
    if (!file) return
    setBusy(true)
    setError(null)
    const formData = new FormData()
    formData.set('file', file)
    formData.set('importType', importType)
    try {
      const response = await fetch(endpoint, { method: 'POST', credentials: 'include', body: formData })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.error || 'Agenda upload failed')
      acceptJob(result.data)
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : 'Agenda upload failed')
    } finally { setBusy(false); setDragActive(false) }
  }

  const downloadTemplate = () => {
    const roster = importType === 'SPEAKER_ROSTER'
    const url = URL.createObjectURL(new Blob([roster ? buildSpeakerRosterImportTemplateCsv() : buildAgendaImportTemplateCsv()], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = roster ? EVENT_SPEAKER_ROSTER_TEMPLATE_FILENAME : EVENT_AGENDA_IMPORT_TEMPLATE_FILENAME
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  }

  const discardImport = async () => {
    const result = await request({ action: 'DISCARD', importJobId: job?.id })
    if (result) onDiscard()
  }

  const selectedWorksheet = job?.inspection.worksheets.find((worksheet) => worksheet.name === job.worksheetName) ?? job?.inspection.worksheets[0]
  const activeImportType = job?.importType ?? importType
  const mappingFields = activeImportType === 'SPEAKER_ROSTER' ? EVENT_SPEAKER_ROSTER_IMPORT_FIELDS : MAPPING_FIELDS
  const visibleRows = useMemo(() => (job?.rows ?? []).filter((row) => {
    if (filter === 'all') return true
    if (filter === 'ready') return row.status === 'READY' || (row.status === 'CONFIRMED' && row.result !== 'SKIPPED')
    if (filter === 'review') return row.status === 'NEEDS_REVIEW' || row.status === 'DUPLICATE'
    if (filter === 'duplicate') return row.status === 'DUPLICATE'
    if (filter === 'invalid') return row.status === 'INVALID' || row.status === 'FAILED'
    return row.status === 'IGNORED' || row.result === 'SKIPPED'
  }), [filter, job?.rows])
  const selectedRow = job?.rows.find((row) => row.id === selectedRowId) ?? null
  const counts = useMemo(() => ({
    ready: (job?.rows ?? []).filter((row) => row.status === 'READY').length,
    review: (job?.rows ?? []).filter((row) => row.status === 'NEEDS_REVIEW').length,
    duplicate: (job?.rows ?? []).filter((row) => row.status === 'DUPLICATE').length,
    invalid: (job?.rows ?? []).filter((row) => row.status === 'INVALID' || row.status === 'FAILED').length,
    ignored: (job?.rows ?? []).filter((row) => row.status === 'IGNORED' || row.result === 'SKIPPED').length,
  }), [job?.rows])
  const previewCounts = useMemo(() => {
    const agendaRows = (job?.rows ?? []).flatMap((row) => row.normalizedRowSnapshot?.title ? [row.normalizedRowSnapshot] : [])
    return {
      sessions: agendaRows.length,
      speakers: new Set(agendaRows.flatMap((row) => row.speakers ?? []).map((speaker) => (speaker.email || speaker.name).trim().toLocaleLowerCase('en-US'))).size,
      rooms: new Set(agendaRows.flatMap((row) => row.room ? [row.room.trim().toLocaleLowerCase('en-US')] : [])).size,
      review: counts.review + counts.invalid + counts.duplicate,
    }
  }, [counts.duplicate, counts.invalid, counts.review, job?.rows])
  const needsReviewCount = counts.review + counts.duplicate
  const hasReuploadChanges = Boolean(job?.reconciliation && (
    job.reconciliation.summary.updatedSessions > 0
    || job.reconciliation.summary.unchangedSessions > 0
    || job.reconciliation.summary.missingSessions > 0
  ))

  const saveRowDecision = async (row: ImportRow, resolution: RowResolution, speakerResolutions = row.speakerResolutionSnapshot ?? []) => {
    await request({ action: 'SAVE_DECISIONS', importJobId: job?.id, decisions: [{ rowId: row.id, resolution, speakerResolutions }] })
  }

  const sourceColumns = (job?.sourcePreview?.columns ?? selectedWorksheet?.columns ?? []).filter((column) => {
    const samples = job?.sourcePreview?.rows ?? []
    return samples.length === 0 || samples.some((row) => Boolean(row[column]?.trim()))
  })
  const updateAgendaSourceInterpretation = (column: string, nextKeys: AgendaImportMappingField[]) => {
    setMapping((current) => {
      const next = { ...current }
      for (const key of Object.keys(AGENDA_INTERPRETATION_LABELS) as AgendaImportMappingField[]) {
        if (next[key] === column) delete next[key]
      }
      for (const key of nextKeys) next[key] = column
      return next
    })
  }

  if (loading) return <EventCard padding="md"><p className="text-sm text-slate-500">Resuming agenda import…</p></EventCard>

  if (!job) return (
    <EventCard padding="md">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-base font-bold text-slate-950 dark:text-white">{speakerRosterOnly ? 'Import speakers' : agendaOnly ? 'Import agenda' : 'Import agenda or speaker roster'}</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">{speakerRosterOnly ? 'Upload a CSV or Excel speaker roster. Pulse will organize it for review.' : agendaOnly ? 'Upload a CSV or Excel agenda. Pulse will organize it for review.' : 'Choose an agenda or speaker roster to import and review.'}</p>
          {!speakerRosterOnly && !agendaOnly && <fieldset className="mt-4 flex flex-wrap gap-2" aria-label="Import type"><legend className="sr-only">Import type</legend><Button type="button" size="sm" variant={importType === 'AGENDA' ? 'primary' : 'secondary'} onClick={() => setImportType('AGENDA')}>Agenda / Sessions</Button><Button type="button" size="sm" variant={importType === 'SPEAKER_ROSTER' ? 'primary' : 'secondary'} onClick={() => setImportType('SPEAKER_ROSTER')}>Speaker Roster</Button></fieldset>}
          <div
            onDragEnter={() => setDragActive(true)}
            onDragLeave={() => setDragActive(false)}
            onDragOver={(event) => { event.preventDefault(); setDragActive(true) }}
            onDrop={(event) => { event.preventDefault(); void upload(event.dataTransfer.files[0]) }}
            className={`mt-4 rounded-xl border-2 border-dashed p-8 text-center ${dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50 dark:border-zinc-700 dark:bg-zinc-950/40'}`}
          >
            <p className="font-semibold text-slate-900 dark:text-white">{speakerRosterOnly ? 'Drop your speaker roster here' : agendaOnly ? 'Drop your agenda here' : 'Drop your file here'}</p>
            <p className="mt-1 text-xs text-slate-500">CSV or XLSX</p>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => void upload(event.target.files?.[0])} />
            <div className="mt-4 flex flex-wrap justify-center gap-2 border-t border-slate-200 pt-4 dark:border-zinc-700">
              <Button type="button" size="sm" disabled={busy} onClick={() => fileInputRef.current?.click()}>{busy ? 'Inspecting…' : 'Choose file'}</Button>
              <Button type="button" size="sm" variant="secondary" onClick={downloadTemplate}>Download template</Button>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="font-bold text-slate-950 dark:text-white">{speakerRosterOnly ? 'Add a speaker manually' : agendaOnly ? 'Add manually' : 'Add sessions manually'}</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">{speakerRosterOnly ? 'Add or edit speaker profiles directly.' : 'Add or edit sessions directly.'}</p>
          <Button className="mt-4" type="button" size="sm" variant="secondary" onClick={onManualEntry}>{speakerRosterOnly ? 'Open Add speaker' : agendaOnly ? 'Open session editor' : 'Open manual session entry'}</Button>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </EventCard>
  )

  if (job.status === 'COMPLETED') return (
    <EventCard padding="md">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><EventStatusPill label="Import complete" tone="positive" dot={false} /><h3 className="mt-3 text-lg font-bold text-slate-950 dark:text-white">{job.sourceFileName} is now in {job.importType === 'AGENDA' ? 'Sessions' : 'the speaker directory'}</h3><p className="mt-1 text-sm text-slate-600">The atomic import completed without partial writes.</p></div><Button type="button" onClick={() => onOpenSessions()}>{job.importType === 'AGENDA' ? 'Open imported Sessions' : 'Open speakers'}</Button></div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(job.importType === 'SPEAKER_ROSTER' ? [
        ['Speakers imported', job.completion.createdSpeakerCount + job.completion.matchedSpeakerCount], ['Created profiles', job.completion.createdSpeakerCount], ['Existing profiles reused', job.completion.matchedSpeakerCount], ['Skipped rows', job.completion.skippedCount],
      ] : [
        ['Created sessions', job.completion.importedCount], ['Updated sessions', job.completion.updatedCount], ['Skipped rows', job.completion.skippedCount], ['Created speakers', job.completion.createdSpeakerCount],
      ]).map(([label, value]) => <div key={String(label)} className="rounded-lg bg-slate-50 p-3 dark:bg-zinc-950"><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-1 text-xl font-bold text-slate-950 dark:text-white">{value}</dd></div>)}</dl>
      {job.importType === 'SPEAKER_ROSTER' && job.mappingSnapshot?.mapping?.assignSpeakersToEvent !== false && <p className="mt-3 text-sm font-medium text-slate-700">{job.completion.createdSpeakerCount + job.completion.matchedSpeakerCount} added to this event. No session assignments were created.</p>}
      {job.sessionsStillNeedingReview ? <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 p-3"><p className="text-sm text-amber-800">{job.sessionsStillNeedingReview} session{job.sessionsStillNeedingReview === 1 ? '' : 's'} still need review.</p><Button type="button" size="sm" variant="secondary" onClick={() => onOpenSessions('review')}>Review unresolved Sessions</Button></div> : null}
    </EventCard>
  )

  if (job.status === 'CONFIRMING') return <EventCard padding="md"><EventStatusPill label="Import in progress" tone="attention" dot /><h3 className="mt-3 font-bold text-slate-950 dark:text-white">Importing {job.sourceFileName}…</h3><p className="mt-1 text-sm text-slate-600">The server is applying the approved rows atomically. Refreshing this page will resume this job.</p></EventCard>

  // Uploads normally arrive here only after the server has interpreted and
  // classified them. Mapping remains an advanced recovery path for genuinely
  // unresolved structures or an explicit “Change mapping” action from review.
  const showMapping = job.status === 'MAPPING'
  if (showMapping && activeImportType === 'SPEAKER_ROSTER') return (
    <div className="space-y-4">
      <EventCard padding="md">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><EventStatusPill label="Adjust interpretation" tone="attention" dot={false} /><h3 className="mt-2 font-bold text-slate-950 dark:text-white">Change mapping</h3><p className="mt-1 text-sm text-slate-600">Pulse could not safely resolve every field. No agenda data is written until confirmation.</p></div><div className="flex items-center gap-2"><span className="text-sm text-slate-500">{selectedWorksheet?.rowCount ?? 0} source rows</span><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDiscardOpen(true)}>Discard import</Button></div></div>
        {job.inspection.worksheets.length > 1 && <label className="mt-4 block max-w-md text-xs font-semibold text-slate-600">Worksheet<select className={`${fieldClass} mt-1`} value={job.worksheetName ?? ''} onChange={(event) => void request({ action: 'SELECT_WORKSHEET', importJobId: job.id, worksheetName: event.target.value })}>{job.inspection.worksheets.map((worksheet) => <option key={worksheet.index} value={worksheet.name}>{worksheet.name} · {worksheet.rowCount} rows</option>)}</select></label>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{mappingFields.map(({ key, label, required }) => <label key={key} className="text-xs font-semibold text-slate-600">{label}{required ? ' *' : ''}<select disabled={activeImportType === 'SPEAKER_ROSTER' && ((Boolean(mapping.fullName) && (key === 'firstName' || key === 'lastName')) || (Boolean(mapping.firstName) && key === 'fullName'))} className={`${fieldClass} mt-1`} value={mapping[key] ?? ''} onChange={(event) => setMapping((current) => ({ ...current, [key]: event.target.value || undefined }))}><option value="">Ignore column</option>{selectedWorksheet?.columns.map((column) => <option key={column} value={column}>{column}</option>)}</select></label>)}</div>
        <label className="mt-4 flex items-start gap-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-sm font-medium text-slate-800"><input className="mt-0.5" type="checkbox" checked={assignSpeakersToEvent} onChange={(event) => setAssignSpeakersToEvent(event.target.checked)} /><span><strong>Add imported speakers to this event</strong><span className="mt-1 block text-xs font-normal text-slate-600">Profiles are always added to this account’s reusable speaker library. Session assignment remains a separate workflow.</span></span></label>
        {job.discoveredMapping?.missingRequired.length ? <p className="mt-3 text-sm text-amber-700">Map either Full name or First name.</p> : null}
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end"><Button type="button" disabled={busy || (!mapping.fullName && !mapping.firstName)} onClick={() => void request({ action: 'SAVE_MAPPING', importJobId: job.id, mapping: Object.fromEntries(mappingFields.map((field) => [field.key, mapping[field.key] || null])), timezone, assignSpeakersToEvent })}>{busy ? 'Validating rows…' : 'Review speaker roster'}</Button></div>
      </EventCard>
      <EventConfirmDialog open={confirmDiscardOpen} title="Discard import draft?" body="This removes the staged file, mapping, and review rows. No sessions or speakers will be changed." confirmLabel="Discard import" destructive busy={busy} onCancel={() => setConfirmDiscardOpen(false)} onConfirm={() => { setConfirmDiscardOpen(false); void discardImport() }} />
    </div>
  )

  if (showMapping) {
    const missingRequired = job.discoveredMapping?.missingRequired ?? []
    const sourceRows = job.sourcePreview?.rows ?? []
    const saveAgendaMapping = () => void request({
      action: 'SAVE_MAPPING',
      importJobId: job.id,
      mapping: Object.fromEntries(MAPPING_FIELDS.map((field) => [field.key, mapping[field.key] || null])),
      timezone,
    })
    return (
      <div className="space-y-4">
        <EventCard padding="md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-950 dark:text-white">Adjust interpretation</h3>
              <p className="mt-1 text-sm text-slate-600">Pulse interpreted {sourceColumns.length} source column{sourceColumns.length === 1 ? '' : 's'}.</p>
              {missingRequired.length > 0 && <p className="mt-2 text-sm font-medium text-amber-700">{missingRequired.length} field{missingRequired.length === 1 ? '' : 's'} needs confirmation</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={saveAgendaMapping}>Back to review</Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDiscardOpen(true)}>Discard import</Button>
            </div>
          </div>

          {job.inspection.worksheets.length > 1 && <label className="mt-5 block max-w-sm text-xs font-semibold text-slate-600">Worksheet<select className={`${fieldClass} mt-1`} value={job.worksheetName ?? ''} onChange={(event) => void request({ action: 'SELECT_WORKSHEET', importJobId: job.id, worksheetName: event.target.value })}>{job.inspection.worksheets.map((worksheet) => <option key={worksheet.index} value={worksheet.name}>{worksheet.name} · {worksheet.rowCount} rows</option>)}</select></label>}

          <div className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-zinc-800 dark:border-zinc-800">
            {sourceColumns.map((column) => {
              const samples = sourceRows.map((row) => row[column]?.trim()).filter(Boolean)
              const interpretation = sourceInterpretation(column, mapping)
              const transformation = sourceTransformation(interpretation.keys, samples)
              const needsConfirmation = interpretation.keys.length === 0 && missingRequired.some((field) => field in AGENDA_INTERPRETATION_LABELS && sourceColumnCouldResolve(column, field as AgendaImportMappingField))
              const interpretationValue = interpretation.keys.join('|')
              const primaryInterpretationValues = new Set(['title', 'startDate', 'startTime|endTime', 'startTime', 'endTime', 'speakerNames', 'speakerEmails', 'speakerOrganizations'])
              return <div key={column} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{column}</p>
                  <p className="mt-1 max-h-16 max-w-xl overflow-hidden whitespace-pre-line text-sm text-slate-600" title={samples[0] || ''}>{samples[0] || 'No sample value'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span aria-hidden className="text-slate-400">→</span>
                  <div className="text-right"><p className={`text-sm font-semibold ${needsConfirmation ? 'text-amber-700' : 'text-slate-950 dark:text-white'}`}>{needsConfirmation ? 'Choose meaning' : interpretation.label}</p>{transformation && <p className="mt-0.5 text-xs text-slate-500">{transformation}</p>}{needsConfirmation && <p className="mt-0.5 text-xs text-amber-700">Needs confirmation</p>}</div>
                  <select aria-label={`Interpret ${column} as`} className="w-40 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800" value={interpretationValue} onChange={(event) => updateAgendaSourceInterpretation(column, event.target.value ? event.target.value.split('|') as AgendaImportMappingField[] : [])}>
                    <option value="">Ignore</option>
                    {interpretationValue && !primaryInterpretationValues.has(interpretationValue) && <option value={interpretationValue}>{interpretation.label}</option>}
                    <option value="title">Session title</option>
                    <option value="startDate">Date</option>
                    <option value="startTime|endTime">Start + end time</option>
                    <option value="startTime">Start time</option>
                    <option value="endTime">End time</option>
                    <option value="speakerNames">Speakers</option>
                    <option value="speakerEmails">Speaker emails</option>
                    <option value="speakerOrganizations">Speaker organizations</option>
                  </select>
                </div>
              </div>
            })}
          </div>

          <details className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-zinc-800">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-white">Advanced options</summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {AGENDA_ADVANCED_MAPPING_FIELDS.map((key) => <label key={key} className="text-xs font-semibold text-slate-600">{AGENDA_INTERPRETATION_LABELS[key]}<select className={`${fieldClass} mt-1`} value={mapping[key] ?? ''} onChange={(event) => setMapping((current) => ({ ...current, [key]: event.target.value || undefined }))}><option value="">Ignore</option>{sourceColumns.map((column) => <option key={column} value={column}>{column}</option>)}</select></label>)}
              <label className="text-xs font-semibold text-slate-600">Timezone override<input className={`${fieldClass} mt-1`} value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label>
            </div>
          </details>

          {sourceRows.length > 0 && <div className="mt-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Source preview</p><div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500 dark:bg-zinc-900"> <tr>{sourceColumns.map((column) => <th key={column} className="whitespace-nowrap px-3 py-2 font-semibold">{column}</th>)}</tr></thead><tbody>{sourceRows.map((row, index) => <tr key={index} className="border-t border-slate-100 dark:border-zinc-800">{sourceColumns.map((column) => <td key={column} className="max-w-48 truncate px-3 py-2 text-slate-700 dark:text-zinc-300" title={row[column] || ''}>{row[column] || '—'}</td>)}</tr>)}</tbody></table></div></div>}

          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
          <div className="mt-5 flex justify-end"><Button type="button" disabled={busy || !mapping.title} onClick={saveAgendaMapping}>{busy ? 'Applying changes…' : 'Review agenda'}</Button></div>
        </EventCard>
        <EventConfirmDialog open={confirmDiscardOpen} title="Discard import draft?" body="This removes the staged file, mapping, and review rows. No sessions or speakers will be changed." confirmLabel="Discard import" destructive busy={busy} onCancel={() => setConfirmDiscardOpen(false)} onConfirm={() => { setConfirmDiscardOpen(false); void discardImport() }} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <EventCard padding="md">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-950 dark:text-white">Review {activeImportType === 'AGENDA' ? 'agenda' : 'speaker roster'}</h3><p className="mt-1 text-sm text-slate-600">{job.sourceFileName} · {activeImportType === 'AGENDA' ? `${previewCounts.sessions} sessions · ${previewCounts.speakers} speakers` : `${job.rows.length} speakers`}</p>{activeImportType === 'AGENDA' && <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><span aria-hidden>✓</span> Agenda interpreted</div>}</div><div className="flex gap-2"><Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void request({ action: 'SELECT_WORKSHEET', importJobId: job.id, worksheetName: job.worksheetName })}>Change mapping</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDiscardOpen(true)}>Discard</Button></div></div>
        {hasReuploadChanges && activeImportType === 'AGENDA' && job.reconciliation && <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600"><span>{job.reconciliation.summary.addedSessions} new</span><span>·</span><span>{job.reconciliation.summary.updatedSessions} updated</span><span>·</span><span>{job.reconciliation.summary.unchangedSessions} unchanged</span><span>·</span><span>{job.reconciliation.summary.missingSessions} missing</span>{job.reconciliation.missing.length > 0 && <details className="ml-1"><summary className="cursor-pointer font-medium text-slate-800">Details</summary><ul className="mt-2 list-disc space-y-1 pl-5">{job.reconciliation.missing.map((session) => <li key={session.id}>{session.title}</li>)}</ul></details>}</div>}
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Import row status filters">{([
          ['all', 'All', job.rows.length], ['ready', 'Ready', counts.ready], ['review', 'Needs review', needsReviewCount], ['invalid', 'Invalid', counts.invalid],
        ] as const).map(([key, label, count]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === key ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600'}`}>{label} · {count}</button>)}</div>
      </EventCard>

      <div>
        <EventCard padding="sm">
          <div className="space-y-2">{visibleRows.length === 0 ? <EventEmptyState size="sm" title="No sessions in this filter" description="Choose another status to continue reviewing." /> : visibleRows.map((row) => <button key={row.id} type="button" aria-pressed={selectedRowId === row.id} onClick={() => setSelectedRowId(row.id)} className={`w-full rounded-xl border px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${selectedRowId === row.id ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200 bg-white hover:border-slate-300 dark:border-zinc-800 dark:bg-zinc-900'}`}><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-semibold text-slate-950 dark:text-white">{row.normalizedRowSnapshot?.title || row.normalizedRowSnapshot?.displayName || row.rawRowSnapshot.title || row.rawRowSnapshot.Name || 'Untitled record'}</p><p className="mt-1 text-xs text-slate-500">{activeImportType === 'SPEAKER_ROSTER' ? (row.normalizedRowSnapshot?.sessionTitle ? `Assign to ${row.normalizedRowSnapshot.sessionTitle}` : 'No session assignment') : formatSessionMeta(row)}{row.normalizedRowSnapshot?.room ? ` · ${row.normalizedRowSnapshot.room}` : ''}</p>{activeImportType === 'AGENDA' && row.normalizedRowSnapshot?.speakers?.length ? <p className="mt-1 truncate text-xs text-slate-600">{row.normalizedRowSnapshot.speakers.map((speaker) => speaker.name).join(', ')}</p> : null}</div>{row.status !== 'READY' && row.status !== 'CONFIRMED' && <EventStatusPill label={rowLabel(row)} tone={rowTone(row)} dot={false} size="sm" />}</div></button>)}</div>
        </EventCard>
        {selectedRow && <EventWorkspaceDrawer open title={activeImportType === 'AGENDA' ? 'Session details' : 'Speaker details'} eyebrow={activeImportType === 'AGENDA' ? 'Agenda review' : 'Speaker review'} summary={selectedRow.normalizedRowSnapshot?.title || selectedRow.normalizedRowSnapshot?.displayName || 'Untitled record'} width="compact" onClose={() => setSelectedRowId(null)} testId="agenda-session-review-drawer" ariaLabel={activeImportType === 'AGENDA' ? 'Review session details' : 'Review speaker details'}><dl className="space-y-4 text-sm"><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Title</dt><dd className="mt-1 font-medium text-slate-950 dark:text-white">{selectedRow.normalizedRowSnapshot?.title || selectedRow.normalizedRowSnapshot?.displayName || 'Not provided'}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date</dt><dd className="mt-1 text-slate-700">{formatSessionDate(selectedRow.normalizedRowSnapshot?.startsAt)}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Time</dt><dd className="mt-1 text-slate-700">{formatSessionTime(selectedRow.normalizedRowSnapshot?.startsAt) || 'Not provided'}{formatSessionTime(selectedRow.normalizedRowSnapshot?.endsAt) ? ` → ${formatSessionTime(selectedRow.normalizedRowSnapshot?.endsAt)}` : ''}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Speakers</dt><dd className="mt-1 text-slate-700">{selectedRow.normalizedRowSnapshot?.speakers?.map((speaker) => speaker.name).join(', ') || 'Not provided'}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Room</dt><dd className="mt-1 text-slate-700">{selectedRow.normalizedRowSnapshot?.room || 'Not provided'}</dd></div></dl><div className="mt-4 space-y-2 text-sm">{selectedRow.conflictType && <p className="rounded-lg bg-amber-50 p-3 text-amber-800">{selectedRow.conflictType.replaceAll('_', ' ').toLocaleLowerCase('en-US')}</p>}{selectedRow.validationIssues?.map((issue) => <div key={`${issue.code}-${issue.field}`} className={issue.severity === 'ERROR' ? 'rounded-lg bg-red-50 p-3 text-red-700' : 'rounded-lg bg-amber-50 p-3 text-amber-700'}>{issue.message}</div>)}</div>
          {activeImportType === 'AGENDA' && <AgendaRowCorrectionEditor key={`${selectedRow.id}-${selectedRow.updatedAt ?? ''}`} row={selectedRow} busy={busy} onSave={(normalizedRow) => { void request({ action: 'SAVE_CORRECTION', importJobId: job.id, correction: { rowId: selectedRow.id, normalizedRow } }) }} />}
          {(selectedRow.speakerResolutionSnapshot?.length ?? 0) > 0 && <div className="mt-4 border-t border-slate-200 pt-4"><h5 className="text-xs font-bold uppercase tracking-wide text-slate-500">Speaker reconciliation</h5><div className="mt-2 space-y-3">{selectedRow.speakerResolutionSnapshot!.map((speaker, index) => <div key={`${speaker.sourceName}-${index}`} className="rounded-lg bg-slate-50 p-3"><p className="text-sm font-semibold text-slate-900">{speaker.sourceName}{speaker.sourceEmail ? ` · ${speaker.sourceEmail}` : ''}</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><select aria-label={`Decision for ${speaker.sourceName}`} className={fieldClass} value={speaker.decision ?? ''} onChange={(event) => { const next = [...(selectedRow.speakerResolutionSnapshot ?? [])]; next[index] = { ...speaker, decision: event.target.value as SpeakerDecision, matchedSpeakerId: ['LINK_EXISTING', 'MERGE'].includes(event.target.value) ? speaker.matchedSpeakerId : null }; setJob((current) => current ? { ...current, rows: current.rows.map((row) => row.id === selectedRow.id ? { ...row, speakerResolutionSnapshot: next } : row) } : current) }}><option value="">Choose decision</option>{speaker.candidateSpeakerIds.length > 0 && <option value="LINK_EXISTING">Link existing</option>}{speaker.candidateSpeakerIds.length > 0 && <option value="MERGE">Merge into existing</option>}{speaker.candidateSpeakerIds.length === 0 && <option value="CREATE_NEW">Create new</option>}<option value="KEEP_SEPARATE">Keep separate</option><option value="IGNORE">Ignore</option></select>{['LINK_EXISTING', 'MERGE'].includes(speaker.decision ?? '') && <select aria-label={`Existing profile for ${speaker.sourceName}`} className={fieldClass} value={speaker.matchedSpeakerId ?? ''} onChange={(event) => { const next = [...(selectedRow.speakerResolutionSnapshot ?? [])]; next[index] = { ...speaker, matchedSpeakerId: event.target.value }; setJob((current) => current ? { ...current, rows: current.rows.map((row) => row.id === selectedRow.id ? { ...row, speakerResolutionSnapshot: next } : row) } : current) }}><option value="">Choose profile</option>{speaker.candidateSpeakerIds.map((id) => <option key={id} value={id}>{speakers.find((candidate) => candidate.id === id)?.name ?? 'Existing speaker'}</option>)}</select>}</div></div>)}</div></div>}
          {selectedRow.status !== 'READY' && selectedRow.status !== 'CONFIRMED' && selectedRow.status !== 'IGNORED' && <div className="mt-5 border-t border-slate-200 pt-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Row decision</p><div className="mt-2 flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void saveRowDecision(selectedRow, 'SKIP')}>Skip</Button>{selectedRow.existingSessionId && <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void saveRowDecision(selectedRow, 'REPLACE_EXISTING')}>Replace existing</Button>}{selectedRow.status !== 'INVALID' && <Button type="button" size="sm" disabled={busy} onClick={() => void saveRowDecision(selectedRow, 'KEEP_BOTH')}>Keep both</Button>}<Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void saveRowDecision(selectedRow, 'REVIEW')}>Keep in review</Button></div></div>}
        </EventWorkspaceDrawer>}
      </div>

      <div className="sticky bottom-4 z-20" data-testid="agenda-import-confirmation">
        <EventCard padding="md" className="shadow-[0_-10px_35px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div>{(needsReviewCount + counts.invalid) > 0 && <p className="text-sm text-amber-700">Resolve {needsReviewCount + counts.invalid} item{needsReviewCount + counts.invalid === 1 ? '' : 's'} before confirming.</p>}{job.failureMessage && <p role="alert" className="text-sm text-red-700">{job.failureMessage}</p>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</div><Button type="button" disabled={busy || (job.status !== 'READY' && job.status !== 'FAILED')} onClick={() => { if (eventIsActive) setConfirmLiveImportOpen(true); else void request({ action: 'CONFIRM', importJobId: job.id, confirmLiveEdit: false }) }}>{busy ? `Importing ${activeImportType === 'AGENDA' ? 'agenda' : 'speaker roster'}…` : job.status === 'FAILED' ? 'Retry import' : `Confirm ${activeImportType === 'AGENDA' ? `${counts.ready} sessions` : `${counts.ready} speakers`}`}</Button><EventConfirmDialog open={confirmLiveImportOpen} title={activeImportType === 'AGENDA' ? 'Confirm schedule change?' : 'Confirm speaker roster import?'} body={activeImportType === 'AGENDA' ? 'This event is live. Importing updates the published agenda for attendees immediately.' : 'This event is live. Importing adds the approved speaker records immediately.'} confirmLabel={activeImportType === 'AGENDA' ? 'Import agenda' : 'Import speaker roster'} busy={busy} onCancel={() => setConfirmLiveImportOpen(false)} onConfirm={() => { setConfirmLiveImportOpen(false); void request({ action: 'CONFIRM', importJobId: job.id, confirmLiveEdit: true }) }} /></div>
        </EventCard>
      </div>
      <EventConfirmDialog open={confirmDiscardOpen} title="Discard import draft?" body="This removes the staged file, mapping, and review rows. No sessions or speakers will be changed." confirmLabel="Discard import" destructive busy={busy} onCancel={() => setConfirmDiscardOpen(false)} onConfirm={() => { setConfirmDiscardOpen(false); void discardImport() }} />
    </div>
  )
}
