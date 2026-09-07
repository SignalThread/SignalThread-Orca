import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calculateSurveyPickerPosition, groupSurveyLibraryItems, isSurveyAssignableToEventTarget, type SurveyLibraryItem } from './EventSurveyLibraryPicker'

const source = readFileSync('components/events/EventSurveyLibraryPicker.tsx', 'utf8')

const surveys: SurveyLibraryItem[] = [
  { id: 'current-session', name: 'Opening — Session Results', status: 'DRAFT', targetType: 'SESSION', questionCount: 2, eventId: 'event-current', eventName: 'Current event' },
  { id: 'current-speaker', name: 'Keynote speaker', status: 'ACTIVE', targetType: 'SPEAKER', questionCount: 3, eventId: 'event-current', eventName: 'Current event' },
  { id: 'current-unassigned', name: 'Unassigned attendee feedback', status: 'DRAFT', targetType: null, questionCount: 0, eventId: 'event-current', eventName: 'Current event' },
  { id: 'other-session', name: 'Past event session', status: 'ACTIVE', targetType: 'SESSION', questionCount: 1, eventId: 'event-other', eventName: 'Past event' },
  { id: 'other-speaker', name: 'Past event speaker', status: 'DRAFT', targetType: 'SPEAKER', questionCount: 4, eventId: 'event-other', eventName: 'Past event' },
]

describe('EventSurveyLibraryPicker', () => {
  it('groups the current event survey inventory by target context', () => {
    const groups = groupSurveyLibraryItems(surveys, 'event-current')
    expect(groups.current.session.map((survey) => survey.id)).toEqual(['current-session'])
    expect(groups.current.speaker.map((survey) => survey.id)).toEqual(['current-speaker'])
    expect(groups.current.unassigned.map((survey) => survey.id)).toEqual(['current-unassigned'])
    expect(groups.other.session.map((survey) => survey.id)).toEqual(['other-session'])
    expect(groups.other.speaker.map((survey) => survey.id)).toEqual(['other-speaker'])
  })

  it('preserves Event Area surveys as a selectable picker target', () => {
    const groups = groupSurveyLibraryItems([
      ...surveys,
      { id: 'current-area', name: 'Lobby feedback', status: 'DRAFT', targetType: 'AREA', questionCount: 2, eventId: 'event-current', eventName: 'Current event' },
    ], 'event-current')
    expect(groups.current.area.map((survey) => survey.id)).toEqual(['current-area'])
    expect(source).toContain("'AREA'")
    expect(source).toContain("'Event Area'")
  })

  it('keeps search results event-scoped in the rendered picker', () => {
    const groups = groupSurveyLibraryItems(surveys, 'event-current', 'speaker')
    expect(groups.current.session).toEqual([])
    expect(groups.current.speaker.map((survey) => survey.id)).toEqual(['current-speaker'])
    expect(groups.other.speaker.map((survey) => survey.id)).toEqual(['other-speaker'])
    expect(source).toContain('const visibleSurveys = currentItems')
  })

  it('keeps an unassigned survey target-neutral so every compatible assignment surface can select it', () => {
    const groups = groupSurveyLibraryItems(surveys, 'event-current', 'unassigned attendee')
    expect(groups.current.unassigned.map((survey) => survey.id)).toEqual(['current-unassigned'])
  })

  it('keeps a survey reusable by another target in the same event', () => {
    const sessionSurvey = surveys.find((survey) => survey.id === 'current-session')!
    expect(isSurveyAssignableToEventTarget(sessionSurvey, 'event-current')).toBe(true)
    expect(isSurveyAssignableToEventTarget(sessionSurvey, 'event-other')).toBe(false)
  })

  it('uses a searchable accessible combobox with compact selection and dismissal controls', () => {
    expect(source).toContain('Choose from survey library')
    expect(source).toContain('Choose a survey from this event.')
    expect(source).toContain('role="combobox"')
    expect(source).toContain('role="listbox"')
    expect(source).toContain("event.key === 'Escape'")
    expect(source).toContain("document.addEventListener('pointerdown'")
    expect(source).toContain("event.key === 'ArrowDown'")
    expect(source).toContain("event.key === 'Enter'")
    expect(source).not.toContain('Reuse from other events')
    expect(source).toContain('Change')
    expect(source).toContain('Clear')
    expect(source).toContain('createPortal')
    expect(source).toContain("window.addEventListener('scroll', place, true)")
    expect(source).toContain('overflow-y-auto')
    expect(source).toContain('height: position.maxHeight')
    expect(source).toContain('triggerRef.current?.focus()')
    expect(source).toContain('bulkContext')
    expect(source).toContain('Create new survey')
    expect(source).toContain('No survey')
    expect(source).toContain('showSelectedInTrigger')
    expect(source).toContain('hideTriggerChevron')
    expect(source).toContain('open: controlledOpen')
    expect(source).toContain('onOpenChange?.(resolved)')
    expect(source).toContain('triggerClassName')
    expect(source).not.toContain('<select')
  })

  it('waits for the owner to reconcile persisted assignment state before closing after attach, swap, or detach', () => {
    expect(source).toContain('onSelect: (surveyId: string) => void | Promise<void>')
    expect(source).toContain('onClear: () => void | Promise<void>')
    expect(source).toContain('await onSelect(survey.id)')
    expect(source).toContain('const clear = async () =>')
    expect(source).toContain('await onClear()')
    expect(source).toContain('a successful mutation is reflected immediately without optimistic state')
  })

  it('places a picker above a low trigger and keeps its header and footer inside the viewport', () => {
    const position = calculateSurveyPickerPosition({ top: 706, bottom: 746, left: 700, right: 780 }, { width: 1024, height: 800 })
    expect(position.placement).toBe('top')
    expect(position.top).toBeGreaterThanOrEqual(16)
    expect(position.top + position.maxHeight).toBeLessThanOrEqual(784)
    expect(position.left + position.width).toBeLessThanOrEqual(1008)
  })

  it('places a picker below an upper trigger and shrinks it rather than clipping it in a short viewport', () => {
    const position = calculateSurveyPickerPosition({ top: 40, bottom: 80, left: 20, right: 130 }, { width: 480, height: 420 })
    expect(position.placement).toBe('bottom')
    expect(position.maxHeight).toBeLessThan(548)
    expect(position.top).toBeGreaterThanOrEqual(16)
    expect(position.top + position.maxHeight).toBeLessThanOrEqual(404)
  })
})
