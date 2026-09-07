import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/app/events/SurveyAvailabilityEditor.tsx', 'utf8')

describe('SurveyAvailabilityEditor response window UX', () => {
  it('uses plain-language scheduling modes, flexible offsets, and an availability preview', () => {
    expect(source).toContain('Response window')
    expect(source).toContain('Always open')
    expect(source).toContain('Schedule around this survey')
    expect(source).toContain('Choose exact dates & times')
    expect(source).toContain('Availability preview:')
    expect(source).toContain('minutes')
    expect(source).toContain('hours')
    expect(source).toContain('days')
    expect(source).toContain('Based on:')
    expect(source).not.toContain('Relative to Survey Focus')
    expect(source).not.toContain('Manual override')
  })

  it('explains unavailable scheduling with the shared accessible tooltip', () => {
    expect(source).toContain("import { InfoTooltip } from '@/components/ui/InfoTooltip'")
    expect(source).toContain('scheduleUnavailableReason?: string')
    expect(source).toContain('unavailableReason')
    expect(source).toContain('ariaLabel={`${option.label} is unavailable: ${unavailableReason}`}')
    expect(source).not.toContain('title=')
    expect(source).toContain('Add schedule details to use this option.')
  })

  it('supports Advanced Event labels and a canonical locked event timezone without changing the default copy', () => {
    expect(source).toContain("advancedLabels ? 'Availability model' : 'Response window'")
    expect(source).toContain("advancedLabels ? 'Relative to session' : 'Schedule around this survey'")
    expect(source).toContain("advancedLabels ? 'Fixed window' : 'Choose exact dates & times'")
    expect(source).toContain('disabled={disabled || lockTimezone}')
    expect(source).toContain('Relative availability presets')
    expect(source).toContain('30 min before · 2 hr after')
  })

  it('uses the shared Events calendar with the established time field instead of a browser datetime picker', () => {
    expect(source).toContain("import { EventDatePicker } from '@/components/app/events/EventDatePicker'")
    expect(source).toContain('<EventDatePicker aria-label={`${label} date`}')
    expect(source).toContain('aria-label={`${label} time`}')
    expect(source).not.toContain('type="datetime-local"')
  })
})
