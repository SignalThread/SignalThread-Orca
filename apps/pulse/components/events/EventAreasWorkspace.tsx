'use client'

import { useEffect, useMemo, useState } from 'react'
import { Globe2, MapPin, Tag } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EventEmptyState, OperationsSearchToolbar } from '@/components/app/events'
import { EventSurveyLibraryPicker, isSurveyAssignableToEventTarget, type SurveyLibraryItem } from '@/components/events/EventSurveyLibraryPicker'
import { EventSurveyAssignmentControl } from '@/components/events/EventSurveyAssignmentControl'
import { EventEntityCard, EventEntityListShell } from '@/components/events/EventEntityCard'

export type EventAreaKind = 'EVENT' | 'AREA' | 'SPONSOR_ACTIVATION' | 'CUSTOM_TOUCHPOINT'

export interface EventAreaStructureItem {
  id: string
  kind: EventAreaKind | 'SESSION'
  name: string
  description: string | null
}

interface EventAreaSurvey extends SurveyLibraryItem {
  structureItemIds?: string[]
}

type AreaTypeFilter = 'all' | EventAreaKind
type AreaSurveyFilter = 'all' | 'assigned' | 'unassigned'

const AREA_TYPES: Array<{ kind: EventAreaKind; label: string; description: string }> = [
  { kind: 'AREA', label: 'Location', description: 'Physical areas like Registration, Expo Hall, Breakout Room, and other places at the event.' },
  { kind: 'SPONSOR_ACTIVATION', label: 'Sponsor activation', description: 'Sponsor booths, activations, or branded experiences.' },
  { kind: 'EVENT', label: 'Event-wide', description: 'Feedback about the whole event, not one place inside it.' },
  { kind: 'CUSTOM_TOUCHPOINT', label: 'Custom', description: 'Any other area or touchpoint that does not fit above.' },
]

function typeLabel(kind: EventAreaKind | 'SESSION') {
  return AREA_TYPES.find((type) => type.kind === kind)?.label ?? 'Session'
}

export function filterEventAreas(
  items: EventAreaStructureItem[],
  assignedSurveyByItemId: Map<string, EventAreaSurvey>,
  search: string,
  typeFilter: AreaTypeFilter,
  surveyFilter: AreaSurveyFilter,
) {
  const query = search.trim().toLocaleLowerCase()
  return items.filter((item) => {
    const assignedSurvey = assignedSurveyByItemId.get(item.id)
    if (typeFilter !== 'all' && item.kind !== typeFilter) return false
    if (surveyFilter === 'assigned' && !assignedSurvey) return false
    if (surveyFilter === 'unassigned' && assignedSurvey) return false
    if (!query) return true
    return [item.name, item.description, typeLabel(item.kind), assignedSurvey?.name]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase().includes(query))
  })
}

function EventAreaTypeIcon({ kind }: { kind: EventAreaKind | 'SESSION' }) {
  const Icon = kind === 'EVENT' ? Globe2 : kind === 'SPONSOR_ACTIVATION' ? Tag : MapPin
  const tone = kind === 'EVENT'
    ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300'
    : kind === 'SPONSOR_ACTIVATION'
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'

  return <span aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
}

interface EventAreasWorkspaceProps {
  accountSlug: string
  eventId: string
  items: EventAreaStructureItem[]
  surveys: EventAreaSurvey[]
  openCreate?: boolean
  onCreateOpened?: () => void
  onCreated: (item: EventAreaStructureItem) => void
  onChanged: () => Promise<boolean | void> | boolean | void
}

/**
 * The one mounted Event Area surface for the Event Workspace. It deliberately
 * uses the existing structure and agenda assignment endpoints rather than
 * maintaining a parallel Event Area or survey model.
 */
