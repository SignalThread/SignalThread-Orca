'use client'

import { useState, type ReactNode } from 'react'
import { EventRowActionOverflow } from '@/components/events/EventRowActionControl'
import { EventSurveyLibraryPicker, type SurveyLibraryItem } from '@/components/events/EventSurveyLibraryPicker'

interface EventSurveyAssignmentControlProps {
  entityName: string
  surveys: SurveyLibraryItem[]
  currentEventId: string
  assignedSurvey?: SurveyLibraryItem | null
  /** Completes only after the mutation's canonical assignment refresh. */
  onAssign: (surveyId: string) => void | Promise<void>
  /** Completes only after the mutation's canonical assignment refresh. */
  onDetach: () => void | Promise<void>
  onCreateSurvey?: (suggestedName: string) => void
  previewHref?: string
  isSurveySelectable?: (survey: SurveyLibraryItem) => boolean
  disabled?: boolean
  overflowActions?: ReactNode
}

const menuItemClass = 'w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800'

/**
 * One compact assignment control for an Event Area, Session, or Speaker.
 * The surrounding entity surface owns its layout; this only reserves a stable
 * action gutter and delegates assignment to the canonical picker/mutation.
 */
export function surveyAssignmentTriggerLabel(assignedSurvey?: SurveyLibraryItem | null) {
  return assignedSurvey ? '↔ Swap' : '↔ Attach'
}

export function EventSurveyAssignmentControl({ entityName, surveys, currentEventId, assignedSurvey = null, onAssign, onDetach, onCreateSurvey, previewHref, isSurveySelectable, disabled = false, overflowActions }: EventSurveyAssignmentControlProps) {
  const assigned = Boolean(assignedSurvey)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const open = pickerOpen || menuOpen

  return <div data-open={open} className="event-survey-assignment-toolbar invisible absolute right-4 top-1/2 z-20 flex -translate-y-1/2 scale-[.97] items-center gap-1 rounded-[11px] border border-[#e5e8ef] bg-white p-1 opacity-0 shadow-[0_6px_18px_rgba(11,22,56,0.14)] transition-[opacity,transform] duration-[120ms] pointer-events-none group-hover:visible group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 group-focus-within:visible group-focus-within:pointer-events-auto group-focus-within:scale-100 group-focus-within:opacity-100 data-[open=true]:visible data-[open=true]:pointer-events-auto data-[open=true]:scale-100 data-[open=true]:opacity-100" data-testid="event-survey-assignment-control">
    <EventSurveyLibraryPicker
      surveys={surveys}
      currentEventId={currentEventId}
      selectedSurveyId={assignedSurvey?.id ?? ''}
      onSelect={onAssign}
      onClear={onDetach}
      onCreateSurvey={onCreateSurvey}
      isSurveySelectable={isSurveySelectable}
      triggerLabel={surveyAssignmentTriggerLabel(assignedSurvey)}
      showSelectedInTrigger={false}
      hideTriggerChevron
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      triggerClassName="inline-flex h-8 items-center gap-1.5 rounded-lg border-0 bg-transparent px-2.5 text-xs font-semibold text-[#3546a8] hover:bg-[#f1f4f9]"
    />
    <span aria-hidden="true" className="h-[18px] w-px bg-[#eef1f6]" />
    <EventRowActionOverflow label={`More survey actions for ${entityName}`} menuClassName="!w-[12.25rem] !rounded-xl !p-1.5" triggerClassName="!h-8 !w-8 !border-0 !bg-transparent hover:!bg-[#f1f4f9]" onOpenChange={setMenuOpen}>
      <button type="button" onClick={() => setPickerOpen(true)} className={menuItemClass}>Change survey</button>
      {previewHref ? <a href={previewHref} className={menuItemClass}>Preview survey</a> : <button type="button" disabled className={menuItemClass}>Preview survey</button>}
      {assigned && <button type="button" disabled={disabled} onClick={onDetach} className={`${menuItemClass} text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30`}>Detach survey</button>}
      {overflowActions}
    </EventRowActionOverflow>
  </div>
}
