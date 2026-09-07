import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  SESSION_TIME_OPTIONS,
  applyStartDateSelection,
  formatSessionTimeValue,
  isSessionEndAfterStart,
  updateSessionDateTimePart,
} from './EventSessionDateTimePicker'

const source = readFileSync('components/events/EventSessionDateTimePicker.tsx', 'utf8')
const workspaceSource = readFileSync('components/events/EventAgendaWorkspace.tsx', 'utf8')
const actionComposerSource = readFileSync('components/events/EventActionComposer.tsx', 'utf8')
const actionsWorkspaceSource = readFileSync('components/events/EventActionsWorkspace.tsx', 'utf8')

describe('EventSessionDateTimePicker', () => {
  it('defaults the End date to a newly selected Start date', () => {
    expect(applyStartDateSelection('', '', '2026-09-02', false)).toEqual({
      startsAt: '2026-09-02T',
      endsAt: '2026-09-02T',
    })
    expect(workspaceSource).toContain('applyStartDateSelection(current.startsAt, current.endsAt, nextDate, endDateWasChangedRef.current)')
  })

  it('selects Start and End times as wall-time values', () => {
    expect(updateSessionDateTimePart('2026-09-02T', 'time', '09:00')).toBe('2026-09-02T09:00')
    expect(updateSessionDateTimePart('2026-09-02T', 'time', '10:00')).toBe('2026-09-02T10:00')
    expect(formatSessionTimeValue('09:00')).toBe('9:00 AM')
    expect(formatSessionTimeValue('13:15')).toBe('1:15 PM')
    expect(SESSION_TIME_OPTIONS).toContain('09:00')
    expect(SESSION_TIME_OPTIONS).toContain('10:00')
  })

  it('requires End to be later than Start and disables invalid End options', () => {
    expect(isSessionEndAfterStart('2026-09-02T09:00', '2026-09-02T10:00')).toBe(true)
    expect(isSessionEndAfterStart('2026-09-02T09:00', '2026-09-02T09:00')).toBe(false)
    expect(isSessionEndAfterStart('2026-09-02T09:00', '2026-09-02T08:45')).toBe(false)
    expect(isSessionEndAfterStart('2026-09-03T09:00', '2026-09-02T10:00')).toBe(false)
    expect(source).toContain('return candidate <= minParts.time')
    expect(workspaceSource).toContain("setError('End must be later than Start.')")
  })

  it('does not overwrite an End date the user intentionally changed', () => {
    expect(applyStartDateSelection(
      '2026-09-02T09:00',
      '2026-09-04T10:00',
      '2026-09-03',
      true,
    )).toEqual({
      startsAt: '2026-09-03T09:00',
      endsAt: '2026-09-04T10:00',
    })
    expect(workspaceSource).toContain('endDateWasChangedRef.current = true')
  })

  it('renders one combined popover with a calendar and selectable 12-hour time list', () => {
    expect(source).toContain('aria-haspopup="dialog"')
    expect(source).toContain('role="grid"')
    expect(source).toContain('role="listbox"')
    expect(source).toContain('formatSessionTimeValue(option)')
    expect(source).not.toContain('type="time"')
    expect(source).not.toContain('placeholder="HH:MM"')
  })

  it('is the only date/time control used by the action experience', () => {
    expect(actionComposerSource).toContain('EventSessionDateTimePicker')
    expect(actionsWorkspaceSource).toContain('EventSessionDateTimePicker')
    expect(actionComposerSource).not.toContain('type="datetime-local"')
    expect(actionsWorkspaceSource).not.toContain('type="datetime-local"')
    expect(actionComposerSource).not.toContain('type="date"')
    expect(actionComposerSource).not.toContain('type="time"')
    expect(actionsWorkspaceSource).not.toContain('type="date"')
    expect(actionsWorkspaceSource).not.toContain('type="time"')
    expect(source).toContain('clearable = false')
    expect(source).toContain('Clear due date')
  })
})
