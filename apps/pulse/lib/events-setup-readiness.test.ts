import { describe, expect, it } from 'vitest'
import {
  buildEventSetupTabPath,
  deriveEventSetupReadiness,
  isAttendeeExperienceConfigured,
  parseEventSetupTab,
  resolveAgendaReadiness,
} from './events-setup-readiness'

describe('Events Setup navigation', () => {
  it('accepts the four canonical URL-backed tabs and safely maps legacy management links', () => {
    expect(parseEventSetupTab('overview')).toBe('overview')
    expect(parseEventSetupTab('areas')).toBe('operations')
    expect(parseEventSetupTab('agenda')).toBe('operations')
    expect(parseEventSetupTab('speakers')).toBe('operations')
    expect(parseEventSetupTab('surveys')).toBe('surveys')
    expect(parseEventSetupTab('operations')).toBe('operations')
    expect(parseEventSetupTab('deploy')).toBe('deploy')
    expect(parseEventSetupTab('survey-focus')).toBe('overview')
    expect(parseEventSetupTab(null)).toBe('overview')
  })

  it('builds an encoded event/account URL for every selected tab', () => {
    expect(buildEventSetupTabPath('event/123', 'events co', 'operations')).toBe(
      '/app/events/event%2F123?account=events+co&tab=operations',
    )
  })
})

describe('Events Setup readiness', () => {
  it('derives attendee-experience readiness from the resolved consent configuration', () => {
    expect(isAttendeeExperienceConfigured(null)).toBe(false)
    expect(isAttendeeExperienceConfigured({ title: 'Welcome', buttonText: 'Start', items: [] })).toBe(false)
    expect(isAttendeeExperienceConfigured({
      title: 'Welcome',
      buttonText: 'Start',
      items: ['Your responses are anonymous'],
    })).toBe(true)
  })

  it('supports every durable Agenda readiness state without inventing current import data', () => {
    expect(resolveAgendaReadiness({ sessionCount: 0 })).toMatchObject({
      status: 'NOT_STARTED',
      label: 'Not started',
      actionLabel: 'Import agenda',
    })
    expect(resolveAgendaReadiness({ sessionCount: 0, importState: 'IN_PROGRESS' })).toMatchObject({
      status: 'IMPORT_IN_PROGRESS',
      label: 'Import in progress',
      actionLabel: 'Review import',
    })
    expect(resolveAgendaReadiness({ sessionCount: 0, importState: 'NEEDS_REVIEW' })).toMatchObject({
      status: 'NEEDS_REVIEW',
      label: 'Needs review',
      actionLabel: 'Review import',
    })
    expect(resolveAgendaReadiness({ sessionCount: 2 })).toMatchObject({
      status: 'READY',
      label: 'Ready',
      actionLabel: 'Manage agenda',
    })
  })

  it('derives readiness totals and collection state from real inputs', () => {
    expect(deriveEventSetupReadiness({
      hasEventDetails: true,
      eventAreaCount: 4,
      agendaSessionCount: 2,
      surveyCount: 3,
      attendeeExperienceReady: true,
      launchableSurveyCount: 2,
      uncoveredEventAreaCount: 0,
    })).toMatchObject({ readyCount: 7, totalCount: 7, collectionReady: true })

    expect(deriveEventSetupReadiness({
      hasEventDetails: true,
      eventAreaCount: 4,
      agendaSessionCount: 0,
      surveyCount: 3,
      attendeeExperienceReady: false,
      launchableSurveyCount: 2,
      uncoveredEventAreaCount: 1,
    })).toMatchObject({ readyCount: 4, totalCount: 7, collectionReady: false })
  })

  it('requires the attendee consent experience before collection is ready', () => {
    const readiness = deriveEventSetupReadiness({
      hasEventDetails: true,
      eventAreaCount: 4,
      agendaSessionCount: 2,
      surveyCount: 3,
      attendeeExperienceReady: false,
      launchableSurveyCount: 2,
      uncoveredEventAreaCount: 0,
    })

    expect(readiness).toMatchObject({
      attendeeExperienceReady: false,
      readyCount: 5,
      totalCount: 7,
      collectionReady: false,
    })
  })
})
