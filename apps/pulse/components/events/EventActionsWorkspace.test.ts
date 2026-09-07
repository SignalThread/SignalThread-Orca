import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/events/EventActionsWorkspace.tsx', 'utf8')

describe('EventActionsWorkspace', () => {
  it('uses the approved small view set and a time-first list', () => {
    for (const label of ['Open', 'Mine', 'Unassigned', 'Done', 'Overdue', 'Next hour', 'Later today', 'After the event']) expect(source).toContain(label)
    expect(source).toContain('due in the next hour')
    expect(source).toContain('done today')
    expect(source).not.toContain("label: 'Working'")
    expect(source).not.toContain("label: 'Classification'")
  })

  it('uses the canonical action API for human creation and action updates', () => {
    expect(source).toContain('/api/app/events/${encodeURIComponent(eventId)}/actions?account=')
    expect(source).toContain('EventActionComposer')
    expect(source).toContain("operation: 'ASSIGN'")
    expect(source).toContain("operation: 'SET_DUE_DATE'")
    expect(source).toContain("operation: 'TRANSITION', status: 'COMPLETE'")
  })

  it('keeps detail lightweight and responsive rather than embedding evidence workflows', () => {
    expect(source).toContain('Why we’re doing it')
    expect(source).toContain('View evidence →')
    expect(source).toContain('Need more time')
    expect(source).toContain('Mark done')
    expect(source).toContain('max-w-xl')
    expect(source).not.toContain('EventThemeEvidencePanel')
    expect(source).not.toContain('EventActionVoiceUpdateRecorder')
  })

  it('derives colored state from due time and preserves the optional urgent flag', () => {
    expect(source).toContain('function isOverdue')
    expect(source).toContain('function isSoon')
    expect(source).toContain('action.actionUrgent')
    expect(source).toContain('m late')
  })
})
