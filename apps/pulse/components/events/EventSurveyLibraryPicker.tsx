'use client'

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { EVENT_ROW_ACTION_PRIMARY_CLASS, EVENT_ROW_ACTION_SECONDARY_CLASS } from '@/components/events/EventRowActionControl'
import { EventRowStatus } from '@/components/events/EventRowStatus'
import { resolveEventRowActions } from '@/lib/event-row-actions'

export type SurveyLibraryTarget = 'SESSION' | 'SPEAKER' | 'AREA' | null

export interface SurveyLibraryItem {
  id: string
  name: string
  status: string
  targetType: SurveyLibraryTarget
  questionCount: number
  eventId: string
  eventName?: string | null
}

/**
 * Assignment compatibility is event-scoped, not assignment-scoped. A survey
 * already used by a session, speaker, or area remains reusable by another
 * target in the same event. The selectedSurveyId prop separately identifies
 * whether this exact target already uses the survey.
 */
export function isSurveyAssignableToEventTarget(survey: SurveyLibraryItem, currentEventId: string) {
  return survey.eventId === currentEventId
}

export function groupSurveyLibraryItems(surveys: SurveyLibraryItem[], currentEventId: string, query = '') {
  const normalizedQuery = query.trim().toLocaleLowerCase('en-US')
  const matches = (survey: SurveyLibraryItem) => !normalizedQuery || [survey.name, survey.status, survey.eventName, targetLabel(survey.targetType)]
    .some((value) => value?.toLocaleLowerCase('en-US').includes(normalizedQuery))
  const splitTargets = (items: SurveyLibraryItem[]) => ({
    unassigned: items.filter((survey) => survey.targetType === null && matches(survey)),
    session: items.filter((survey) => survey.targetType === 'SESSION' && matches(survey)),
    speaker: items.filter((survey) => survey.targetType === 'SPEAKER' && matches(survey)),
    area: items.filter((survey) => survey.targetType === 'AREA' && matches(survey)),
  })
  return {
    current: splitTargets(surveys.filter((survey) => survey.eventId === currentEventId)),
    other: splitTargets(surveys.filter((survey) => survey.eventId !== currentEventId)),
  }
}

export interface SurveyPickerPosition {
  top: number
  left: number
  width: number
  maxHeight: number
  placement: 'top' | 'bottom'
}

/** Collision-aware placement shared by row and sticky-bar pickers. */
export function calculateSurveyPickerPosition(
  anchor: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right'>,
  viewport: { width: number; height: number },
  preferredHeight = 548,
  preferredWidth = 440,
): SurveyPickerPosition {
  const edge = 16
  const gap = 10
  const width = Math.min(preferredWidth, Math.max(0, viewport.width - edge * 2))
  const below = viewport.height - anchor.bottom - edge - gap
  const above = anchor.top - edge - gap
  const placement: 'top' | 'bottom' = below < Math.min(360, preferredHeight) && above > below ? 'top' : 'bottom'
  const availableHeight = Math.max(0, placement === 'top' ? above : below)
  const maxHeight = Math.min(preferredHeight, availableHeight)
  const unclampedLeft = anchor.right - width
  const left = Math.max(edge, Math.min(unclampedLeft, viewport.width - width - edge))
  const top = placement === 'top'
    ? Math.max(edge, anchor.top - maxHeight - gap)
    : Math.min(viewport.height - maxHeight - edge, anchor.bottom + gap)
  return { top, left, width, maxHeight, placement }
}

