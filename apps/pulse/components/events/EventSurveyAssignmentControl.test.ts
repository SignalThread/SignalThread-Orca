import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { surveyAssignmentTriggerLabel } from './EventSurveyAssignmentControl'
import type { SurveyLibraryItem } from './EventSurveyLibraryPicker'

const source = readFileSync('components/events/EventSurveyAssignmentControl.tsx', 'utf8')

describe('EventSurveyAssignmentControl', () => {
  it('keeps the toolbar hidden at rest, then reveals it for the parent row hover or an open popup', () => {
    expect(source).toContain('event-survey-assignment-toolbar invisible absolute')
    expect(source).toContain('group-hover:visible')
    expect(source).toContain('group-hover:opacity-100')
    expect(source).toContain('data-[open=true]:visible')
    expect(source).toContain('transition-[opacity,transform] duration-[120ms]')
    expect(source).toContain('absolute right-4 top-1/2')
  })

  it('renders Attach, then Swap from the persisted assignment after attach and reload, then Attach after detach', () => {
    const persistedSurvey = { id: 'persisted-survey', name: 'Persisted feedback', status: 'ACTIVE', targetType: 'SESSION' as const, questionCount: 2, eventId: 'event_1' }
    let canonicalAssignment: SurveyLibraryItem | null = null
    expect(surveyAssignmentTriggerLabel(canonicalAssignment)).toBe('↔ Attach')

    // Mutation succeeds and the canonical assignment query returns its target.
    canonicalAssignment = persistedSurvey
    expect(surveyAssignmentTriggerLabel(canonicalAssignment)).toBe('↔ Swap')

    // A full reload receives the same persisted assignment.
    canonicalAssignment = { ...persistedSurvey }
    expect(surveyAssignmentTriggerLabel(canonicalAssignment)).toBe('↔ Swap')

    // The detached canonical response has no attached survey.
    canonicalAssignment = null
    expect(surveyAssignmentTriggerLabel(canonicalAssignment)).toBe('↔ Attach')
    expect(source).toContain('export function surveyAssignmentTriggerLabel')
    expect(source).toContain("return assignedSurvey ? '↔ Swap' : '↔ Attach'")
    expect(source).toContain('assignedSurvey?.id ?? \'\'')
    expect(source).not.toContain('setAssignedSurvey')
  })

  it('uses the shared searchable picker for direct Attach and Swap without changing row layout', () => {
    expect(source).toContain('triggerLabel={surveyAssignmentTriggerLabel(assignedSurvey)}')
    expect(source).toContain('showSelectedInTrigger={false}')
    expect(source).toContain('hideTriggerChevron')
    expect(source).not.toContain('hideTriggerChevron={assigned}')
    expect(source).toContain('onCreateSurvey={onCreateSurvey}')
    expect(source).toContain('open={pickerOpen}')
    expect(source).toContain('onOpenChange={setPickerOpen}')
    expect(source).toContain('triggerClassName="inline-flex h-8')
  })

  it('keeps the overflow available for each row and retains Change, Preview, and canonical Detach actions', () => {
    expect(source).toContain('onClick={() => setPickerOpen(true)}')
    expect(source).toContain('onOpenChange={setMenuOpen}')
    expect(source).toContain('Preview survey')
    expect(source).toContain('Detach survey')
    expect(source).toContain('onClear={onDetach}')
    expect(source).toContain('EventRowActionOverflow')
    expect(source).toContain('assigned && <button')
  })

  it('keeps only Attach or Swap and the separate overflow menu in the vertically centered toolbar', () => {
    expect(source).not.toContain('leadingAction')
    expect(source).not.toContain('>Edit<')
    expect(source).toContain('absolute right-4 top-1/2')
    expect(source).toContain('items-center gap-1')
  })
})
