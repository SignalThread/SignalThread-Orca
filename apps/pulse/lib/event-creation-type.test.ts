import { describe, expect, it } from 'vitest'
import {
  EVENT_CREATION_TYPES,
  getEventWorkspaceExperience,
  isAdvancedEventExperience,
  isEventCreationType,
  isSimpleEventExperience,
} from './event-creation-type'

describe('event creation types', () => {
  it('exposes only the three customer-facing setup types with stable values', () => {
    expect(EVENT_CREATION_TYPES).toEqual([
      {
        value: 'TEMPLATE',
        label: 'Event Template',
        description: 'Structured setup for agenda-driven events.',
      },
      {
        value: 'BLANK',
        label: 'Simple Event',
        description: 'Create event-wide surveys without agenda or assignments.',
      },
      {
        value: 'ADVANCED',
        label: 'Advanced Event',
        description: 'Full setup with all event configuration options.',
      },
    ])
  })

  it('accepts only stable customer creation values', () => {
    expect(isEventCreationType('TEMPLATE')).toBe(true)
    expect(isEventCreationType('BLANK')).toBe(true)
    expect(isEventCreationType('ADVANCED')).toBe(true)
    expect(isEventCreationType('conference')).toBe(false)
    expect(isEventCreationType('SURVEY')).toBe(false)
    expect(isEventCreationType(undefined)).toBe(false)
  })

  it('preserves stable current creation types while mapping historical records to the compatible experience', () => {
    expect(getEventWorkspaceExperience({ eventType: 'TEMPLATE' })).toBe('TEMPLATE')
    expect(getEventWorkspaceExperience({ eventType: 'BLANK' })).toBe('SIMPLE')
    expect(getEventWorkspaceExperience({ eventType: 'BLANK', templateKey: 'blank' })).toBe('SIMPLE')
    expect(getEventWorkspaceExperience({ eventType: 'ADVANCED' })).toBe('ADVANCED')
    expect(getEventWorkspaceExperience({ eventType: 'SURVEY' })).toBe('ADVANCED')
    expect(getEventWorkspaceExperience({ eventType: 'KIOSK' })).toBe('ADVANCED')
    expect(getEventWorkspaceExperience({ eventType: 'FEEDBACK' })).toBe('ADVANCED')
    expect(getEventWorkspaceExperience({ eventType: 'UNKNOWN_LEGACY', templateKey: 'conference' })).toBe('ADVANCED')
    expect(isAdvancedEventExperience({ eventType: 'ADVANCED' })).toBe(true)
    expect(isAdvancedEventExperience({ eventType: 'TEMPLATE' })).toBe(false)
    expect(isAdvancedEventExperience({ eventType: 'BLANK' })).toBe(false)
    expect(isSimpleEventExperience({ eventType: 'BLANK' })).toBe(true)
  })
})