interface EventSurveyLibraryPickerProps {
  surveys: SurveyLibraryItem[]
  currentEventId: string
  selectedSurveyId: string
  /** Resolves after the owner has reconciled its canonical assignment state. */
  onSelect: (surveyId: string) => void | Promise<void>
  /** Resolves after the owner has reconciled its canonical assignment state. */
  onClear: () => void | Promise<void>
  isSurveySelectable?: (survey: SurveyLibraryItem) => boolean
  /** A row-level action keeps the picker anchored without expanding the row. */
  triggerLabel?: string
  /** The sticky bulk-selection bar uses a high-contrast action affordance. */
  triggerTone?: 'link' | 'bulk'
  /** Keep a compact row action stable instead of appending a long survey name. */
  showSelectedInTrigger?: boolean
  /** A paired overflow control can carry the disclosure affordance. */
  hideTriggerChevron?: boolean
  /** Lets a row toolbar keep its hover treatment while this picker is open. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** A row-owned toolbar supplies its compact visual treatment. */
  triggerClassName?: string
  /** Bulk selection delays mutation until its explicit confirmation action. */
  bulkContext?: { count: number; noun: string; confirmLabel: string; onConfirm: () => void; overwriteCount?: number }
  onCreateSurvey?: (suggestedName: string) => void
}

const targetLabel = (targetType: SurveyLibraryTarget) => targetType === null ? 'Not assigned' : targetType === 'SPEAKER' ? 'Speaker' : targetType === 'AREA' ? 'Event Area' : 'Session'
const displayName = (name: string) => name.replace(/\s+—\s+(Session|Speaker) Results$/i, '')
const displayStatus = (status: string) => status.replace(/_/g, ' ').toLocaleLowerCase('en-US').replace(/^./, (letter) => letter.toLocaleUpperCase('en-US'))