export function EventAreasWorkspace({ accountSlug, eventId, items, surveys, openCreate: shouldOpenCreate = false, onCreateOpened, onCreated, onChanged }: EventAreasWorkspaceProps) {
  const [helpOpen, setHelpOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<EventAreaStructureItem | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<EventAreaKind>('AREA')
  const [surveyId, setSurveyId] = useState('')
  const [saving, setSaving] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [areaSearch, setAreaSearch] = useState('')
  const [areaTypeFilter, setAreaTypeFilter] = useState<AreaTypeFilter>('all')
  const [areaSurveyFilter, setAreaSurveyFilter] = useState<AreaSurveyFilter>('all')
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([])

  const assignedSurveyByItemId = useMemo(
    () => new Map(surveys.flatMap((survey) => (survey.structureItemIds ?? []).map((itemId) => [itemId, survey] as const))),
    [surveys],
  )
  const filteredItems = useMemo(
    () => filterEventAreas(items, assignedSurveyByItemId, areaSearch, areaTypeFilter, areaSurveyFilter),
    [areaSearch, areaSurveyFilter, areaTypeFilter, assignedSurveyByItemId, items],
  )
  const allVisibleSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedAreaIds.includes(item.id))
  const toggleVisibleSelection = (checked: boolean) => setSelectedAreaIds((current) => checked
    ? [...new Set([...current, ...filteredItems.map((item) => item.id)])]
    : current.filter((id) => !filteredItems.some((item) => item.id === id)),
  )
  const toggleAreaSelection = (areaId: string, checked: boolean) => setSelectedAreaIds((current) => checked
    ? [...new Set([...current, areaId])]
    : current.filter((id) => id !== areaId),
  )

  const openCreate = () => {
    setEditingItem(null)
    setName('')
    setDescription('')
    setKind('AREA')
    setSurveyId('')
    setError(null)
    setDialogOpen(true)
  }

  useEffect(() => {
    if (!shouldOpenCreate) return
    openCreate()
    onCreateOpened?.()
  }, [shouldOpenCreate])

  const openEdit = (item: EventAreaStructureItem) => {
    setEditingItem(item)
    setName(item.name)
    setDescription(item.description ?? '')
    setKind(item.kind as EventAreaKind)
    setSurveyId(assignedSurveyByItemId.get(item.id)?.id ?? '')
    setError(null)
    setDialogOpen(true)
  }

  const closeDialog = () => {
    if (saving) return
    setDialogOpen(false)
    setEditingItem(null)
    setError(null)
  }

  const attachSurvey = async (nextSurveyId: string, targetIds: string[]) => {
    const response = await fetch(`/api/app/events/${eventId}/agenda?account=${encodeURIComponent(accountSlug)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'BULK_ASSIGN_EXISTING_SURVEY',
        targetType: 'AREA',
        targetIds,
        surveyId: nextSurveyId,
        conflictMode: 'REPLACE_EXISTING',
      }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || !body.success) throw new Error(body.error || 'Failed to attach survey')
  }

  const detachSurvey = async (targetIds: string[]) => {
    const response = await fetch(`/api/app/events/${eventId}/agenda?account=${encodeURIComponent(accountSlug)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'CLEAR_EXISTING_SURVEY_ASSIGNMENT', targetType: 'AREA', targetIds }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || !body.success) throw new Error(body.error || 'Failed to detach survey')
  }

  const openSurveyCreator = () => {
    window.location.assign(`/app/events/${encodeURIComponent(eventId)}/surveys/new?${new URLSearchParams({ account: accountSlug }).toString()}`)
  }

  const surveyEditorHref = (surveyId: string) => `/app/events/${encodeURIComponent(eventId)}/surveys/new?${new URLSearchParams({ account: accountSlug, survey: surveyId }).toString()}`

  const saveArea = async () => {
    if (saving) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Name is required')
      return
    }

    try {
      setSaving(true)
      setError(null)
      const isEditing = Boolean(editingItem)
      const response = await fetch(
        isEditing
          ? `/api/app/events/${eventId}/structure/${editingItem?.id}?account=${encodeURIComponent(accountSlug)}`
          : `/api/app/events/${eventId}/structure?account=${encodeURIComponent(accountSlug)}`,
        {
          method: isEditing ? 'PATCH' : 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isEditing
            ? { name: trimmedName, description: description.trim() || null }
            : { kind, name: trimmedName, description: description.trim() || null }),
        },
      )
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.success) throw new Error(body.error || `Failed to ${isEditing ? 'update' : 'create'} Event Area`)

      const item = (isEditing ? { ...editingItem, name: trimmedName, description: description.trim() || null } : body.data) as EventAreaStructureItem
      if (surveyId && assignedSurveyByItemId.get(item.id)?.id !== surveyId) {
        await attachSurvey(surveyId, [item.id])
      }
      if (!isEditing) onCreated(item)
      setDialogOpen(false)
      setEditingItem(null)
      setNotice(surveyId ? null : 'Event Area created. Attach a survey when you are ready.')
      await onChanged()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save Event Area')
    } finally {
      setSaving(false)
    }
  }

  const archiveArea = async (item: EventAreaStructureItem) => {
    if (archivingId) return
    try {
      setArchivingId(item.id)
      setError(null)
      const response = await fetch(`/api/app/events/${eventId}/structure/${item.id}?account=${encodeURIComponent(accountSlug)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.success) throw new Error(body.error || 'Failed to archive Event Area')
      await onChanged()
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Failed to archive Event Area')
    } finally {
      setArchivingId(null)
    }
  }

  return <section id="event-areas" aria-label="Event Areas management" className="space-y-4" data-testid="event-areas-workspace">
    <div className="border-b border-slate-200 pb-4 dark:border-zinc-800">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Event Areas</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-zinc-400">Non-session places you collect feedback — registration, expo, sponsor booths. <button type="button" onClick={() => setHelpOpen((current) => !current)} aria-expanded={helpOpen} aria-controls="event-area-help" className="font-semibold text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900 dark:text-indigo-300">Which target should I use?</button></p>
      </div>
    </div>

    {helpOpen && <div id="event-area-help" className="rounded-2xl border border-violet-200 bg-violet-50 px-5 py-5 text-slate-700 dark:border-violet-900/60 dark:bg-violet-950/20 dark:text-zinc-200">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {AREA_TYPES.map((type) => <div key={type.kind}><h3 className="font-bold text-slate-950 dark:text-white">{type.label}</h3><p className="mt-1 text-sm leading-5">{type.description}</p></div>)}
      </div>
      <p className="mt-5 border-t border-violet-200 pt-4 text-sm font-medium dark:border-violet-900/60">Sessions and speakers have their own pages — attach feedback to them there.</p>
    </div>}

    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-100">{notice}</div>}

    <EventEntityListShell>
      <div>
        <OperationsSearchToolbar
          entityLabel="event areas"
          selectedCount={selectedAreaIds.length}
          hasResults={filteredItems.length > 0}
          allSelected={allVisibleSelected}
          onToggleAll={toggleVisibleSelection}
          searchValue={areaSearch}
          onSearchChange={setAreaSearch}
          searchPlaceholder="Search event areas..."
          filters={<div className="grid gap-4 sm:grid-cols-2" aria-label="Event area filters">
            <fieldset><legend className="text-xs font-bold uppercase tracking-wide text-slate-500">Area type</legend><div className="mt-2 flex flex-wrap gap-2">{([['all', 'All types'], ...AREA_TYPES.map((type) => [type.kind, type.label] as const)] as Array<[AreaTypeFilter, string]>).map(([value, label]) => <button key={value} type="button" aria-pressed={areaTypeFilter === value} onClick={() => setAreaTypeFilter(value)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${areaTypeFilter === value ? 'border-[#0B1638] bg-[#0B1638] text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}</div></fieldset>
            <fieldset><legend className="text-xs font-bold uppercase tracking-wide text-slate-500">Survey assignment</legend><div className="mt-2 flex flex-wrap gap-2">{([['all', 'All'], ['assigned', 'Assigned'], ['unassigned', 'Unassigned']] as Array<[AreaSurveyFilter, string]>).map(([value, label]) => <button key={value} type="button" aria-pressed={areaSurveyFilter === value} onClick={() => setAreaSurveyFilter(value)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${areaSurveyFilter === value ? 'border-[#0B1638] bg-[#0B1638] text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}</div></fieldset>
          </div>}
        />
      </div>
      <div className="mt-4 space-y-3">
      {items.length === 0 ? <div className="p-5"><EventEmptyState size="sm" title="No Event Areas yet" description="Add an Event Area to collect feedback here." /></div> : filteredItems.length === 0 ? <div className="p-5"><EventEmptyState size="sm" title="No Event Areas match these filters" description="Try a different search or filter to see more Event Areas." actions={[{ label: 'Clear filters', variant: 'secondary', onClick: () => { setAreaSearch(''); setAreaTypeFilter('all'); setAreaSurveyFilter('all') } }]} /></div> : filteredItems.map((item) => {
        const attachedSurvey = assignedSurveyByItemId.get(item.id)
        const selected = selectedAreaIds.includes(item.id)
        return <EventEntityCard key={item.id} selected={selected} className="group relative flex flex-col gap-4 pr-[10.5rem] hover:bg-[#f7f9fe] [&:has(.event-survey-assignment-toolbar[data-open=true])]:bg-[#f7f9fe] lg:flex-row lg:items-center">
          <label className="flex shrink-0 items-center"><input type="checkbox" aria-label={`Select ${item.name}`} checked={selected} onChange={(event) => toggleAreaSelection(item.id, event.target.checked)} /></label>
          <div className="flex min-w-0 items-start gap-3"><EventAreaTypeIcon kind={item.kind} /><div className="min-w-0"><p className="font-semibold text-slate-950 dark:text-white">{item.name}</p>{item.description && <p className="mt-1 truncate text-sm text-slate-500 dark:text-zinc-400">{item.description}</p>}</div></div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600 dark:text-zinc-300"><span>{typeLabel(item.kind)}</span><span>{attachedSurvey?.name ?? 'No survey'}</span></div>
          <div className="flex min-w-0 items-center gap-2 lg:ml-auto lg:justify-end">
            <EventSurveyAssignmentControl entityName={item.name} surveys={surveys} currentEventId={eventId} assignedSurvey={attachedSurvey} onAssign={async (nextSurveyId) => { try { setError(null); await attachSurvey(nextSurveyId, [item.id]); const refreshed = await onChanged(); if (refreshed !== false) setNotice(attachedSurvey ? 'Survey changed' : 'Survey assigned') } catch (attachError) { setError(attachError instanceof Error ? attachError.message : 'Failed to attach survey') } }} onDetach={async () => { try { setError(null); await detachSurvey([item.id]); if (await onChanged() !== false) setNotice('Survey detached') } catch (detachError) { setError(detachError instanceof Error ? detachError.message : 'Failed to detach survey') } }} onCreateSurvey={openSurveyCreator} previewHref={attachedSurvey ? surveyEditorHref(attachedSurvey.id) : undefined} isSurveySelectable={(survey) => isSurveyAssignableToEventTarget(survey, eventId)} />
          </div>
        </EventEntityCard>
      })}
      </div>
    </EventEntityListShell>

    {dialogOpen && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="event-area-dialog-title" className="w-full max-w-5xl overflow-hidden rounded-[28px] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.3)] dark:bg-zinc-950">
        <div className="grid md:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]">
          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4"><div><h2 id="event-area-dialog-title" className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{editingItem ? 'Edit Event Area' : 'New Event Area'}</h2><p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">{editingItem ? 'Update the details for this Event Area.' : 'Add a place or touchpoint where you want attendee feedback.'}</p></div><button type="button" aria-label="Close" onClick={closeDialog} className="text-2xl leading-none text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200">×</button></div>
            <div className="mt-7 space-y-5"><label className="block text-sm font-semibold text-slate-800 dark:text-zinc-100">Name <span className="text-red-600">*</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Expo Hall" disabled={saving} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-slate-950 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white" /></label>
              <label className="block text-sm font-semibold text-slate-800 dark:text-zinc-100">Description <span className="font-normal text-slate-400">Optional</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional context for this Event Area" disabled={saving} rows={3} className="mt-2 w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-slate-950 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white" /></label>
              <fieldset><legend className="text-sm font-semibold text-slate-800 dark:text-zinc-100">Type <span className="text-red-600">*</span></legend><div className="mt-2 grid grid-cols-2 gap-2"><input type="hidden" value={kind} />{AREA_TYPES.map((type) => <button key={type.kind} type="button" disabled={Boolean(editingItem) || saving} aria-pressed={kind === type.kind} onClick={() => setKind(type.kind)} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${kind === type.kind ? 'border-indigo-600 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200' : 'border-slate-200 text-slate-600 hover:border-indigo-300 dark:border-zinc-700 dark:text-zinc-300'} disabled:cursor-not-allowed disabled:opacity-70`}>{type.label}</button>)}</div>{editingItem && <p className="mt-2 text-xs text-slate-500">Type is fixed after creation.</p>}</fieldset>
              <div><p className="text-sm font-semibold text-slate-800 dark:text-zinc-100">Survey <span className="font-normal text-slate-400">Optional</span></p><EventSurveyLibraryPicker surveys={surveys} currentEventId={eventId} selectedSurveyId={surveyId} onSelect={setSurveyId} onClear={() => setSurveyId('')} isSurveySelectable={(survey) => isSurveyAssignableToEventTarget(survey, eventId)} /></div>
            </div>
            {error && <p role="alert" className="mt-5 text-sm font-medium text-red-700 dark:text-red-300">{error}</p>}
            <div className="mt-8 flex justify-end gap-3"><Button type="button" variant="secondary" onClick={closeDialog} disabled={saving}>Cancel</Button><Button type="button" onClick={() => { void saveArea() }} disabled={saving}>{saving ? 'Saving...' : editingItem ? 'Save changes' : 'Create Event Area'}</Button></div>
          </div>
          <aside className="border-t border-violet-100 bg-violet-50 p-6 sm:p-8 md:border-l md:border-t-0 dark:border-violet-900/60 dark:bg-violet-950/20"><h3 className="text-lg font-bold text-slate-950 dark:text-white">Choose the right type</h3><div className="mt-5 space-y-5">{AREA_TYPES.map((type) => <div key={type.kind}><p className="font-semibold text-slate-900 dark:text-zinc-100">{type.label}</p><p className="mt-1 text-sm leading-5 text-slate-600 dark:text-zinc-300">{type.description}</p></div>)}</div><p className="mt-6 border-t border-violet-200 pt-4 text-sm font-medium text-slate-600 dark:border-violet-900/60 dark:text-zinc-300">Sessions and speakers have their own pages — attach feedback to them there.</p></aside>
        </div>
      </div>
    </div>}
  </section>
}