export function EventSurveyLibraryPicker({ surveys, currentEventId, selectedSurveyId, onSelect, onClear, isSurveySelectable = () => true, triggerLabel, triggerTone = 'link', showSelectedInTrigger = true, hideTriggerChevron = false, open: controlledOpen, onOpenChange, triggerClassName, bulkContext, onCreateSurvey }: EventSurveyLibraryPickerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = (next: boolean | ((current: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(open) : next
    if (controlledOpen === undefined) setUncontrolledOpen(resolved)
    onOpenChange?.(resolved)
  }
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] = useState<SurveyPickerPosition | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listboxId = useId()
  const selectedSurvey = surveys.find((survey) => survey.id === selectedSurveyId) ?? null

  useEffect(() => {
    if (!open) return
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setPosition(calculateSurveyPickerPosition(rect, { width: window.innerWidth, height: window.innerHeight }))
    }
    place()
    const frame = window.requestAnimationFrame(() => { place(); searchRef.current?.focus() })
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node
      if (!rootRef.current?.contains(node) && !popoverRef.current?.contains(node)) {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  const groups = useMemo(() => groupSurveyLibraryItems(surveys, currentEventId, query), [currentEventId, query, surveys])
  const currentItems = useMemo(() => [...groups.current.unassigned, ...groups.current.session, ...groups.current.speaker, ...groups.current.area], [groups.current])
  // Assignment inventory is scoped to the active event. Target context only
  // marks this target's current survey; it never introduces cross-event reuse.
  const visibleSurveys = currentItems
  const selectableSurveys = useMemo(() => visibleSurveys.filter(isSurveySelectable), [isSurveySelectable, visibleSurveys])

  const select = async (survey: SurveyLibraryItem) => {
    if (!isSurveySelectable(survey)) return
    // The row derives Attach/Swap from its persisted assignment prop. Wait for
    // the owner to refetch that canonical data before closing this picker, so
    // a successful mutation is reflected immediately without optimistic state.
    await onSelect(survey.id)
    if (!bulkContext) setOpen(false)
    setQuery('')
  }

  const clear = async () => {
    await onClear()
    setOpen(false)
    setQuery('')
  }

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!selectableSurveys.length) return
      setActiveIndex((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + selectableSurveys.length) % selectableSurveys.length)
      return
    }
    if (event.key === 'Enter' && selectableSurveys[activeIndex]) { event.preventDefault(); select(selectableSurveys[activeIndex]) }
  }

  const rows = (items: SurveyLibraryItem[], includeEventName: boolean) => items.map((survey) => {
    const index = selectableSurveys.findIndex((item) => item.id === survey.id)
    const selectable = index >= 0
    const selected = survey.id === selectedSurveyId
    const rowActions = resolveEventRowActions({
      entityType: 'survey',
      statusIds: survey.status === 'UNPUBLISHED' || survey.status === 'CANCELLED' || survey.status === 'ARCHIVED' ? [survey.status] : [],
      survey: survey.status === 'DRAFT' ? 'draft' : 'active',
      surveysAvailable: true,
    })
    const meta = [
      includeEventName ? survey.eventName : null,
      targetLabel(survey.targetType),
      rowActions.statuses.all.length === 0 ? displayStatus(survey.status) : null,
      selected ? 'currently attached' : null,
      `${survey.questionCount} ${survey.questionCount === 1 ? 'question' : 'questions'}`,
    ].filter(Boolean).join(' · ')
    return <button
      key={survey.id}
      id={`${listboxId}-option-${survey.id}`}
      type="button"
      role="option"
      aria-selected={selected}
      aria-disabled={!selectable}
      disabled={!selectable}
      title={!selectable ? 'This survey belongs to another event.' : undefined}
      onMouseEnter={() => { if (index >= 0) setActiveIndex(index) }}
      onClick={() => select(survey)}
      className={`relative flex w-full items-center gap-3 border-l-4 px-5 py-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
        selected ? 'border-indigo-600 bg-[#eef4ff]' : index === activeIndex && selectable ? 'border-indigo-300 bg-slate-50' : 'border-transparent bg-white hover:bg-slate-50'
      }`}
    >
      <span className="min-w-0 flex-1"><span className="block truncate text-[17px] font-bold leading-5 text-slate-950">{displayName(survey.name)}</span><span className="mt-1 block truncate text-sm text-slate-500">{meta}</span></span>
      <EventRowStatus statuses={rowActions.statuses} />
      {selected && <span className="shrink-0 text-2xl font-bold text-[#2450ae]" aria-label="Selected">✓</span>}
      {index === activeIndex && selectable && !selected && <span className="shrink-0 rounded-md bg-[#edf3ff] px-2 py-1 text-xs font-bold text-[#2450ae]" aria-hidden="true">↵</span>}
    </button>
  })

  const section = (label: string, items: SurveyLibraryItem[], includeEventName: boolean) => items.length > 0 && <section className="border-b border-slate-100 last:border-b-0"><div className="flex items-center gap-3 bg-slate-50 px-5 py-3"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">{label}</p><span className="text-sm font-semibold text-slate-400">{items.length}</span></div>{rows(items, includeEventName)}</section>
  // An explicit height makes the central list the only scrollable region, so
  // headers and confirmation controls remain reachable in short viewports.
  const popupStyle: CSSProperties = position ? { top: position.top, left: position.left, width: position.width, height: position.maxHeight } : { visibility: 'hidden' }

  const popover = open && typeof document !== 'undefined' && createPortal(
    <div ref={popoverRef} className="fixed z-[100] flex flex-col overflow-hidden rounded-[22px] border border-[#d8e0ee] bg-white shadow-[0_24px_64px_rgba(15,35,77,0.24)]" style={popupStyle} data-placement={position?.placement ?? 'bottom'} data-testid="event-survey-library-popover">
      {bulkContext && <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4"><h3 className="text-xl font-bold tracking-tight text-slate-950">Attach to {bulkContext.count} {bulkContext.noun}</h3><span className="text-sm font-semibold text-[#2450ae]">Review</span></div>}
      <div className="shrink-0 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm focus-within:border-[#7391ff] focus-within:ring-2 focus-within:ring-[#c7d4ff]">
          <span className="text-2xl leading-none text-slate-400" aria-hidden="true">⌕</span>
          <input ref={searchRef} role="combobox" aria-label="Search survey library" aria-autocomplete="list" aria-expanded="true" aria-controls={listboxId} aria-activedescendant={selectableSurveys[activeIndex] ? `${listboxId}-option-${selectableSurveys[activeIndex].id}` : undefined} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }} onKeyDown={onSearchKeyDown} placeholder="Search surveys" className="min-w-0 flex-1 bg-transparent text-lg text-slate-950 outline-none placeholder:text-slate-400" />
          <kbd className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-400">Esc</kbd>
        </div>
      </div>
      <div id={listboxId} role="listbox" aria-label="Survey library" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {section('This event', currentItems, false)}
        <button type="button" role="option" aria-selected={!selectedSurvey} onClick={() => { void clear() }} className={`flex w-full items-center gap-3 border-t border-slate-100 px-5 py-3.5 text-left transition ${selectedSurvey ? 'bg-white hover:bg-slate-50' : 'bg-slate-50 text-slate-500'}`}>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-[17px] font-bold leading-5">No survey</span>
          <span className="text-sm font-medium text-slate-400">clear</span>
        </button>
        {!visibleSurveys.length && <div className="px-5 py-10 text-center text-sm text-slate-500">No surveys match your search.</div>}
      </div>
      {bulkContext?.overwriteCount ? <div className="shrink-0 border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900"><span className="font-semibold">{bulkContext.overwriteCount} selected {bulkContext.noun} already have a survey.</span> Review before replacing it.</div> : null}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
        {onCreateSurvey ? <button type="button" onClick={() => onCreateSurvey(query.trim())} className="inline-flex items-center gap-2 text-sm font-bold text-[#2450ae] hover:text-[#173d90]"><span className="text-2xl font-normal leading-none">＋</span>Create new survey</button> : <span />}
        {bulkContext ? <button type="button" disabled={!selectedSurveyId} onClick={() => { bulkContext.onConfirm(); setOpen(false) }} className="rounded-2xl bg-[#071d49] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#102b63] disabled:cursor-not-allowed disabled:opacity-45">{bulkContext.confirmLabel}</button> : <span className="text-xs font-semibold text-slate-400">↑↓ navigate · ↵ attach</span>}
      </div>
    </div>, document.body,
  )

  return <div ref={rootRef} className={triggerLabel ? 'relative inline-block' : 'relative w-full max-w-[440px]'}>
    {!triggerLabel && <><label className="text-sm font-semibold text-slate-800 dark:text-zinc-100">Choose from survey library</label><p className="mt-1 text-xs text-slate-500">Choose a survey from this event.</p></>}
    {selectedSurvey && !triggerLabel ? <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/50 px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-950">{displayName(selectedSurvey.name)}</p><p className="mt-1 text-xs text-slate-600">{targetLabel(selectedSurvey.targetType)} · {selectedSurvey.questionCount} {selectedSurvey.questionCount === 1 ? 'question' : 'questions'}</p></div><div className="flex shrink-0 gap-2"><button ref={triggerRef} type="button" className={EVENT_ROW_ACTION_PRIMARY_CLASS} onClick={() => setOpen(true)}>Change</button><button type="button" className={EVENT_ROW_ACTION_SECONDARY_CLASS} onClick={onClear}>Clear</button></div></div> : <button ref={triggerRef} type="button" role="combobox" aria-label="Choose a survey" aria-expanded={open} aria-haspopup="listbox" aria-controls={listboxId} onClick={() => setOpen((current) => !current)} className={`${triggerClassName ?? (triggerLabel ? triggerTone === 'bulk' ? 'inline-flex min-h-12 items-center gap-3 rounded-2xl bg-white px-5 py-3 text-base text-[#071d49] shadow-sm hover:bg-slate-50' : `${EVENT_ROW_ACTION_PRIMARY_CLASS} gap-2` : 'mt-2 flex w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-500 shadow-sm hover:border-indigo-300')} justify-between text-left font-semibold transition focus:outline-none focus:ring-2 focus:ring-indigo-500`}><span>{triggerLabel ?? 'Choose a survey'}{triggerLabel && selectedSurvey && showSelectedInTrigger && triggerTone !== 'bulk' ? ` · ${displayName(selectedSurvey.name)}` : ''}</span>{!hideTriggerChevron && <span aria-hidden="true">⌄</span>}</button>}
    {popover}
  </div>
}
